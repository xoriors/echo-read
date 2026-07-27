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
  constructor(private readonly api: ApiClient) {}

  async synthesize(text: string, voiceName: string): Promise<Uint8Array> {
    const { base64Audio } = await this.api.post<GenerateSpeechResponse>(
      API_ROUTES.generateSpeech,
      { text, voiceName } satisfies GenerateSpeechRequest,
      SPEECH_RETRY_POLICY,
    );

    return decodeBase64(base64Audio);
  }
}
