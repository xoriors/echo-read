import { messageOf, UpstreamError, ValidationError } from '../../../shared/domain/errors';
import { quoteOccursOnPage, type DocumentPage } from '../../../shared/domain/page';
import {
  batchPages,
  estimateGeneration,
  itemsForBatch,
  mergeBatchItems,
  type GenerationEstimate,
  type PageBatch,
} from '../../../shared/domain/pageBatching';
import {
  emptyStudyPack,
  isBloomLevel,
  OPTIONS_PER_QUIZ_ITEM,
  type Flashcard,
  type PreQuestion,
  type QuizItem,
  type SelfExplanationPrompt,
  type StudyPack,
} from '../../../shared/domain/studyPack';
import { studyPackPrompt } from '../../domain/prompts';
import { STUDY_PACK_RESPONSE_SCHEMA } from '../../domain/studyPackSchema';
import type { ContentAnalyzer } from '../ports/contentAnalyzer';
import type { Logger } from '../ports/logger';

/** Ceiling on a single deck. A book should not yield a thousand cards nobody reviews. */
export const MAX_FLASHCARDS = 120;
export const MAX_QUIZ_ITEMS = 60;

/**
 * Batches generated at once.
 *
 * Small on purpose: a long document is dozens of calls, and firing them all
 * would collide with the provider's rate limits — the very condition the model
 * fallback exists to survive. Three keeps a book moving without turning every
 * request into a retry storm.
 */
export const BATCH_CONCURRENCY = 3;

export interface BuildStudyPackCommand {
  pages: readonly DocumentPage[];
  /** Model name recorded on the pack, for the AI-generated disclosure. */
  model: string;
}

export interface StudyPackResult {
  pack: StudyPack;
  estimate: GenerationEstimate;
  /** Items the model produced that failed verification and were discarded. */
  rejected: number;
  /**
   * Sections of the document that could not be generated at all.
   *
   * Distinct from `rejected`: those are items the model wrote and we threw
   * away, this is material the model never got to. A reader deciding whether
   * their deck covers the document needs to know the difference.
   */
  failedBatches: number;
}

/**
 * Turns a whole document into a study pack, however long it is.
 *
 * The constraint that shapes this is output, not input: a model can read a
 * book in one call but cannot write a deck for one. So each batch of pages is
 * asked separately and the results are merged in code — deterministically,
 * rather than by a further model call that could hallucinate during the merge.
 *
 * Everything the model returns is treated as a claim, not a fact. An item
 * whose quote cannot be found on the page it cites is discarded, because a
 * citation nobody can follow is worse than no citation: it looks verified.
 */
export class BuildStudyPackUseCase {
  constructor(
    private readonly analyzer: ContentAnalyzer,
    private readonly logger: Logger,
  ) {}

  async execute({ pages, model }: BuildStudyPackCommand): Promise<StudyPackResult> {
    if (pages.length === 0) throw new ValidationError('A document is required');

    const batches = batchPages(pages);
    const estimate = estimateGeneration(batches);

    this.logger.info('Generating study pack', {
      pages: pages.length,
      batches: estimate.batches,
      estimatedItems: estimate.estimatedItems,
    });

    const results = await this.runBatches(batches, pages);

    // Every section failed, so there is nothing to show and nothing partial to
    // salvage. Returning an empty pack here would present a total failure as a
    // finished deck — the reader sees "no flashcards in this pack" beside a
    // notice saying it was generated, and has no idea their quota ran out.
    const failedBatches = results.filter((result) => result.failed).length;
    if (failedBatches === results.length && results.length > 0) {
      throw new UpstreamError(
        `Could not generate a study pack: ${results[results.length - 1].reason ?? 'the model did not respond'}`,
      );
    }

    const rejected = results.reduce((total, result) => total + result.rejected, 0);
    const pack: StudyPack = {
      ...emptyStudyPack(model),
      flashcards: mergeBatchItems(
        results.map((result) => result.flashcards.map(keyedByFront)),
        { limit: MAX_FLASHCARDS },
      ).map(stripKey),
      quizItems: mergeBatchItems(
        results.map((result) => result.quizItems.map(keyedByStem)),
        { limit: MAX_QUIZ_ITEMS },
      ).map(stripKey),
      // Pre-questions belong to the start of the document: they are meant to be
      // read before the material, so a book's worth from every batch is noise.
      preQuestions: results.flatMap((result) => result.preQuestions).slice(0, 5),
      selfExplanationPrompts: results.flatMap((result) => result.selfExplanationPrompts).slice(0, 10),
    };

    this.logger.info('Study pack generated', {
      flashcards: pack.flashcards.length,
      quizItems: pack.quizItems.length,
      rejected,
      failedBatches,
    });

    return { pack, estimate, rejected, failedBatches };
  }

  /** Runs batches a few at a time, in order, tolerating individual failures. */
  private async runBatches(
    batches: readonly PageBatch[],
    pages: readonly DocumentPage[],
  ): Promise<BatchOutcome[]> {
    const outcomes: BatchOutcome[] = [];

    for (let start = 0; start < batches.length; start += BATCH_CONCURRENCY) {
      const window = batches.slice(start, start + BATCH_CONCURRENCY);
      const settled = await Promise.all(window.map((batch) => this.runBatch(batch, pages)));
      outcomes.push(...settled);
    }

    return outcomes;
  }

