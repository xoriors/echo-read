import { UpstreamError } from '../../../../shared/domain/errors';
import type { Logger } from '../../../application/ports/logger';
import type { SpeechSynthesizer, SynthesizedSpeech } from '../../../application/ports/speechSynthesizer';
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

  async synthesize(text: string, voiceName: string, preferredModel?: string): Promise<SynthesizedSpeech> {
    let renderedBy = '';

    const base64Audio = await callWithModelFallback({
      models: this.chainFor(preferredModel),
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

        renderedBy = model;
        return base64Audio;
      },
    });

    return { base64Audio, model: renderedBy };
  }

  /**
   * The configured chain, led by the model the caller asked for — when it is
   * one of ours, so a request cannot send us to a model nobody configured.
   *
   * Every part of a document should come from the model that rendered its
   * first one: the same voice name is a different voice on a different model,
   * and a change of voice mid-article is the seam a listener notices most.
   * It also means a busy model abandoned for one part is not marched through
   * again, retry by retry, for the next.
   */
  private chainFor(preferredModel: string | undefined): readonly string[] {
    if (!preferredModel || !this.models.includes(preferredModel)) return this.models;
    return [preferredModel, ...this.models.filter((model) => model !== preferredModel)];
  }
}
