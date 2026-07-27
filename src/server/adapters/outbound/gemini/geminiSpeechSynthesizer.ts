import { UpstreamError } from '../../../../shared/domain/errors';
import type { SpeechSynthesizer } from '../../../application/ports/speechSynthesizer';
import type { GeminiClientProvider } from './geminiClient';
import { mapGeminiError } from './geminiErrorMapper';

export const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

/** Sample rate of the PCM stream Gemini's TTS models return. */
export const GEMINI_TTS_SAMPLE_RATE = 24_000;

export class GeminiSpeechSynthesizer implements SpeechSynthesizer {
  readonly sampleRate = GEMINI_TTS_SAMPLE_RATE;

  constructor(
    private readonly clients: GeminiClientProvider,
    private readonly model: string = DEFAULT_TTS_MODEL,
  ) {}

  async synthesize(text: string, voiceName: string): Promise<string> {
    try {
      const response = await this.clients.get().models.generateContent({
        model: this.model,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new UpstreamError('No audio data received from API.');

      return base64Audio;
    } catch (error) {
      throw mapGeminiError(error, 'Failed to generate speech with Gemini.');
    }
  }
}
