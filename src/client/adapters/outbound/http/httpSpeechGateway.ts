import {
  API_ROUTES,
  type GenerateSpeechRequest,
  type GenerateSpeechResponse,
} from '../../../../shared/contracts/api';
import type { SpeechGateway } from '../../../application/ports/speechGateway';
import { decodeBase64 } from '../audio/pcm';
import { ApiClient, SPEECH_RETRY_POLICY } from './apiClient';

/** Fetches spoken audio and hands the player plain samples. */
export class HttpSpeechGateway implements SpeechGateway {
  /**
   * The model that rendered the last part. Sent with the next request so the
   * server leads with it: the same voice name is a different voice on a
   * different model, and the server falls back between models when one is
   * busy. Kept across documents and voice changes — the consistency is
   * welcome everywhere, and the server ignores a name it cannot serve.
   */
  private preferredModel: string | undefined;

  constructor(private readonly api: ApiClient) {}

  async synthesize(text: string, voiceName: string): Promise<Uint8Array> {
    const { base64Audio, model } = await this.api.post<GenerateSpeechResponse>(
      API_ROUTES.generateSpeech,
      { text, voiceName, preferredModel: this.preferredModel } satisfies GenerateSpeechRequest,
      SPEECH_RETRY_POLICY,
    );

    // An older server, or a test double, answers without one.
    if (typeof model === 'string' && model) this.preferredModel = model;

    return decodeBase64(base64Audio);
  }
}
