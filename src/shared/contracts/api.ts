import type { PdfSelection, SourceKind } from '../domain/contentSource';
import type { AppErrorCode } from '../domain/errors';
import type { GroundingSource } from '../domain/groundingSource';
import type { DocumentPage } from '../domain/page';
import type { ReadMode, SummaryMode } from '../domain/readMode';
import type { ExplanationFeedback } from '../domain/explanationFeedback';
import type { Flashcard, QuizItem } from '../domain/studyPack';

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
  studyPack: '/api/study-pack',
  reviewQueue: '/api/review-queue',
  reviewCard: '/api/review-card',
  explainCheck: '/api/explain-check',
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

export interface StudyPackRequest {
  title: string;
  kind: SourceKind;
  /** The document as pages, so generated items can cite one. */
  pages: DocumentPage[];
}

/** A card with its schedule, as the client needs to render and grade it. */
export interface ScheduledCardResponse extends Flashcard {
  id: string;
  documentTitle: string;
  dueAt: string | null;
}

export interface StudyPackResponse {
  packId: string;
  documentId: string;
  /**
   * The model that produced this. Rendered as an AI-generated disclosure,
   * which the EU AI Act requires from 2 August 2026.
   */
  model: string;
  generatedAt: string;
  flashcards: ScheduledCardResponse[];
  quizItems: (QuizItem & { id: string })[];
  preQuestions: { question: string }[];
  selfExplanationPrompts: SelfExplanationPromptResponse[];
  /** Items the model produced that failed verification and were discarded. */
  rejected: number;
  /**
   * Sections of the document that could not be generated at all — a quota
   * exhausted part-way, say. Distinct from `rejected`: those are items that
   * were written and thrown away, this is material never covered. A reader
   * needs to know their deck has a hole in it.
   */
  failedSections: number;
  /** True when an existing pack was returned rather than generated again. */
  reused: boolean;
}

/** Carries an id, because an answer to it is graded and kept. */
export interface SelfExplanationPromptResponse {
  id: string;
  prompt: string;
  sourcePage?: number;
}

export interface ReviewQueueResponse {
  cards: ScheduledCardResponse[];
}

export interface ReviewCardRequest {
  cardId: string;
  /** 1 again, 2 hard, 3 good, 4 easy. */
  rating: number;
}

export interface ReviewCardResponse {
  dueAt: string;
}

export interface ExplainCheckRequest {
  explanationId: string;
  answer: string;
}

export interface ExplainCheckResponse {
  feedback: ExplanationFeedback;
  /**
   * The model that graded this, for the AI-generated disclosure — feedback on
   * someone's own words is exactly where it should not be mistaken for a
   * person's.
   */
  model: string;
  /** Feedback points discarded for citing a page the source does not support. */
  unverified: number;
}
