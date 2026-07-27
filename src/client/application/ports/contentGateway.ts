import type { PdfSelection } from '../../../shared/domain/contentSource';
import type { GroundingSource } from '../../../shared/domain/groundingSource';
import type { ReadMode, SummaryMode } from '../../../shared/domain/readMode';

export interface RetrievedContent {
  text: string;
  sources: GroundingSource[];
  /** Only set when the content came from analysing a video. */
  videoSource?: GroundingSource | null;
}

/**
 * Driven port: whatever can turn a source into readable text.
 *
 * Today an HTTP adapter talks to this app's own API; the use cases neither
 * know nor care.
 */
export interface ContentGateway {
  fetchArticle(url: string, readMode: ReadMode): Promise<RetrievedContent>;
  analyzeVideo(url: string): Promise<RetrievedContent>;
  summarizeText(text: string, readMode: SummaryMode): Promise<RetrievedContent>;
  extractPdf(base64Data: string, readMode: ReadMode, selection: PdfSelection): Promise<RetrievedContent>;
}
