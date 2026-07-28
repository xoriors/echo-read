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
