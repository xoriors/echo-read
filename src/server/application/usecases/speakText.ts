import { ValidationError } from '../../../shared/domain/errors';
import type { SpeechSynthesizer, SynthesizedSpeech } from '../ports/speechSynthesizer';

export interface SpeakTextCommand {
  text: string;
  voiceName: string;
  /** The model that rendered the previous part, so this one sounds the same. */
  preferredModel?: string;
}

/** Narrate one passage of text in the requested voice. */
export class SpeakTextUseCase {
  constructor(private readonly synthesizer: SpeechSynthesizer) {}

  async execute({ text, voiceName, preferredModel }: SpeakTextCommand): Promise<SynthesizedSpeech> {
    if (!text || !voiceName) throw new ValidationError('Text and voiceName are required');

    return this.synthesizer.synthesize(text, voiceName, preferredModel);
  }
}
