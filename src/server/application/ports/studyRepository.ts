import type { Flashcard, QuizItem, StudyPack } from '../../../shared/domain/studyPack';

/** A card as stored: the content plus where the schedule has it. */
export interface ScheduledCard extends Flashcard {
  id: string;
  documentTitle: string;
  dueAt: string | null;
  stability: number | null;
  difficulty: number | null;
}

export interface StoredStudyPack {
  packId: string;
  documentId: string;
  model: string;
  generatedAt: string;
  flashcards: ScheduledCard[];
  quizItems: (QuizItem & { id: string })[];
}

export interface SaveStudyPackCommand {
  ownerId: string;
  title: string;
  kind: string;
  pageCount: number;
  /** Identifies the document by content, so re-opening it reuses the pack. */
  sourceHash: string;
  text: string;
  pack: StudyPack;
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

  /**
   * Records a grading and moves the card's schedule on.
   *
   * Returns false when the card is not this owner's, so the caller can say so
   * rather than reporting a success that changed nothing.
   */
  recordReview(grade: ReviewGrade): Promise<boolean>;
}
