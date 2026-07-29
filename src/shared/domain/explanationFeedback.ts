/**
 * What comes back when a learner explains something in their own words.
 *
 * Self-explanation is the one *generative* task in a study pack — flashcards
 * and questions test recognition and recall, this is the one that makes someone
 * produce an explanation. That only works if something answers it. A prompt with
 * nowhere to write is a suggestion, and the evidence this whole feature rests on
 * is that learners judge their own understanding badly, so "compare it yourself"
 * gives the work back to the faculty least able to do it.
 *
 * Feedback is split three ways rather than scored, because a number says how
 * well someone did and this says what to do next. Every point cites the page it
 * rests on, and — as with the pack — a citation the source cannot support is
 * discarded rather than shown, since a page reference nobody can follow is worse
 * than none: it looks verified.
 */
export interface FeedbackPoint {
  point: string;
  sourcePage: number;
  sourceQuote: string;
}

export interface ExplanationFeedback {
  /** What the learner got right, in the source's terms. */
  covered: FeedbackPoint[];
  /** What the source treats as central and the explanation left out. */
  missed: FeedbackPoint[];
  /** Claims the source contradicts. Empty is the common case, and fine. */
  incorrect: FeedbackPoint[];
  /** One or two sentences a learner reads first. */
  summary: string;
}

export function emptyFeedback(): ExplanationFeedback {
  return { covered: [], missed: [], incorrect: [], summary: '' };
}

export function feedbackPointCount(feedback: ExplanationFeedback): number {
  return feedback.covered.length + feedback.missed.length + feedback.incorrect.length;
}

/**
 * The shortest an answer can be and still be an explanation.
 *
 * Checked in the browser and again on the server: a two-word answer costs a
 * model call to be told it is a two-word answer, and the learner is better
 * served by being asked for more before they wait.
 */
export const MIN_EXPLANATION_CHARACTERS = 40;
