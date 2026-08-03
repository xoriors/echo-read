import { createHash } from 'node:crypto';

import { Router } from 'express';

import {
  API_ROUTES,
  type ExplainCheckResponse,
  type ReviewCardResponse,
  type ReviewQuestionResponse,
  type ReviewQueueResponse,
  type StudyPackResponse,
} from '../../../../shared/contracts/api';
import { ValidationError } from '../../../../shared/domain/errors';
import type { DocumentPage } from '../../../../shared/domain/page';
import { isRating, ratingForQuizAttempt, scheduleNext } from '../../../domain/scheduling';
import type { StoredStudyPack, StudyRepository } from '../../../application/ports/studyRepository';
import type { BuildStudyPackUseCase } from '../../../application/usecases/buildStudyPack';
import type { CheckExplanationUseCase } from '../../../application/usecases/checkExplanation';
import { DEFAULT_TEXT_MODEL } from '../../outbound/gemini/geminiContentAnalyzer';
import { route } from './errorMiddleware';
import { requireString } from './requestParsing';

/** One sitting's worth. More due cards than this is a backlog, not a session. */
const REVIEW_QUEUE_LIMIT = 50;

export interface StudyUseCases {
  buildStudyPack: BuildStudyPackUseCase;
  checkExplanation: CheckExplanationUseCase;
  studyRepository: StudyRepository;
}

/**
 * Driving adapter for the learning features.
 *
 * Every route works from `res.locals.ownerId`, never from anything the client
 * sends: a deck belongs to whoever the signed cookie says, so a request cannot
 * name someone else's.
 */
export function studyRouter({
  buildStudyPack,
  checkExplanation,
  studyRepository,
}: StudyUseCases): Router {
  const router = Router();

  router.post(
    API_ROUTES.studyPack,
    route(async (request, response) => {
      const ownerId = response.locals.ownerId;
      const title = requireString(request.body, 'title', 'Title');
      const kind = requireString(request.body, 'kind', 'Kind');
      const pages = pagesOf(request.body);

      await studyRepository.ensureOwner(ownerId);

      // Generating a deck for a book is dozens of model calls, so an identical
      // document is answered from what was already built rather than paid for
      // twice.
      const sourceHash = hashOf(pages);
      const existing = await studyRepository.findPackBySource(ownerId, sourceHash);
      if (existing) {
        return respondWith(response, existing, { rejected: 0, failedSections: 0, reused: true });
      }

      const { pack, rejected, failedBatches } = await buildStudyPack.execute({
        pages,
        model: DEFAULT_TEXT_MODEL,
      });

      const stored = await studyRepository.save({
        ownerId,
        title,
        kind,
        pages,
        sourceHash,
        pack,
      });

      // Everything comes from what was stored, not from what was generated:
      // only the stored rows carry the ids a review is graded by and an
      // explanation is answered against.
      return respondWith(response, stored, {
        rejected,
        failedSections: failedBatches,
        reused: false,
      });
    }),
  );

  router.get(
    API_ROUTES.reviewQueue,
    route(async (_request, response) => {
      const ownerId = response.locals.ownerId;
      const now = new Date().toISOString();

      const [cards, questions] = await Promise.all([
        studyRepository.dueCards(ownerId, now, REVIEW_QUEUE_LIMIT),
        studyRepository.dueQuizItems(ownerId, now, REVIEW_QUEUE_LIMIT),
      ]);

      response.json({ cards, questions } satisfies ReviewQueueResponse);
    }),
  );

  router.post(
    API_ROUTES.reviewCard,
    route(async (request, response) => {
      const ownerId = response.locals.ownerId;
      const cardId = requireString(request.body, 'cardId', 'Card');
      const rating: unknown = request.body?.rating;

      if (!isRating(rating)) {
        throw new ValidationError('Rating must be 1 (again), 2 (hard), 3 (good) or 4 (easy)');
      }

      // Scheduling from the card's stored state, not from anything the client
      // supplies: otherwise a caller could hand itself an easy schedule.
      const [card] = await studyRepository.dueCards(ownerId, FAR_FUTURE, REVIEW_QUEUE_LIMIT).then(
        (cards) => cards.filter((candidate) => candidate.id === cardId),
      );

      const schedule = scheduleNext({
        stability: card?.stability ?? null,
        difficulty: card?.difficulty ?? null,
        lastReviewedAt: card?.dueAt ?? null,
        rating: rating as number,
        now: new Date(),
      });

      const graded = await studyRepository.recordReview({
        ownerId,
        cardId,
        rating: rating as number,
        stability: schedule.stability,
        difficulty: schedule.difficulty,
        dueAt: schedule.dueAt,
      });

      // The card is not this owner's, or does not exist. Saying so beats
      // returning a due date for a review that was never recorded.
      if (!graded) throw new ValidationError('Unknown card');

      response.json({ dueAt: schedule.dueAt } satisfies ReviewCardResponse);
    }),
  );

  router.post(
    API_ROUTES.reviewQuestion,
    route(async (request, response) => {
      const ownerId = response.locals.ownerId;
      const quizItemId = requireString(request.body, 'quizItemId', 'Question');
      const chosenIndex: unknown = request.body?.chosenIndex;

      if (typeof chosenIndex !== 'number' || !Number.isInteger(chosenIndex) || chosenIndex < 0) {
        throw new ValidationError('Chosen option must be an option number');
      }

      // The stored question decides what is correct, not the caller. A client
      // that reported its own result could hand itself an easy schedule, which
      // is the same reason a card is scheduled from stored state.
      const [item] = await studyRepository
        .dueQuizItems(ownerId, FAR_FUTURE, REVIEW_QUEUE_LIMIT)
        .then((items) => items.filter((candidate) => candidate.id === quizItemId));

      if (!item) throw new ValidationError('Unknown question');

      const correct = chosenIndex === item.answerIndex;
      const schedule = scheduleNext({
        stability: item.stability,
        difficulty: item.difficulty,
        lastReviewedAt: item.dueAt,
        rating: ratingForQuizAttempt(correct),
        now: new Date(),
      });

      const recorded = await studyRepository.recordQuizAttempt({
        ownerId,
        quizItemId,
        chosenIndex,
        correct,
        stability: schedule.stability,
        difficulty: schedule.difficulty,
        dueAt: schedule.dueAt,
      });

      if (!recorded) throw new ValidationError('Unknown question');

      response.json({
        correct,
        answerIndex: item.answerIndex,
        rationale: item.rationale,
        dueAt: schedule.dueAt,
      } satisfies ReviewQuestionResponse);
    }),
  );

  router.post(
    API_ROUTES.explainCheck,
    route(async (request, response) => {
      const ownerId = response.locals.ownerId;
      const explanationId = requireString(request.body, 'explanationId', 'Prompt');
      const answer = requireString(request.body, 'answer', 'Answer');

      // The prompt *and* its source are looked up by owner, so an id from
      // someone else's deck is a rejection rather than a free grading against
      // a document they cannot otherwise read.
      const context = await studyRepository.findExplanation(ownerId, explanationId);
      if (!context) throw new ValidationError('Unknown prompt');

      const { feedback, unverified } = await checkExplanation.execute({
        prompt: context.prompt,
        answer,
        pages: context.pages,
        sourcePage: context.sourcePage,
      });

      // Kept after the grading rather than before it: an attempt that never
      // drew feedback is not one the learner made.
      await studyRepository.recordExplanationAttempt({
        ownerId,
        explanationId,
        answer,
        feedback,
      });

      response.json({
        feedback,
        model: DEFAULT_TEXT_MODEL,
        unverified,
      } satisfies ExplainCheckResponse);
    }),
  );

  return router;
}

