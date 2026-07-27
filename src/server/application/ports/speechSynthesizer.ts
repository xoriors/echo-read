/**
 * Driven port: text in, spoken audio out.
 *
 * The returned payload is base64-encoded 16-bit PCM at the synthesizer's
 * native sample rate, which is what the browser's audio adapter expects.
 */
export interface SpeechSynthesizer {
  readonly sampleRate: number;

  synthesize(text: string, voiceName: string): Promise<string>;
}
