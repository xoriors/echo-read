import { Router } from 'express';

import { API_ROUTES, type GenerateSpeechResponse } from '../../../../shared/contracts/api';
import { ValidationError } from '../../../../shared/domain/errors';
import type { SpeakTextUseCase } from '../../../application/usecases/speakText';
import { route } from './errorMiddleware';

/** Driving adapter for text-to-speech. */
export function speechRouter(speakText: SpeakTextUseCase): Router {
  const router = Router();

  router.post(
    API_ROUTES.generateSpeech,
    route(async (req, res) => {
      const { text, voiceName } = req.body ?? {};
      if (typeof text !== 'string' || !text || typeof voiceName !== 'string' || !voiceName) {
        throw new ValidationError('Text and voiceName are required');
      }

      const audio = await speakText.execute({ text, voiceName });
      res.json(audio satisfies GenerateSpeechResponse);
    }),
  );

  return router;
}