/** Past any real due date, so the lookup sees every card rather than only due ones. */
const FAR_FUTURE = '9999-12-31T00:00:00.000Z';

function respondWith(
  response: Parameters<Parameters<typeof route>[0]>[1],
  stored: StoredStudyPack,
  { rejected, failedSections, reused }: { rejected: number; failedSections: number; reused: boolean },
): void {
  response.json({
    packId: stored.packId,
    documentId: stored.documentId,
    model: stored.model,
    generatedAt: stored.generatedAt,
    flashcards: stored.flashcards,
    quizItems: stored.quizItems,
    preQuestions: stored.preQuestions,
    selfExplanationPrompts: stored.selfExplanationPrompts,
    rejected,
    failedSections,
    reused,
  } satisfies StudyPackResponse);
}

/**
 * Identifies a document by what it says, not what it is called.
 *
 * Page numbers are folded in so that re-opening the same book at a different
 * page range is a different document rather than a false cache hit.
 */
function hashOf(pages: readonly DocumentPage[]): string {
  const hash = createHash('sha256');
  for (const page of pages) hash.update(`${page.number}:${page.text}\n`);
  return hash.digest('hex');
}

function pagesOf(body: unknown): DocumentPage[] {
  const raw: unknown = (body as { pages?: unknown })?.pages;
  if (!Array.isArray(raw) || raw.length === 0) throw new ValidationError('Pages are required');

  const pages = raw
    .filter((page): page is DocumentPage =>
      typeof page === 'object' &&
      page !== null &&
      typeof (page as DocumentPage).number === 'number' &&
      typeof (page as DocumentPage).text === 'string',
    )
    .map((page) => ({ number: page.number, text: page.text }));

  if (pages.length === 0) throw new ValidationError('Pages are required');
  return pages;
}
