/**
 * Driven port: text in, raw audio samples out.
 *
 * The transport encoding (base64 over JSON, today) is the adapter's business;
 * the player only ever sees bytes.
 */
export interface SpeechGateway {
  synthesize(text: string, voiceName: string): Promise<Uint8Array>;
}
