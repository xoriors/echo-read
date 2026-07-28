import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ConfigurationError } from '../../../../shared/domain/errors';

/**
 * Opens the SQLite file the app stores learning state in.
 *
 * `node:sqlite` ships inside Node, so this costs no dependency and no native
 * build. It is synchronous, but the repository port above it is async — that is
 * deliberate, so swapping in Postgres later is an adapter change rather than a
 * refactor through every use case.
 *
 * Opening is deferred to first use, exactly as {@link GeminiClientProxy} defers
 * the Gemini client: reading a document aloud does not need storage, so a
 * missing or unwritable data directory must not stop the server from booting
 * and serving the UI.
 */
export class SqliteDatabaseProvider {
  private database: DatabaseSync | null = null;

  constructor(private readonly dataDir: string) {}

  get file(): string {
    return path.join(this.dataDir, 'echoread.db');
  }

  get(): DatabaseSync {
    if (this.database) return this.database;

    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
    } catch (error) {
      throw new ConfigurationError(
        `Cannot create the data directory at ${this.dataDir}: ${(error as Error).message}`,
      );
    }

    const database = new DatabaseSync(this.file);

    // WAL lets reads proceed while a write is in flight. With one machine and
    // one writer that is mostly about not blocking narration on a deck save.
    database.exec('PRAGMA journal_mode = WAL');
    // SQLite ignores foreign keys unless asked, and the schema leans on
    // ON DELETE CASCADE to keep a deleted owner from leaving orphans behind.
    database.exec('PRAGMA foreign_keys = ON');
    // Wait rather than fail if a write briefly overlaps another.
    database.exec('PRAGMA busy_timeout = 5000');

    this.database = database;
    return database;
  }

  close(): void {
    this.database?.close();
    this.database = null;
  }
}
