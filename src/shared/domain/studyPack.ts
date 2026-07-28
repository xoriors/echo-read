/**
 * What a document turns into when the goal is learning rather than listening.
 *
 * The research this feature is built on is blunt that a longer summary is a
 * weak learning tool — Dunlosky rates summarising, highlighting and rereading
 * "low utility", and only practice testing and distributed practice "high".
 * So a study pack is not prose about the document; it is a set of things the
 * reader has to answer.
 *
 * Every item carries where it came from. `sourcePage` is the citation and
 * `sourceQuote` is what makes the citation checkable — a page reference the
 * model asserted but cannot support is dropped rather than shown.
 */

/** Asked *before* reading, so attention has somewhere to go. */
export interface PreQuestion {
  question: string;
}

export interface Flashcard {
  front: string;
  back: string;
  sourcePage?: number;
  sourceQuote?: string;
}

/**
 * Bloom's levels, coarsened to what a generator can be held to. Recall items
 * are cheap to produce and cheap to answer; the higher levels are what make a
 * deck worth more than a glossary.
 */
export const BLOOM_LEVELS = ['recall', 'understand', 'apply', 'analyse'] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

export interface QuizItem {
  stem: string;
  /** Exactly one is correct; the rest must be plausible but unambiguously wrong. */
  options: string[];
  answerIndex: number;
  /** Why the answer is right — shown only after an attempt. */
  rationale?: string;
  bloomLevel?: BloomLevel;
  sourcePage?: number;
  sourceQuote?: string;
}

/** "Explain this in your own words" — generative effort, not recognition. */
export interface SelfExplanationPrompt {
  prompt: string;
  sourcePage?: number;
}

export interface StudyPack {
  preQuestions: PreQuestion[];
  flashcards: Flashcard[];
  quizItems: QuizItem[];
  selfExplanationPrompts: SelfExplanationPrompt[];
  /**
   * Which model produced this, for the AI-generated disclosure the EU AI Act
   * requires from 2 August 2026, and for invalidating packs when the prompt or
   * the model chain changes.
   */
  model: string;
}

export const OPTIONS_PER_QUIZ_ITEM = 4;

export function isBloomLevel(value: unknown): value is BloomLevel {
  return typeof value === 'string' && (BLOOM_LEVELS as readonly string[]).includes(value);
}

export function emptyStudyPack(model: string): StudyPack {
  return { preQuestions: [], flashcards: [], quizItems: [], selfExplanationPrompts: [], model };
}

export function studyPackSize(pack: StudyPack): number {
  return pack.flashcards.length + pack.quizItems.length;
}
