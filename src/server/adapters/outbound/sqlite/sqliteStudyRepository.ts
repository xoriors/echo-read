import { randomUUID } from 'node:crypto';

import {
  pageSpans,
  pagesFromSpans,
  pagesToText,
  type PageSpan,
} from '../../../../shared/domain/page';
import { isBloomLevel, type QuizItem } from '../../../../shared/domain/studyPack';
import type {
  ExplanationAttempt,
  ExplanationContext,
  PushTarget,
  QuizGrade,
  ReviewGrade,
  ScheduledQuizItem,
  SaveStudyPackCommand,
  ScheduledCard,
  StoredExplanationPrompt,
  StoredStudyPack,
  StudyRepository,
} from '../../../application/ports/studyRepository';
import type { SqliteDatabaseProvider } from './sqliteDatabase';

interface CardRow {
  id: string;
  front: string;
  back: string;
  source_page: number | null;
  source_quote: string | null;
  due_at: string | null;
  fsrs_stability: number | null;
  fsrs_difficulty: number | null;
  title: string;
}

interface QuizRow {
  id: string;
  stem: string;
  options: string;
  answer_index: number;
  rationale: string | null;
  bloom_level: string | null;
  source_page: number | null;
  source_quote: string | null;
}

/**
 * Stores study packs in SQLite.
 *
 * The database is opened on first use, so a broken data directory costs the
 * study features and nothing else — narration keeps working.
 */
export class SqliteStudyRepository implements StudyRepository {
  constructor(private readonly databases: SqliteDatabaseProvider) {}

  async ensureOwner(ownerId: string): Promise<void> {
    this.databases
      .get()
      .prepare('INSERT INTO owner (id) VALUES (?) ON CONFLICT(id) DO NOTHING')
      .run(ownerId);
  }

  async findPackBySource(ownerId: string, sourceHash: string): Promise<StoredStudyPack | null> {
    const database = this.databases.get();

    const pack = database
      .prepare(
        `SELECT p.id, p.document_id, p.model, p.generated_at
           FROM study_pack p
           JOIN document d ON d.id = p.document_id
          WHERE p.owner_id = ? AND d.source_hash = ?
          ORDER BY p.generated_at DESC
          LIMIT 1`,
      )
      .get(ownerId, sourceHash) as unknown as
      | { id: string; document_id: string; model: string; generated_at: string }
      | undefined;

    return pack ? this.load(pack.id, pack.document_id, pack.model, pack.generated_at) : null;
  }

