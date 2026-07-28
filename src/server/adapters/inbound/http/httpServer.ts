import express, { type Express } from 'express';

import type { Logger } from '../../../application/ports/logger';
import type { SpeakTextUseCase } from '../../../application/usecases/speakText';
import { contentRouter, type ContentUseCases } from './contentRouter';
import { errorMiddleware } from './errorMiddleware';
import { ownerIdentity } from './ownerIdentity';
import { speechRouter } from './speechRouter';
import { studyRouter, type StudyUseCases } from './studyRouter';
import { mountStaticSite } from './staticSite';

/** Uploaded PDFs arrive as base64 in the JSON body, so the limit is generous. */
const JSON_BODY_LIMIT = '50mb';

export interface HttpServerOptions {
  useCases: ContentUseCases & { speakText: SpeakTextUseCase } & Pick<StudyUseCases, 'buildStudyPack'>;
  studyRepository: StudyUseCases['studyRepository'];
  logger: Logger;
  isProduction: boolean;
  sessionSecret: string;
}

/**
 * Assembles the Express application: body parsing, the API routers, the SPA,
 * and finally the error translator.
 */
export async function createHttpServer({
  useCases,
  studyRepository,
  logger,
  isProduction,
  sessionSecret,
}: HttpServerOptions): Promise<Express> {
  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  // Every request carries an owner, so a study deck has something to belong to
  // without anyone having created an account.
  app.use(ownerIdentity(sessionSecret, { secure: isProduction }));
  app.use(contentRouter(useCases));
  app.use(speechRouter(useCases.speakText));
  app.use(studyRouter({ buildStudyPack: useCases.buildStudyPack, studyRepository }));

  await mountStaticSite(app, { isProduction });

  app.use(errorMiddleware(logger));

  return app;
}
