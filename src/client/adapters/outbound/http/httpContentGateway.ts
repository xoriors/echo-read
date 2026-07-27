import {
  API_ROUTES,
  type AnalyzeVideoRequest,
  type DocumentResponse,
  type ExtractPdfRequest,
  type FetchArticleRequest,
  type SummarizeTextRequest,
  type VideoAnalysisResponse,
} from '../../../../shared/contracts/api';
import type { PdfSelection } from '../../../../shared/domain/contentSource';
import type { ReadMode, SummaryMode } from '../../../../shared/domain/readMode';
import type { ContentGateway, RetrievedContent } from '../../../application/ports/contentGateway';
import { ApiClient, CONTENT_RETRY_POLICY } from './apiClient';

/** Talks to this app's own content API on behalf of the use cases. */
export class HttpContentGateway implements ContentGateway {
  constructor(private readonly api: ApiClient) {}

  async fetchArticle(url: string, readMode: ReadMode): Promise<RetrievedContent> {
    return this.api.post<DocumentResponse>(
      API_ROUTES.fetchArticle,
      { url, readMode } satisfies FetchArticleRequest,
      CONTENT_RETRY_POLICY,
    );
  }

  async analyzeVideo(url: string): Promise<RetrievedContent> {
    return this.api.post<VideoAnalysisResponse>(
      API_ROUTES.analyzeVideo,
      { url } satisfies AnalyzeVideoRequest,
      CONTENT_RETRY_POLICY,
    );
  }

  async summarizeText(text: string, readMode: SummaryMode): Promise<RetrievedContent> {
    return this.api.post<DocumentResponse>(
      API_ROUTES.summarizeText,
      { text, readMode } satisfies SummarizeTextRequest,
      CONTENT_RETRY_POLICY,
    );
  }

  async extractPdf(base64Data: string, readMode: ReadMode, selection: PdfSelection): Promise<RetrievedContent> {
    return this.api.post<DocumentResponse>(
      API_ROUTES.extractPdf,
      { fileData: base64Data, readMode, selection } satisfies ExtractPdfRequest,
      CONTENT_RETRY_POLICY,
    );
  }
}
