import type { AudioOutput } from './ports/audioOutput';
import type { SpeechGateway } from './ports/speechGateway';
import type { StatusChannel } from './ports/statusChannel';

/** Silence between a card's question and its answer, for a listener to recall in. */
export const RECALL_PAUSE_SECONDS = 3;

/**
 * Speaks a single flashcard, without disturbing the document being read.
 *
 * This exists because the obvious approach is wrong: `NarrationPlayer.load()`
 * *replaces* the document, so using it to read a card aloud would discard the
 * article the reader was listening to and reset their position. A card is an
 * interruption, not a new document.
 *
 * The pause between question and answer is the point rather than politeness —
 * hearing both together is recognition, and the gap is what turns it into
 * retrieval. It is what makes a deck usable on a commute, which is the one
 * thing this product can offer that a screen-bound study tool cannot.
 */
export class CardSpeaker {
  private token = 0;
  private speaking = false;

  constructor(
    private readonly speech: SpeechGateway,
    private readonly audio: AudioOutput,
    private readonly status: StatusChannel,
    private readonly voice: string,
  ) {}

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Speaks the question, pauses, then the answer. Any earlier card is cut off. */
  async speakCard(front: string, back: string): Promise<void> {
    const mine = ++this.token;
    this.speaking = true;
    this.audio.stop();

    try {
      this.status.publish('Reading the card...');
      if (!(await this.play(front, mine))) return;

      await this.wait(RECALL_PAUSE_SECONDS * 1_000, mine);
      if (this.token !== mine) return;

      await this.play(back, mine);
    } catch {
      this.status.publish('Could not read that card aloud.');
    } finally {
      if (this.token === mine) {
        this.speaking = false;
        this.status.publish('');
      }
    }
  }

  stop(): void {
    this.token++;
    this.speaking = false;
    this.audio.stop();
    this.status.publish('');
  }

  /** Returns false when a newer request has superseded this one. */
  private async play(text: string, mine: number): Promise<boolean> {
    const samples = await this.speech.synthesize(text, this.voice);
    if (this.token !== mine) return false;

    const clip = await this.audio.decode(samples);
    if (this.token !== mine) return false;

    this.audio.play(clip, 0);
    await this.wait(clip.durationSeconds * 1_000, mine);
    return this.token === mine;
  }

  private wait(milliseconds: number, mine: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.token === mine) resolve();
        else resolve();
      }, milliseconds);
    });
  }
}
