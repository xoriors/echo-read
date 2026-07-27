import { ValidationError } from '../../../shared/domain/errors';
import type { SpeechSynthesizer } from '../ports/speechSynthesizer';

export interface SpeakTextCommand {
  text: string;
  voiceName: string;
}

export interface SpokenAudio {
  /** base64-encoded 16-bit PCM. */
  base64Audio: string;
}

/** Narrate one passage of text in the requested voice. */
export class SpeakTextUseCase {
  constructor(private readonly synthesizer: SpeechSynthesizer) {}

  async execute({ text, voiceName }: SpeakTextCommand): Promise<SpokenAudio> {
    if (!text || !voiceName) throw new ValidationError('Text and voiceName are required');

    return { base64Audio: await this.synthesizer.synthesize(text, voiceName) };
  }
}
