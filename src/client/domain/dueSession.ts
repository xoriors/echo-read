import type { ScheduledCardResponse, ScheduledQuizResponse } from '../../shared/contracts/api';

/**
 * One sitting's worth of due work, of both kinds.
 *
 * Cards and questions are scheduled separately but reviewed together, because
 * the schedule is one thing: being handed "your cards" and then "your
 * questions" would make a learner do two sessions where the evidence asks for
 * one mixed one.
 */
export type DueItem =
  | { kind: 'card'; card: ScheduledCardResponse }
  | { kind: 'question'; question: ScheduledQuizResponse };

export function dueItemId(item: DueItem): string {
  return item.kind === 'card' ? item.card.id : item.question.id;
}

export function dueItemDocument(item: DueItem): string {
  return item.kind === 'card' ? item.card.documentTitle : item.question.documentTitle;
}

/**
 * Interleaves the two kinds rather than running one list then the other.
 *
 * Mixing practice types within a session is the interleaving effect: blocked
 * practice feels smoother and performs better *during* the session, and worse
 * on a later test, because it lets the learner settle into one mode instead of
 * choosing an approach each time. Alternating is the cheapest way to get that,
 * and it costs nothing to do here.
 *
 * Each item is placed at its fractional position through its own list and the
 * two are merged by position, so both spread across the whole session however
 * lopsided they are. A greedy "take from whichever has more left" rule looks
 * equivalent and is not: with ten cards and one question it puts the question
 * second and leaves nine cards in an unbroken run, which is the blocked
 * practice this exists to avoid. By position, that question lands in the
 * middle where it belongs.
 */
export function interleave(
  cards: readonly ScheduledCardResponse[],
  questions: readonly ScheduledQuizResponse[],
): DueItem[] {
  const placed = [
    ...cards.map((card, index) => ({
      at: (index + 0.5) / cards.length,
      item: { kind: 'card', card } as DueItem,
    })),
    ...questions.map((question, index) => ({
      at: (index + 0.5) / questions.length,
      item: { kind: 'question', question } as DueItem,
    })),
  ];

  // Sort is stable, so an exact tie keeps cards ahead of questions rather than
  // depending on the engine.
  return placed.sort((left, right) => left.at - right.at).map(({ item }) => item);
}

/** How the panel describes what is waiting, without doing arithmetic in JSX. */
export function describeDue(cardCount: number, questionCount: number): string {
  const parts: string[] = [];
  if (cardCount > 0) parts.push(`${cardCount} card${cardCount === 1 ? '' : 's'}`);
  if (questionCount > 0) parts.push(`${questionCount} question${questionCount === 1 ? '' : 's'}`);

  return parts.join(' and ');
}
