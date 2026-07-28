import type { QuizItem } from '../../shared/domain/studyPack';

/**
 * The rules a study session follows.
 *
 * One rule matters more than the rest: **the answer is never shown before an
 * attempt**. The evidence this feature is built on is that AI-assisted study
 * fails exactly when it becomes passive consumption — learners reading a
 * generated answer feel fluent and retain less, an illusion of competence. A
 * card that reveals itself is a summary with extra steps.
 */
export const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 } as const;
export type Rating = (typeof RATINGS)[keyof typeof RATINGS];

export const RATING_LABEL: Record<Rating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

/** A card is either waiting for an attempt or has had one. */
export type CardPhase = 'attempting' | 'revealed';

export interface QuizAttempt {
  chosenIndex: number;
  correct: boolean;
}

export function gradeQuizAttempt(item: QuizItem, chosenIndex: number): QuizAttempt {
  return { chosenIndex, correct: chosenIndex === item.answerIndex };
}

export function quizScore(attempts: readonly QuizAttempt[]): { correct: number; total: number } {
  return {
    correct: attempts.filter((attempt) => attempt.correct).length,
    total: attempts.length,
  };
}

/**
 * Anki export.
 *
 * Decks live on this server, so an export is the only way a learner can take
 * their work elsewhere. Anki's plain-text importer reads tab-separated
 * front/back, so that is what this produces — no dependency, no .apkg
 * container to get wrong.
 */
export interface ExportableCard {
  front: string;
  back: string;
  sourcePage?: number;
}

export function toAnkiTsv(cards: readonly ExportableCard[]): string {
  return cards
    .map((card) => {
      const back = card.sourcePage ? `${card.back} (p. ${card.sourcePage})` : card.back;
      return `${escapeField(card.front)}\t${escapeField(back)}`;
    })
    .join('\n');
}

/** Tabs and newlines are the format's only delimiters, so they cannot survive in a field. */
function escapeField(value: string): string {
  return value.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>').trim();
}
