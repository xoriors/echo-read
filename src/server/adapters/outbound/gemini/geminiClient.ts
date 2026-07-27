import { GoogleGenAI } from '@google/genai';

import { ConfigurationError } from '../../../../shared/domain/errors';

/**
 * Lazily builds (and memoises) the Gemini SDK client.
 *
 * Construction is deferred to first use so the server still boots — and can
 * serve the UI — in an environment where the key has not been set yet.
 */
export class GeminiClientProvider {
  private client: GoogleGenAI | null = null;

  constructor(private readonly apiKey: string | undefined) {}

  get(): GoogleGenAI {
    if (this.client) return this.client;

    if (!this.apiKey) {
      throw new ConfigurationError(
        'GEMINI_API_KEY environment variable not set. Please set it in the Secrets menu.',
      );
    }

    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }
}
