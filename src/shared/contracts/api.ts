import type { PdfSelection } from '../domain/contentSource';
import type { AppErrorCode } from '../domain/errors';
import type { GroundingSource } from '../domain/groundingSource';
import type { ReadMode, SummaryMode } from '../domain/readMode';

/**
 * The wire contract between the browser hexagon and the server hexagon.
 *
 * Both sides import these declarations, so a change to a payload breaks
 * compilation on the side that has not caught up yet. Neither side's use cases
 * depend on this file — only their HTTP adapters do.
 */

export const API_ROUTES = {
  fetchArticle: '/api/fetch-article',
  analyzeVideo: '/api/analyze-video',
  summarizeText: '/api/summarize-text',
  extractPdf: '/api/extract-pdf',
  generateSpeech: '/api/generate-speech',
} as const;

export interface FetchArticleRequest {
  url: string;
  readMode: ReadMode;
}

export interface AnalyzeVideoRequest {
  url: string;
}

export interface SummarizeTextRequest {
  text: string;
  readMode: SummaryMode;
}

export interface ExtractPdfRequest {
  fileData: string;
  readMode: ReadMode;
  selection: PdfSelection;
}

export interface GenerateSpeechRequest {
  text: string;
  voiceName: string;
}

export interface DocumentResponse {
  text: string;
  sources: GroundingSource[];
}

export interface VideoAnalysisResponse extends DocumentResponse {
  videoSource: GroundingSource;
}

export interface GenerateSpeechResponse {
  /** Raw 16-bit PCM at 24 kHz, base64 encoded. */
  base64Audio: string;
}

export interface ApiErrorResponse {
  error: string;
  /** Lets the caller tell a permanent failure from one worth retrying. */
  code?: AppErrorCode;
  /** Present when the failure is a rate limit and the provider gave a hint. */
  retryAfterSeconds?: number;
}
