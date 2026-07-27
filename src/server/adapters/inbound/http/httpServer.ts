import express, { type Express } from 'express';

import type { Logger } from '../../../application/ports/logger';
import type { SpeakTextUseCase } from '../../../application/usecases/speakText';
import { contentRouter, type ContentUseCases } from './contentRouter';
import { errorMiddleware } from './errorMiddleware';
import { speechRouter } from './speechRouter';
import { mountStaticSite } from './staticSite';

/** Uploaded PDFs arrive as base64 in the JSON body, so the limit is generous. */
const JSON_BODY_LIMIT = '50mb';

export interface HttpServerOptions {
  useCases: ContentUseCases & { speakText: SpeakTextUseCase };
  logger: Logger;
  isProduction: boolean;
}

/**
 * Assembles the Express application: body parsing, the API routers, the SPA,
 * and finally the error translator.
 */
export async function createHttpServer({ useCases, logger, isProduction }: HttpServerOptions): Promise<Express> {
  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(contentRouter(useCases));
  app.use(speechRouter(useCases.speakText));

  await mountStaticSite(app, { isProduction });

  app.use(errorMiddleware(logger));

  return app;
}
