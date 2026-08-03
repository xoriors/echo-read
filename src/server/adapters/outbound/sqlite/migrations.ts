import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  /** Monotonic. Applied in ascending order, exactly once each. */
  id: number;
  name: string;
  sql: string;
}

/**
 * The schema, as an append-only list.
 *
 * Never edit a migration that has shipped — add another. The ledger records
 * ids, so changing one in place would leave a deployed database silently
 * diverged from this file.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'study_foundation',
    sql: `
      -- A learner. Anonymous by default: the browser holds an opaque id in a
      -- signed cookie, so decks survive without anyone creating an account.
      CREATE TABLE owner (
        id          TEXT PRIMARY KEY,
        email       TEXT UNIQUE,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE document (
        id           TEXT PRIMARY KEY,
        owner_id     TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        kind         TEXT NOT NULL,
        page_count   INTEGER NOT NULL DEFAULT 1,
        -- Hash of the extracted text, so re-opening the same document reuses
        -- its pack instead of paying to generate one twice.
        source_hash  TEXT NOT NULL,
        text         TEXT NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX document_owner_idx ON document (owner_id, created_at DESC);
      CREATE UNIQUE INDEX document_owner_hash_idx ON document (owner_id, source_hash);

      CREATE TABLE study_pack (
        id            TEXT PRIMARY KEY,
        document_id   TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
        owner_id      TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
        -- Which model produced it: needed for the AI-generated disclosure, and
        -- for invalidating packs when the prompt or the model chain changes.
        model         TEXT NOT NULL,
        generated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX study_pack_document_idx ON study_pack (document_id);

      CREATE TABLE flashcard (
        id             TEXT PRIMARY KEY,
        study_pack_id  TEXT NOT NULL REFERENCES study_pack(id) ON DELETE CASCADE,
        owner_id       TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
        front          TEXT NOT NULL,
        back           TEXT NOT NULL,
        -- Where the card came from. The quote is what lets the page be
        -- verified, so a citation is never shown on the model's word alone.
        source_page    INTEGER,
        source_quote   TEXT,
        fsrs_stability   REAL,
        fsrs_difficulty  REAL,
        due_at           TEXT,
        last_reviewed_at TEXT
      );
      -- The review-queue read path: what is due for one learner, across every
      -- document they own.
      CREATE INDEX flashcard_due_idx ON flashcard (owner_id, due_at);

      CREATE TABLE quiz_item (
        id             TEXT PRIMARY KEY,
        study_pack_id  TEXT NOT NULL REFERENCES study_pack(id) ON DELETE CASCADE,
        stem           TEXT NOT NULL,
        -- JSON array; SQLite has no array type and the options are only ever
        -- read as a whole.
        options        TEXT NOT NULL,
        answer_index   INTEGER NOT NULL,
        rationale      TEXT,
        bloom_level    TEXT,
        source_page    INTEGER,
        source_quote   TEXT
      );
      CREATE INDEX quiz_item_pack_idx ON quiz_item (study_pack_id);

      -- Append-only. Keeping every grading lets FSRS parameters be retrained
      -- against real history later.
      CREATE TABLE review (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        flashcard_id  TEXT NOT NULL REFERENCES flashcard(id) ON DELETE CASCADE,
        owner_id      TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
        rating        INTEGER NOT NULL,
        reviewed_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX review_card_idx ON review (flashcard_id, reviewed_at);
    `,
  },
  {
    id: 2,
    name: 'self_explanation',
    sql: `
      -- Where each page starts and ends inside document.text, as JSON.
      -- Pages cannot be recovered from the flattened text — the separator is a
      -- blank line, which occurs inside prose — and a second copy of a book
      -- would cost the book again. Nullable: rows written before this migration
      -- have no index and are read as a single page.
      ALTER TABLE document ADD COLUMN page_index TEXT;

      -- Generated with the pack, and now kept: an answer needs something
      -- durable to attach to, and a reused pack used to come back without its
      -- prompts at all, because nothing stored them.
      CREATE TABLE self_explanation (
        id             TEXT PRIMARY KEY,
        study_pack_id  TEXT NOT NULL REFERENCES study_pack(id) ON DELETE CASCADE,
        owner_id       TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
        prompt         TEXT NOT NULL,
        source_page    INTEGER
      );
      CREATE INDEX self_explanation_pack_idx ON self_explanation (study_pack_id);

      -- Stored for the same reason, though nothing is graded against them.
      CREATE TABLE pre_question (
        id             TEXT PRIMARY KEY,
        study_pack_id  TEXT NOT NULL REFERENCES study_pack(id) ON DELETE CASCADE,
        question       TEXT NOT NULL
      );
      CREATE INDEX pre_question_pack_idx ON pre_question (study_pack_id);

      -- Append-only, like review: a learner explaining the same idea twice a
      -- week apart is the improvement they came for, and overwriting the first
      -- attempt would hide it.
      CREATE TABLE explanation_attempt (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        self_explanation_id  TEXT NOT NULL REFERENCES self_explanation(id) ON DELETE CASCADE,
        owner_id             TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
        answer               TEXT NOT NULL,
        -- The graded result as JSON: it is shown back, never queried across.
        feedback             TEXT NOT NULL,
        created_at           TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX explanation_attempt_idx
        ON explanation_attempt (self_explanation_id, created_at);
    `,
  },
  {
    id: 3,
    name: 'scheduled_questions',
    sql: `
      -- Questions were graded in the browser and the result went nowhere: a
      -- refresh lost it, and half the pack could never enter the schedule.
      -- Spacing is one of only two techniques the evidence rates high utility,
      -- and it covered flashcards only.
      ALTER TABLE quiz_item ADD COLUMN owner_id TEXT REFERENCES owner(id) ON DELETE CASCADE;
      ALTER TABLE quiz_item ADD COLUMN fsrs_stability REAL;
      ALTER TABLE quiz_item ADD COLUMN fsrs_difficulty REAL;
      ALTER TABLE quiz_item ADD COLUMN due_at TEXT;
      ALTER TABLE quiz_item ADD COLUMN last_reviewed_at TEXT;

      -- Questions written before this migration have no owner column filled
      -- in; take it from the pack they belong to so they join the queue.
      UPDATE quiz_item
         SET owner_id = (SELECT p.owner_id FROM study_pack p WHERE p.id = quiz_item.study_pack_id),
             due_at = datetime('now')
       WHERE owner_id IS NULL;

      -- The queue read path, mirroring flashcard_due_idx.
      CREATE INDEX quiz_item_due_idx ON quiz_item (owner_id, due_at);

      -- Append-only, like review. Which option was chosen is kept, not just
      -- whether it was right: a distractor that keeps winning is the most
      -- useful signal a generated question can give.
      CREATE TABLE quiz_attempt (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_item_id  TEXT NOT NULL REFERENCES quiz_item(id) ON DELETE CASCADE,
        owner_id      TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
        chosen_index  INTEGER NOT NULL,
        correct       INTEGER NOT NULL,
        attempted_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX quiz_attempt_item_idx ON quiz_attempt (quiz_item_id, attempted_at);
    `,
  },
];

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migration (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export interface MigrationResult {
  applied: number[];
  skipped: number[];
}

/**
 * Brings the database up to date.
 *
 * Runs at boot rather than as a deploy step: the app is pinned to a single
 * machine because a volume attaches to one, so there is exactly one writer and
 * nothing to race. The ledger still makes it idempotent, and each migration
 * runs in its own transaction so a failure part-way leaves the ones before it
 * applied and recorded — a retry resumes instead of restarting.
 */
export function migrate(database: DatabaseSync): MigrationResult {
  database.exec(LEDGER);

  const applied = database.prepare('SELECT id FROM schema_migration').all() as { id: number }[];
  const done = new Set(applied.map((row) => row.id));
  const result: MigrationResult = { applied: [], skipped: [] };

  for (const migration of [...MIGRATIONS].sort((a, b) => a.id - b.id)) {
    if (done.has(migration.id)) {
      result.skipped.push(migration.id);
      continue;
    }

    database.exec('BEGIN');
    try {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO schema_migration (id, name) VALUES (?, ?)')
        .run(migration.id, migration.name);
      database.exec('COMMIT');
      result.applied.push(migration.id);
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  return result;
}
