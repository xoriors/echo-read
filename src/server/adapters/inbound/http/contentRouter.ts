import { Router } from 'express';

import {
  API_ROUTES,
  type DocumentResponse,
  type VideoAnalysisResponse,
} from '../../../../shared/contracts/api';
import type { AnalyzeVideoUseCase } from '../../../application/usecases/analyzeVideo';
import type { ReadArticleUseCase } from '../../../application/usecases/readArticle';
import type { ReadPdfUseCase } from '../../../application/usecases/readPdf';
import type { SummarizeTextUseCase } from '../../../application/usecases/summarizeText';
import { route } from './errorMiddleware';
import { pdfSelectionOf, readModeOf, requireString, summaryModeOf } from './requestParsing';

export interface ContentUseCases {
  readArticle: ReadArticleUseCase;
  analyzeVideo: AnalyzeVideoUseCase;
  summarizeText: SummarizeTextUseCase;
  readPdf: ReadPdfUseCase;
}

/**
 * Driving adapter: maps HTTP requests onto the content use cases.
 * It parses, delegates and serialises — no business rules live here.
 */
export function contentRouter(useCases: ContentUseCases): Router {
  const router = Router();

  router.post(
    API_ROUTES.fetchArticle,
    route(async (req, res) => {
      const document = await useCases.readArticle.execute({
        url: requireString(req.body, 'url', 'URL'),
        readMode: readModeOf(req.body),
      });
      res.json(document satisfies DocumentResponse);
    }),
  );

  router.post(
    API_ROUTES.analyzeVideo,
    route(async (req, res) => {
      const analysis = await useCases.analyzeVideo.execute({
        url: requireString(req.body, 'url', 'URL'),
      });
      res.json(analysis satisfies VideoAnalysisResponse);
    }),
  );

  router.post(
    API_ROUTES.summarizeText,
    route(async (req, res) => {
      const document = await useCases.summarizeText.execute({
        text: requireString(req.body, 'text', 'Text'),
        readMode: summaryModeOf(req.body),
      });
      res.json(document satisfies DocumentResponse);
    }),
  );

  router.post(
    API_ROUTES.extractPdf,
    route(async (req, res) => {
      const document = await useCases.readPdf.execute({
        fileData: requireString(req.body, 'fileData', 'PDF data'),
        readMode: readModeOf(req.body),
        selection: pdfSelectionOf(req.body),
      });
      res.json(document satisfies DocumentResponse);
    }),
  );

  return router;
}