  async save(command: SaveStudyPackCommand): Promise<StoredStudyPack> {
    const database = this.databases.get();
    const documentId = randomUUID();
    const packId = randomUUID();

    // One transaction: a half-written deck would look like a complete one that
    // is simply missing cards, which is worse than no deck at all.
    database.exec('BEGIN');
    try {
      database
        .prepare(
          `INSERT INTO document (id, owner_id, title, kind, page_count, source_hash, text, page_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(owner_id, source_hash) DO UPDATE SET title = excluded.title
           RETURNING id`,
        )
        .run(
          documentId,
          command.ownerId,
          command.title,
          command.kind,
          command.pages.length,
          command.sourceHash,
          pagesToText(command.pages),
          JSON.stringify(pageSpans(command.pages)),
        );

      // The insert may have hit the conflict clause and updated an existing
      // row, so the id to use is whatever the unique key actually points at.
      const { id: realDocumentId } = database
        .prepare('SELECT id FROM document WHERE owner_id = ? AND source_hash = ?')
        .get(command.ownerId, command.sourceHash) as unknown as { id: string };

      database
        .prepare('INSERT INTO study_pack (id, document_id, owner_id, model) VALUES (?, ?, ?, ?)')
        .run(packId, realDocumentId, command.ownerId, command.pack.model);

      const insertCard = database.prepare(
        `INSERT INTO flashcard (id, study_pack_id, owner_id, front, back, source_page, source_quote, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      );
      for (const card of command.pack.flashcards) {
        insertCard.run(
          randomUUID(),
          packId,
          command.ownerId,
          card.front,
          card.back,
          card.sourcePage ?? null,
          card.sourceQuote ?? null,
        );
      }

      // Due immediately, like a new flashcard: a question nobody has tried is
      // exactly what the schedule should offer first.
      const insertQuiz = database.prepare(
        `INSERT INTO quiz_item
           (id, study_pack_id, owner_id, stem, options, answer_index, rationale,
            bloom_level, source_page, source_quote, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      );
      for (const item of command.pack.quizItems) {
        insertQuiz.run(
          randomUUID(),
          packId,
          command.ownerId,
          item.stem,
          JSON.stringify(item.options),
          item.answerIndex,
          item.rationale ?? null,
          item.bloomLevel ?? null,
          item.sourcePage ?? null,
          item.sourceQuote ?? null,
        );
      }

      const insertExplanation = database.prepare(
        `INSERT INTO self_explanation (id, study_pack_id, owner_id, prompt, source_page)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const entry of command.pack.selfExplanationPrompts) {
        insertExplanation.run(
          randomUUID(),
          packId,
          command.ownerId,
          entry.prompt,
          entry.sourcePage ?? null,
        );
      }

      const insertPreQuestion = database.prepare(
        'INSERT INTO pre_question (id, study_pack_id, question) VALUES (?, ?, ?)',
      );
      for (const pre of command.pack.preQuestions) {
        insertPreQuestion.run(randomUUID(), packId, pre.question);
      }

      database.exec('COMMIT');
      return this.load(packId, realDocumentId, command.pack.model, new Date().toISOString());
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  async dueCards(ownerId: string, now: string, limit: number): Promise<ScheduledCard[]> {
    const rows = this.databases
      .get()
      .prepare(
        `SELECT f.id, f.front, f.back, f.source_page, f.source_quote, f.due_at,
                f.fsrs_stability, f.fsrs_difficulty, d.title
           FROM flashcard f
           JOIN study_pack p ON p.id = f.study_pack_id
           JOIN document d ON d.id = p.document_id
          WHERE f.owner_id = ? AND (f.due_at IS NULL OR f.due_at <= ?)
          ORDER BY f.due_at IS NULL DESC, f.due_at ASC
          LIMIT ?`,
      )
      .all(ownerId, now, limit) as unknown as CardRow[];

    return rows.map(toScheduledCard);
  }

  async dueQuizItems(ownerId: string, now: string, limit: number): Promise<ScheduledQuizItem[]> {
    const rows = this.databases
      .get()
      .prepare(
        `SELECT q.id, q.stem, q.options, q.answer_index, q.rationale, q.bloom_level,
                q.source_page, q.source_quote, q.due_at, q.fsrs_stability, q.fsrs_difficulty,
                d.title
           FROM quiz_item q
           JOIN study_pack p ON p.id = q.study_pack_id
           JOIN document d ON d.id = p.document_id
          WHERE q.owner_id = ? AND (q.due_at IS NULL OR q.due_at <= ?)
          ORDER BY q.due_at IS NULL DESC, q.due_at ASC
          LIMIT ?`,
      )
      .all(ownerId, now, limit) as unknown as (QuizRow & {
      due_at: string | null;
      fsrs_stability: number | null;
      fsrs_difficulty: number | null;
      title: string;
    })[];

    return rows.map((row) => ({
      ...toQuizItem(row),
      documentTitle: row.title,
      dueAt: row.due_at,
      stability: row.fsrs_stability,
      difficulty: row.fsrs_difficulty,
    }));
  }

  async recordQuizAttempt(grade: QuizGrade): Promise<boolean> {
    const database = this.databases.get();

    database.exec('BEGIN');
    try {
      // Owner-scoped in the UPDATE, as grading a card is: an id from someone
      // else's deck must not become gradeable because it was guessed.
      const updated = database
        .prepare(
          `UPDATE quiz_item
              SET fsrs_stability = ?, fsrs_difficulty = ?, due_at = ?,
                  last_reviewed_at = datetime('now')
            WHERE id = ? AND owner_id = ?`,
        )
        .run(grade.stability, grade.difficulty, grade.dueAt, grade.quizItemId, grade.ownerId);

      if (updated.changes === 0) {
        database.exec('ROLLBACK');
        return false;
      }

      database
        .prepare(
          `INSERT INTO quiz_attempt (quiz_item_id, owner_id, chosen_index, correct)
           VALUES (?, ?, ?, ?)`,
        )
        .run(grade.quizItemId, grade.ownerId, grade.chosenIndex, grade.correct ? 1 : 0);

      database.exec('COMMIT');
      return true;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  async recordReview(grade: ReviewGrade): Promise<boolean> {
    const database = this.databases.get();

    database.exec('BEGIN');
    try {
      // Scoped by owner as well as id: a card id from someone else's deck must
      // not be gradeable just because it was guessed or leaked.
      const updated = database
        .prepare(
          `UPDATE flashcard
              SET fsrs_stability = ?, fsrs_difficulty = ?, due_at = ?, last_reviewed_at = datetime('now')
            WHERE id = ? AND owner_id = ?`,
        )
        .run(grade.stability, grade.difficulty, grade.dueAt, grade.cardId, grade.ownerId);

      if (updated.changes === 0) {
        database.exec('ROLLBACK');
        return false;
      }

      database
        .prepare('INSERT INTO review (flashcard_id, owner_id, rating) VALUES (?, ?, ?)')
        .run(grade.cardId, grade.ownerId, grade.rating);

      database.exec('COMMIT');
      return true;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  async findExplanation(
    ownerId: string,
    explanationId: string,
  ): Promise<ExplanationContext | null> {
    // Owner-scoped in the query rather than checked afterwards: the same rule
    // grading a card follows, for the same reason — an id from someone else's
    // deck must not become usable just because it was guessed or leaked.
    const row = this.databases
      .get()
      .prepare(
        `SELECT e.id, e.prompt, e.source_page, d.text, d.page_index
           FROM self_explanation e
           JOIN study_pack p ON p.id = e.study_pack_id
           JOIN document d ON d.id = p.document_id
          WHERE e.id = ? AND e.owner_id = ?`,
      )
      .get(explanationId, ownerId) as unknown as
      | { id: string; prompt: string; source_page: number | null; text: string; page_index: string | null }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      prompt: row.prompt,
      sourcePage: row.source_page,
      pages: pagesFromSpans(row.text, parseSpans(row.page_index)),
    };
  }

  async recordExplanationAttempt(attempt: ExplanationAttempt): Promise<void> {
    this.databases
      .get()
      .prepare(
        `INSERT INTO explanation_attempt (self_explanation_id, owner_id, answer, feedback)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        attempt.explanationId,
        attempt.ownerId,
        attempt.answer,
        JSON.stringify(attempt.feedback),
      );
  }

  async savePushSubscription(ownerId: string, endpoint: string): Promise<void> {
    // A browser re-subscribing after a permission reset gets a new endpoint,
    // but the same endpoint can also be offered twice; the conflict clause
    // keeps that idempotent and re-points it if the owner changed.
    this.databases
      .get()
      .prepare(
        `INSERT INTO push_subscription (owner_id, endpoint) VALUES (?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET owner_id = excluded.owner_id`,
      )
      .run(ownerId, endpoint);
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    this.databases.get().prepare('DELETE FROM push_subscription WHERE endpoint = ?').run(endpoint);
  }

  async subscriptionsToRemind(now: string, notifiedBefore: string): Promise<PushTarget[]> {
    const rows = this.databases
      .get()
      .prepare(
        `SELECT s.owner_id, s.endpoint
           FROM push_subscription s
          WHERE (s.last_notified_at IS NULL OR s.last_notified_at < ?)
            AND (
              EXISTS (SELECT 1 FROM flashcard f
                       WHERE f.owner_id = s.owner_id
                         AND (f.due_at IS NULL OR f.due_at <= ?))
              OR
              EXISTS (SELECT 1 FROM quiz_item q
                       WHERE q.owner_id = s.owner_id
                         AND (q.due_at IS NULL OR q.due_at <= ?))
            )`,
      )
      .all(notifiedBefore, now, now) as unknown as { owner_id: string; endpoint: string }[];

    return rows.map((row) => ({ ownerId: row.owner_id, endpoint: row.endpoint }));
  }

  async markReminded(endpoints: readonly string[], at: string): Promise<void> {
    if (endpoints.length === 0) return;

    const database = this.databases.get();
    const update = database.prepare(
      'UPDATE push_subscription SET last_notified_at = ? WHERE endpoint = ?',
    );

    database.exec('BEGIN');
    try {
      for (const endpoint of endpoints) update.run(at, endpoint);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  private load(
    packId: string,
    documentId: string,
    model: string,
    generatedAt: string,
  ): StoredStudyPack {
    const database = this.databases.get();

    const cards = database
      .prepare(
        `SELECT f.id, f.front, f.back, f.source_page, f.source_quote, f.due_at,
                f.fsrs_stability, f.fsrs_difficulty, d.title
           FROM flashcard f
           JOIN study_pack p ON p.id = f.study_pack_id
           JOIN document d ON d.id = p.document_id
          WHERE f.study_pack_id = ?`,
      )
      .all(packId) as unknown as CardRow[];

    const quiz = database
      .prepare(
        `SELECT id, stem, options, answer_index, rationale, bloom_level, source_page, source_quote
           FROM quiz_item WHERE study_pack_id = ?`,
      )
      .all(packId) as unknown as QuizRow[];

    const explanations = database
      .prepare('SELECT id, prompt, source_page FROM self_explanation WHERE study_pack_id = ?')
      .all(packId) as unknown as { id: string; prompt: string; source_page: number | null }[];

    const preQuestions = database
      .prepare('SELECT question FROM pre_question WHERE study_pack_id = ?')
      .all(packId) as unknown as { question: string }[];

    return {
      packId,
      documentId,
      model,
      generatedAt,
      preQuestions,
      selfExplanationPrompts: explanations.map(
        (row): StoredExplanationPrompt => ({
          id: row.id,
          prompt: row.prompt,
          sourcePage: row.source_page ?? undefined,
        }),
      ),
      flashcards: cards.map(toScheduledCard),
      quizItems: quiz.map(toQuizItem),
    };
  }
}

function toQuizItem(row: QuizRow): QuizItem & { id: string } {
  return {
    id: row.id,
    stem: row.stem,
    options: parseOptions(row.options),
    answerIndex: row.answer_index,
    rationale: row.rationale ?? undefined,
    bloomLevel: isBloomLevel(row.bloom_level) ? row.bloom_level : undefined,
    sourcePage: row.source_page ?? undefined,
    sourceQuote: row.source_quote ?? undefined,
  };
}

function toScheduledCard(row: CardRow): ScheduledCard {
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    sourcePage: row.source_page ?? undefined,
    sourceQuote: row.source_quote ?? undefined,
    documentTitle: row.title,
    dueAt: row.due_at,
    stability: row.fsrs_stability,
    difficulty: row.fsrs_difficulty,
  };
}

/**
 * The page index, or null.
 *
 * Null for documents stored before pages were indexed, and null again if the
 * JSON is unreadable — both are answered upstream by treating the text as one
 * page, which is a worse citation than the real one but not a wrong one.
 */
function parseSpans(value: string | null): PageSpan[] | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;

    return parsed.filter(
      (span): span is PageSpan =>
        typeof span === 'object' &&
        span !== null &&
        typeof (span as PageSpan).number === 'number' &&
        typeof (span as PageSpan).start === 'number' &&
        typeof (span as PageSpan).end === 'number',
    );
  } catch {
    return null;
  }
}

/** Options are stored as JSON; a corrupt row should cost one item, not the deck. */
function parseOptions(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === 'string') : [];
  } catch {
    return [];
  }
}
