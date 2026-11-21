import type { VideoAnalysis } from '../../../domain/contentDocument';
import type {
  CachedVideoAnalysis,
  SaveVideoAnalysisCommand,
  VideoAnalysisCache,
} from '../../../application/ports/videoAnalysisCache';
import type { SqliteDatabaseProvider } from './sqliteDatabase';

/** A row of video_analysis. */
interface VideoAnalysisRow {
  video_id: string;
  prompt_version: number;
  model: string;
  duration_s: number | null;
  notes_json: string;
  created_at: string;
}

/** Keeps finished video analyses in SQLite. */
export class SqliteVideoAnalysisCache implements VideoAnalysisCache {
  constructor(private readonly databases: SqliteDatabaseProvider) {}

  async get(videoId: string, promptVersion: number): Promise<CachedVideoAnalysis | null> {
    const row = this.databases
      .get()
      .prepare(
        `SELECT video_id, prompt_version, model, duration_s, notes_json, created_at
          FROM video_analysis
         WHERE video_id = ? AND prompt_version = ?`,
      )
      .get(videoId, promptVersion) as unknown as VideoAnalysisRow | undefined;
    if (row === undefined) {
      return null;
    }
    const analysis = JSON.parse(row.notes_json) as VideoAnalysis;
    return {
      videoId: row.video_id,
      promptVersion: row.prompt_version,
      model: row.model,
      durationSeconds: row.duration_s,
      analysis,
      createdAt: row.created_at,
    };
  }

  async put(entry: SaveVideoAnalysisCommand): Promise<void> {
    const notesJson = JSON.stringify(entry.analysis);
    // Re-analysing the same video and version replaces the old row,
    // instead of failing on the primary key.
    this.databases
      .get()
      .prepare(
        `INSERT INTO video_analysis (video_id, prompt_version, model, duration_s, notes_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (video_id, prompt_version) DO UPDATE SET
          model = excluded.model,
          duration_s = excluded.duration_s,
          notes_json = excluded.notes_json,
          created_at = datetime('now')`,
      )
      .run(entry.videoId, entry.promptVersion, entry.model, entry.durationSeconds, notesJson);
  }
}