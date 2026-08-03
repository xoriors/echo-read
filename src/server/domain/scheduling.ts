import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs';

/**
 * When a card should come back.
 *
 * Spacing is one of only two techniques the learning-science review rates
 * "high utility", and the interval is the whole mechanism — reviewing just
 * before the point of forgetting is what makes a review worth its cost. So the
 * schedule is not a detail of the UI; it is the feature.
 *
 * FSRS rather than a hand-rolled SM-2: it is the leading open scheduler,
 * trained on hundreds of millions of real reviews, and reportedly needs
 * 20-30% fewer reviews for the same retention. (It is available in Anki but is
 * not Anki's default — users opt in.)
 */
export const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 } as const;

export interface CardSchedule {
  stability: number;
  difficulty: number;
  dueAt: string;
}

export interface ScheduleInput {
  stability: number | null;
  difficulty: number | null;
  lastReviewedAt: string | null;
  rating: number;
  now: Date;
}

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export function isRating(value: unknown): boolean {
  return typeof value === 'number' && value >= RATINGS.again && value <= RATINGS.easy;
}

/**
 * The rating a multiple-choice attempt earns.
 *
 * A question is marked by the answer, not by the learner, so the four-way
 * self-report a flashcard uses has nothing to come from. Binary is the honest
 * mapping: right is a successful recall, wrong is a lapse.
 *
 * Deliberately not "easy" for a correct answer. One option in four is a 25%
 * guess, so treating every correct answer as effortless would stretch
 * intervals on questions the learner only half knows — the failure mode
 * spacing exists to prevent.
 */
export function ratingForQuizAttempt(correct: boolean): number {
  return correct ? RATINGS.good : RATINGS.again;
}

/**
 * Advances one card's schedule.
 *
 * A card with no stability yet has never been graded, so it starts from a
 * fresh FSRS state rather than being treated as a lapse.
 */
export function scheduleNext({
  stability,
  difficulty,
  lastReviewedAt,
  rating,
  now,
}: ScheduleInput): CardSchedule {
  const card: Card =
    stability === null || difficulty === null
      ? createEmptyCard(now)
      : {
          ...createEmptyCard(lastReviewedAt ? new Date(lastReviewedAt) : now),
          stability,
          difficulty,
          last_review: lastReviewedAt ? new Date(lastReviewedAt) : undefined,
        };

  const { card: next } = scheduler.next(card, now, toFsrsRating(rating));

  return {
    stability: next.stability,
    difficulty: next.difficulty,
    dueAt: next.due.toISOString(),
  };
}

function toFsrsRating(rating: number): Rating.Again | Rating.Hard | Rating.Good | Rating.Easy {
  switch (rating) {
    case RATINGS.again:
      return Rating.Again;
    case RATINGS.hard:
      return Rating.Hard;
    case RATINGS.easy:
      return Rating.Easy;
    default:
      return Rating.Good;
  }
}
