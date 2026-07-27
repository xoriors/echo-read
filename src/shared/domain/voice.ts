/**
 * The voices EchoRead can narrate with.
 *
 * Shared because it is part of the contract: the browser offers these names
 * and the server's synthesizer has to accept them.
 */
export const NARRATION_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const;

export type NarrationVoice = (typeof NARRATION_VOICES)[number];

export const DEFAULT_VOICE: NarrationVoice = NARRATION_VOICES[0];
