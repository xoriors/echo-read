import type { VideoAnalysis } from '../../domain/contentDocument';

/** One finished analysis, as it was saved. */
export interface CachedVideoAnalysis {
  videoId: string;
  promptVersion: number;
  /** Which model wrote it, so a bad batch can be traced back. */
  model: string;
  durationSeconds: number | null;
  analysis: VideoAnalysis;
  createdAt: string;
}

/** What gets saved; the database fills in the timestamp. */
export type SaveVideoAnalysisCommand = Omit<CachedVideoAnalysis, 'createdAt'>;

/**
 * Driven port: finished video analyses, kept so the same video is not sent to
 * the model twice.
 */
export interface VideoAnalysisCache {
  get(videoId: string, promptVersion: number): Promise<CachedVideoAnalysis | null>;
  put(entry: SaveVideoAnalysisCommand): Promise<void>;
}