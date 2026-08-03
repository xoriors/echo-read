import type { ExplanationFeedback } from '../../../shared/domain/explanationFeedback';
import type { DocumentPage } from '../../../shared/domain/page';
import type { Flashcard, PreQuestion, QuizItem, StudyPack } from '../../../shared/domain/studyPack';

/** A card as stored: the content plus where the schedule has it. */
export interface ScheduledCard extends Flashcard {
  id: string;
  documentTitle: string;
  dueAt: string | null;
  stability: number | null;
  difficulty: number | null;
}

/** A self-explanation prompt as stored: an answer is graded against its id. */
export interface StoredExplanationPrompt {
  id: string;
  prompt: string;
  sourcePage?: number;
}

export interface StoredStudyPack {
  packId: string;
  documentId: string;
  model: string;
  generatedAt: string;
  flashcards: ScheduledCard[];
  quizItems: (QuizItem & { id: string })[];
  preQuestions: PreQuestion[];
  selfExplanationPrompts: StoredExplanationPrompt[];
}

export interface SaveStudyPackCommand {
  ownerId: string;
  title: string;
  kind: string;
  /** The document itself, kept as pages so a citation stays checkable. */
  pages: readonly DocumentPage[];
  /** Identifies the document by content, so re-opening it reuses the pack. */
  sourceHash: string;
  pack: StudyPack;
}

/** A prompt together with the document it was drawn from, ready to grade against. */
export interface ExplanationContext {
  id: string;
  prompt: string;
  sourcePage: number | null;
  pages: DocumentPage[];
}

export interface ExplanationAttempt {
  ownerId: string;
  explanationId: string;
  answer: string;
  feedback: ExplanationFeedback;
}

/** A question as stored, with where the schedule has it. */
export interface ScheduledQuizItem extends QuizItem {
  id: string;
  documentTitle: string;
  dueAt: string | null;
  stability: number | null;
  difficulty: number | null;
}

/** Everything waiting for one learner, of either kind. */
export interface DueItems {
  cards: ScheduledCard[];
  questions: ScheduledQuizItem[];
}

export interface QuizGrade {
  ownerId: string;
  quizItemId: string;
  chosenIndex: number;
  correct: boolean;
  stability: number;
  difficulty: number;
  dueAt: string;
}

export interface ReviewGrade {
  ownerId: string;
  cardId: string;
  /** 1 again, 2 hard, 3 good, 4 easy — the ratings FSRS expects. */
  rating: number;
  stability: number;
  difficulty: number;
  dueAt: string;
}

/**
 * Driven port for everything a learner accumulates.
 *
 * Deliberately async even though the SQLite adapter behind it is synchronous.
 * Postgres is the intended destination once decks need to sync across devices,
 * and an async signature makes that an adapter swap rather than a change that
 * ripples through every use case.
 */
export interface StudyRepository {
  /** Ensures the owner row exists before anything references it. */
  ensureOwner(ownerId: string): Promise<void>;

  /** The pack already generated for this document, if there is one. */
  findPackBySource(ownerId: string, sourceHash: string): Promise<StoredStudyPack | null>;

  save(command: SaveStudyPackCommand): Promise<StoredStudyPack>;

  /** Cards due now, across every document this owner has. */
  dueCards(ownerId: string, now: string, limit: number): Promise<ScheduledCard[]>;

  /** Questions due now. Same rule, the other half of the pack. */
  dueQuizItems(ownerId: string, now: string, limit: number): Promise<ScheduledQuizItem[]>;

  /**
   * Records a grading and moves the card's schedule on.
   *
   * Returns false when the card is not this owner's, so the caller can say so
   * rather than reporting a success that changed nothing.
   */
  recordReview(grade: ReviewGrade): Promise<boolean>;

  /**
   * A self-explanation prompt and the document behind it.
   *
   * Returns null when the prompt is not this owner's, so grading someone
   * else's is a rejection rather than a lookup that happens to find nothing.
   */
  findExplanation(ownerId: string, explanationId: string): Promise<ExplanationContext | null>;

  /** Keeps an answer and the feedback it drew. Append-only. */
  recordExplanationAttempt(attempt: ExplanationAttempt): Promise<void>;

  /**
   * Records an attempt at a question and moves its schedule on.
   *
   * Returns false when the question is not this owner's, exactly as
   * {@link recordReview} does.
   */
  recordQuizAttempt(grade: QuizGrade): Promise<boolean>;
}
