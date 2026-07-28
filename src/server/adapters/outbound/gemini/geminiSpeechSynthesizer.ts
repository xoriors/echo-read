import { UpstreamError } from '../../../../shared/domain/errors';
import type { Logger } from '../../../application/ports/logger';
import type { SpeechSynthesizer } from '../../../application/ports/speechSynthesizer';
import type { GeminiClientProvider } from './geminiClient';
import { mapGeminiError } from './geminiErrorMapper';
import { callWithModelFallback } from './modelFallback';

export const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

/**
 * Speech alternatives, tried in order. All three emit the same 24 kHz PCM, so
 * falling back changes which voice model renders the audio but not how the
 * client has to decode it.
 */
export const DEFAULT_TTS_MODELS: readonly string[] = [
  DEFAULT_TTS_MODEL,
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-pro-preview-tts',
];

/** Sample rate of the PCM stream Gemini's TTS models return. */
export const GEMINI_TTS_SAMPLE_RATE = 24_000;

export class GeminiSpeechSynthesizer implements SpeechSynthesizer {
  readonly sampleRate = GEMINI_TTS_SAMPLE_RATE;

  constructor(
    private readonly clients: GeminiClientProvider,
    private readonly logger: Logger,
    private readonly models: readonly string[] = DEFAULT_TTS_MODELS,
  ) {}

  async synthesize(text: string, voiceName: string): Promise<string> {
    return callWithModelFallback({
      models: this.models,
      logger: this.logger,
      operationName: 'synthesize',
      mapError: (error) => mapGeminiError(error, 'Failed to generate speech with Gemini.'),
      operation: async (model) => {
        const response = await this.clients.get().models.generateContent({
          model,
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new UpstreamError('No audio data received from API.');

        return base64Audio;
      },
    });
  }
}
