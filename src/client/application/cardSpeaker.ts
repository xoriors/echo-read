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

  /**
   * Speaks a question and its options, and stops there.
   *
   * Deliberately does not continue to the answer. On screen a revealed answer
   * can be ignored; spoken, it cannot be unheard, so the hidden-until-attempted
   * rule has to be enforced harder in audio, not more loosely.
   *
   * Runs without the recall pause: the options are part of the question, not
   * something to recall, so silence between them is dead air rather than
   * thinking time. The pause that matters comes before the answer — and that
   * is a separate button press, which is a longer gap than any timer.
   */
  async speakQuestion(stem: string, options: readonly string[]): Promise<void> {
    const lettered = options
      .map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`)
      .join('. ');

    await this.speakSequence('Reading the question...', [stem, lettered], { pauseBetween: false });
  }

  /** Speaks the answer. Called only once an attempt has been made. */
  async speakAnswer(answer: string, rationale?: string): Promise<void> {
    const parts = [`The answer is: ${answer}`];
    if (rationale) parts.push(rationale);

    await this.speakSequence('Reading the answer...', parts, { pauseBetween: false });
  }

  /** Speaks the question, pauses, then the answer. Any earlier card is cut off. */
  async speakCard(front: string, back: string): Promise<void> {
    await this.speakSequence('Reading the card...', [front, back]);
  }

  /**
   * Speaks each part in turn, cutting off anything already speaking.
   *
   * The pause between parts is what turns hearing into retrieval: it is the
   * gap a listener answers in, and it is what makes a deck usable while
   * walking, which is the thing a screen-bound study tool cannot offer.
   */
  private async speakSequence(
    status: string,
    parts: readonly string[],
    { pauseBetween = true }: { pauseBetween?: boolean } = {},
  ): Promise<void> {
    const mine = ++this.token;
    this.speaking = true;
    this.audio.stop();

    try {
      this.status.publish(status);

      for (const [index, part] of parts.entries()) {
        if (index > 0 && pauseBetween) {
          await this.wait(RECALL_PAUSE_SECONDS * 1_000);
          if (this.token !== mine) return;
        }

        if (!(await this.play(part, mine))) return;
      }
    } catch {
      this.status.publish('Could not read that aloud.');
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
    await this.wait(clip.durationSeconds * 1_000);
    return this.token === mine;
  }

  /**
   * Resolves after the delay whether or not this request is still current;
   * callers check `token` themselves, so cancellation is their decision rather
   * than a promise that never settles.
   */
  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
