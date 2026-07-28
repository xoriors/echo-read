import { createHash } from 'node:crypto';

import { Router } from 'express';

import {
  API_ROUTES,
  type ReviewCardResponse,
  type ReviewQueueResponse,
  type StudyPackResponse,
} from '../../../../shared/contracts/api';
import { ValidationError } from '../../../../shared/domain/errors';
import { pagesToText, type DocumentPage } from '../../../../shared/domain/page';
import { isRating, scheduleNext } from '../../../domain/scheduling';
import type { StudyRepository } from '../../../application/ports/studyRepository';
import type { BuildStudyPackUseCase } from '../../../application/usecases/buildStudyPack';
import { DEFAULT_TEXT_MODEL } from '../../outbound/gemini/geminiContentAnalyzer';
import { route } from './errorMiddleware';
import { requireString } from './requestParsing';

/** One sitting's worth. More due cards than this is a backlog, not a session. */
const REVIEW_QUEUE_LIMIT = 50;

export interface StudyUseCases {
  buildStudyPack: BuildStudyPackUseCase;
  studyRepository: StudyRepository;
}

/**
 * Driving adapter for the learning features.
 *
 * Every route works from `res.locals.ownerId`, never from anything the client
 * sends: a deck belongs to whoever the signed cookie says, so a request cannot
 * name someone else's.
 */
export function studyRouter({ buildStudyPack, studyRepository }: StudyUseCases): Router {
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
        return respondWith(response, existing, { rejected: 0, reused: true });
      }

      const { pack, rejected } = await buildStudyPack.execute({
        pages,
        model: DEFAULT_TEXT_MODEL,
      });

      const stored = await studyRepository.save({
        ownerId,
        title,
        kind,
        pageCount: pages.length,
        sourceHash,
        text: pagesToText(pages),
        pack,
      });

      // Take cards and questions from what was stored, not from what was
      // generated: only the stored rows carry the ids a review is graded by.
      // Pre-questions and self-explanation prompts are not stored, so those
      // come from the generated pack.
      return respondWith(
        response,
        {
          ...stored,
          preQuestions: pack.preQuestions,
          selfExplanationPrompts: pack.selfExplanationPrompts,
        },
        { rejected, reused: false },
      );
    }),
  );

  router.get(
    API_ROUTES.reviewQueue,
    route(async (_request, response) => {
      const cards = await studyRepository.dueCards(
        response.locals.ownerId,
        new Date().toISOString(),
        REVIEW_QUEUE_LIMIT,
      );

      response.json({ cards } satisfies ReviewQueueResponse);
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

  return router;
}

/** Past any real due date, so the lookup sees every card rather than only due ones. */
const FAR_FUTURE = '9999-12-31T00:00:00.000Z';

function respondWith(
  response: Parameters<Parameters<typeof route>[0]>[1],
  stored: {
    packId: string;
    documentId: string;
    model: string;
    generatedAt: string;
    flashcards: { id: string; front: string; back: string; sourcePage?: number; sourceQuote?: string; documentTitle: string; dueAt: string | null }[];
    quizItems: StudyPackResponse['quizItems'];
    preQuestions?: { question: string }[];
    selfExplanationPrompts?: { prompt: string; sourcePage?: number }[];
  },
  { rejected, reused }: { rejected: number; reused: boolean },
): void {
  response.json({
    packId: stored.packId,
    documentId: stored.documentId,
    model: stored.model,
    generatedAt: stored.generatedAt,
    flashcards: stored.flashcards,
    quizItems: stored.quizItems,
    preQuestions: stored.preQuestions ?? [],
    selfExplanationPrompts: stored.selfExplanationPrompts ?? [],
    rejected,
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
