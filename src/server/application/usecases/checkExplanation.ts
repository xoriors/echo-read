import { ValidationError } from '../../../shared/domain/errors';
import {
  emptyFeedback,
  MIN_EXPLANATION_CHARACTERS,
  type ExplanationFeedback,
  type FeedbackPoint,
} from '../../../shared/domain/explanationFeedback';
import { pageWindow, quoteOccursOnPage, type DocumentPage } from '../../../shared/domain/page';
import { labelPages } from '../../../shared/domain/pageBatching';
import { explanationFeedbackPrompt } from '../../domain/prompts';
import { EXPLANATION_FEEDBACK_SCHEMA } from '../../domain/explanationFeedbackSchema';
import type { ContentAnalyzer } from '../ports/contentAnalyzer';
import type { Logger } from '../ports/logger';

/**
 * How much of the document is shown when grading one explanation.
 *
 * A prompt about page 40 is answered from the pages around page 40; the rest of
 * a book is cost without context. Generous enough that an idea spanning a few
 * pages is not cut in half.
 */
export const EXPLANATION_SOURCE_CHARACTERS = 12_000;

/** More than this from one submission is a wall of text, not feedback. */
export const MAX_POINTS_PER_LIST = 6;

export interface CheckExplanationCommand {
  prompt: string;
  answer: string;
  pages: readonly DocumentPage[];
  /** The page the prompt was drawn from, if it cited one. */
  sourcePage: number | null;
}

export interface CheckExplanationResult {
  feedback: ExplanationFeedback;
  /** Points discarded for citing a page the source does not support. */
  unverified: number;
}

/**
 * Grades what a learner wrote in their own words.
 *
 * The one thing that makes this different from the rest of the study pack is
 * that the learner produced the material — so the model's job is judging, not
 * generating, and everything it says is still a claim to be checked. Points are
 * verified exactly as generated items are: the quote must occur on the page it
 * cites, or the point goes. Feedback that cites a page which does not say what
 * it claims is worse than feedback with no citation at all, because a learner
 * who checks it loses trust in the parts that were right.
 */
export class CheckExplanationUseCase {
  constructor(
    private readonly analyzer: ContentAnalyzer,
    private readonly logger: Logger,
  ) {}

  async execute(command: CheckExplanationCommand): Promise<CheckExplanationResult> {
    const answer = command.answer.trim();

    // Checked here as well as in the browser: a two-word answer would cost a
    // model call to be told it is a two-word answer.
    if (answer.length < MIN_EXPLANATION_CHARACTERS) {
      throw new ValidationError(
        `Write a little more — at least ${MIN_EXPLANATION_CHARACTERS} characters, in your own words.`,
      );
    }

    const window = pageWindow(command.pages, command.sourcePage, EXPLANATION_SOURCE_CHARACTERS);
    if (window.length === 0) throw new ValidationError('The source for this prompt is missing');

    const { text } = await this.analyzer.analyze({
      prompt: explanationFeedbackPrompt(command.prompt, answer, labelPages(window), {
        firstPage: window[0].number,
        lastPage: window[window.length - 1].number,
      }),
      responseSchema: EXPLANATION_FEEDBACK_SCHEMA,
    });

    const { feedback, unverified } = verifyFeedback(parse(text), window);

    this.logger.info('Explanation graded', {
      pages: `${window[0].number}-${window[window.length - 1].number}`,
      covered: feedback.covered.length,
      missed: feedback.missed.length,
      incorrect: feedback.incorrect.length,
      unverified,
    });

    return { feedback, unverified };
  }
}

/** The model answers against a schema, but a truncated response is still possible. */
function parse(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function verifyFeedback(
  raw: Record<string, unknown>,
  pages: readonly DocumentPage[],
): { feedback: ExplanationFeedback; unverified: number } {
  const feedback = emptyFeedback();
  let unverified = 0;

  const keep = (value: unknown): FeedbackPoint[] => {
    const points: FeedbackPoint[] = [];

    for (const entry of Array.isArray(value) ? (value as Record<string, unknown>[]) : []) {
      const { point, sourcePage, sourceQuote } = entry;

      const grounded =
        typeof point === 'string' &&
        point.trim().length > 0 &&
        typeof sourcePage === 'number' &&
        typeof sourceQuote === 'string' &&
        quoteOccursOnPage(pages, sourcePage, sourceQuote);

      if (!grounded) {
        unverified++;
        continue;
      }

      if (points.length < MAX_POINTS_PER_LIST) {
        points.push({ point, sourcePage, sourceQuote });
      }
    }

    return points;
  };

  feedback.covered = keep(raw.covered);
  feedback.missed = keep(raw.missed);
  feedback.incorrect = keep(raw.incorrect);
  feedback.summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';

  return { feedback, unverified };
}