  /**
   * One batch. A failure here yields nothing rather than propagating: losing a
   * chapter's cards is a worse outcome than a smaller deck, but it is a far
   * better one than losing the whole book to a single overloaded call.
   *
   * It is recorded rather than merely logged, though. Swallowing the failure
   * silently is right for one batch out of twenty and badly wrong for one out
   * of one — the caller needs to tell a thin deck from a failed generation.
   */
  private async runBatch(batch: PageBatch, pages: readonly DocumentPage[]): Promise<BatchOutcome> {
    try {
      const { text } = await this.analyzer.analyze({
        prompt: studyPackPrompt(batch.labelledText, {
          firstPage: batch.firstPage,
          lastPage: batch.lastPage,
          itemCount: itemsForBatch(batch),
        }),
        responseSchema: STUDY_PACK_RESPONSE_SCHEMA,
      });

      return verifyBatch(parseBatch(text), batch, pages);
    } catch (error) {
      const reason = messageOf(error);

      this.logger.warn('Batch failed; continuing without it', {
        batch: batch.index,
        pages: `${batch.firstPage}-${batch.lastPage}`,
        reason,
      });

      return { ...emptyOutcome(), failed: true, reason };
    }
  }
}

interface BatchOutcome {
  preQuestions: PreQuestion[];
  flashcards: Flashcard[];
  quizItems: QuizItem[];
  selfExplanationPrompts: SelfExplanationPrompt[];
  rejected: number;
  /** The call never returned usable output — as opposed to returning none. */
  failed: boolean;
  /** Why, kept so the reader can be told rather than just the log. */
  reason?: string;
}

const emptyOutcome = (): BatchOutcome => ({
  preQuestions: [],
  flashcards: [],
  quizItems: [],
  selfExplanationPrompts: [],
  rejected: 0,
  failed: false,
});

/** The model answers against a schema, but a truncated response is still possible. */
function parseBatch(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Keeps only what the source actually supports.
 *
 * The page must be one this batch contained — a batch cannot know anything
 * about pages it was not shown — and the quote must occur on it. Options are
 * checked too: a question whose "wrong" answers include a duplicate of the
 * right one is not a question.
 */
function verifyBatch(
  raw: Record<string, unknown>,
  batch: PageBatch,
  pages: readonly DocumentPage[],
): BatchOutcome {
  const outcome = emptyOutcome();
  const inBatch = (page: unknown): page is number =>
    typeof page === 'number' && page >= batch.firstPage && page <= batch.lastPage;

  const cited = (page: unknown, quote: unknown): boolean =>
    inBatch(page) && typeof quote === 'string' && quoteOccursOnPage(pages, page, quote);

  for (const card of asArray(raw.flashcards)) {
    const { front, back, sourcePage, sourceQuote } = card;

    if (!isNonEmpty(front) || !isNonEmpty(back) || !cited(sourcePage, sourceQuote)) {
      outcome.rejected++;
      continue;
    }

    outcome.flashcards.push({
      front,
      back,
      sourcePage: sourcePage as number,
      sourceQuote: sourceQuote as string,
    });
  }

  for (const item of asArray(raw.quizItems)) {
    const options: string[] = Array.isArray(item.options)
      ? (item.options as unknown[]).filter(isNonEmpty)
      : [];
    const answerIndex = item.answerIndex;

    const stem = item.stem;
    const wellFormed =
      isNonEmpty(stem) &&
      options.length === OPTIONS_PER_QUIZ_ITEM &&
      new Set(options.map((option) => option.trim().toLowerCase())).size === OPTIONS_PER_QUIZ_ITEM &&
      typeof answerIndex === 'number' &&
      answerIndex >= 0 &&
      answerIndex < options.length;

    if (!wellFormed || !cited(item.sourcePage, item.sourceQuote)) {
      outcome.rejected++;
      continue;
    }

    outcome.quizItems.push({
      stem: stem as string,
      options,
      answerIndex,
      rationale: isNonEmpty(item.rationale) ? (item.rationale as string) : undefined,
      bloomLevel: isBloomLevel(item.bloomLevel) ? item.bloomLevel : undefined,
      sourcePage: item.sourcePage as number,
      sourceQuote: item.sourceQuote as string,
    });
  }

  for (const pre of asArray(raw.preQuestions)) {
    const question = pre.question;
    if (isNonEmpty(question)) outcome.preQuestions.push({ question });
  }

  for (const entry of asArray(raw.selfExplanationPrompts)) {
    const prompt = entry.prompt;
    if (!isNonEmpty(prompt)) continue;

    outcome.selfExplanationPrompts.push({
      prompt,
      sourcePage: inBatch(entry.sourcePage) ? entry.sourcePage : undefined,
    });
  }

  return outcome;
}

// The merge works on a `key`; these carry the item alongside it and back again.
const keyedByFront = (card: Flashcard) => ({ key: card.front, item: card });
const keyedByStem = (item: QuizItem) => ({ key: item.stem, item });
const stripKey = <T>({ item }: { item: T }): T => item;

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
