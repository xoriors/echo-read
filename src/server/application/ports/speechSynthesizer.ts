export interface SynthesizedSpeech {
  /** base64-encoded 16-bit PCM at the synthesizer's native sample rate. */
  base64Audio: string;
  /** Which model rendered it. Passed back on the next call to get the same voice again. */
  model: string;
}

/**
 * Driven port: text in, spoken audio out.
 *
 * The payload is what the browser's audio adapter expects. `preferredModel`
 * is the model that rendered the previous part of the same document: the same
 * voice name is a different voice on a different model, so an adapter that
 * falls back between models should lead with it whenever it can.
 */
export interface SpeechSynthesizer {
  readonly sampleRate: number;

  synthesize(text: string, voiceName: string, preferredModel?: string): Promise<SynthesizedSpeech>;
}
