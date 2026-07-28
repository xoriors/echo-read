import type { GroundingSource } from '../../../shared/domain/groundingSource';
import type { Prompt } from '../../domain/prompts';

export interface DocumentAttachment {
  mimeType: string;
  /** base64-encoded bytes. */
  data: string;
}

export interface AnalysisRequest {
  prompt: Prompt;
  /** Files to reason over alongside the prompt, e.g. a PDF. */
  attachments?: readonly DocumentAttachment[];
  /** Let the model consult the live web and report what it grounded on. */
  useWebSearch?: boolean;
  /**
   * Demand JSON matching this schema instead of prose.
   *
   * Used where the result is consumed by code rather than read by a person —
   * a study pack is merged and stored unattended, so a malformed shape has
   * nowhere to be caught.
   */
  responseSchema?: object;
}

export interface AnalysisResult {
  text: string;
  /** Pages the model grounded on; empty unless `useWebSearch` was set. */
  sources: GroundingSource[];
}

/**
 * Driven port: a large language model that turns a {@link Prompt} into prose.
 * The use cases decide *what* to ask; this port only knows how to ask it.
 */
export interface ContentAnalyzer {
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
}
