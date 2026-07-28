import { DEFAULT_MAX_CHUNK_LENGTH, splitIntoChunks } from './textChunker';

export interface NarrationChunk {
  index: number;
  text: string;
  /** Character offset of this chunk within the concatenated chunk text. */
  startOffset: number;
}

/** A position expressed as "which chunk, and how far into it". */
export interface NarrationPosition {
  chunkIndex: number;
  /** 0–1 within the chunk. */
  chunkProgress: number;
  /**
   * Character offset within the chunk.
   *
   * Speech is not evenly paced, so a character fraction is a poor stand-in for
   * a time offset. Callers that need to land on an exact word use this to
   * synthesise from it instead of estimating a seek position.
   */
  characterInChunk: number;
}

/**
 * A document prepared for narration: the text the reader sees, plus the chunks
 * it is spoken in.
 *
 * All progress arithmetic lives here so the player, the highlighter and the
 * auto-scroller cannot drift apart in how they measure "how far along are we".
 */
export class Narration {
  readonly text: string;
  readonly chunks: readonly NarrationChunk[];
  /** Total length of the chunked text, which trimming makes ≤ `text.length`. */
  readonly spokenLength: number;

  private constructor(text: string, chunks: NarrationChunk[]) {
    this.text = text;
    this.chunks = chunks;
    this.spokenLength = chunks.reduce((total, chunk) => total + chunk.text.length, 0);
  }

  static of(text: string, maxChunkLength = DEFAULT_MAX_CHUNK_LENGTH): Narration {
    let offset = 0;
    const chunks = splitIntoChunks(text, maxChunkLength).map((chunkText, index) => {
      const chunk: NarrationChunk = { index, text: chunkText, startOffset: offset };
      offset += chunkText.length;
      return chunk;
    });

    return new Narration(text, chunks);
  }

  static empty(): Narration {
    return new Narration('', []);
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  get isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  chunkAt(index: number): NarrationChunk | undefined {
    return this.chunks[index];
  }

  hasChunk(index: number): boolean {
    return index >= 0 && index < this.chunks.length;
  }

  /** Overall progress through the document, 0–1. */
  progressAt({ chunkIndex, chunkProgress }: Omit<NarrationPosition, 'characterInChunk'>): number {
    const chunk = this.chunkAt(chunkIndex);
    if (!chunk || this.spokenLength === 0) return 0;

    const consumed = chunk.startOffset + clamp01(chunkProgress) * chunk.text.length;
    return clamp01(consumed / this.spokenLength);
  }

  /** Inverse of {@link progressAt}: which chunk covers this character index. */
  locate(characterIndex: number): NarrationPosition {
    if (this.isEmpty) return { chunkIndex: 0, chunkProgress: 0, characterInChunk: 0 };

    const target = Math.max(0, characterIndex);
    const chunk =
      this.chunks.find((candidate) => target < candidate.startOffset + candidate.text.length) ??
      this.chunks[this.chunks.length - 1];

    const within = Math.min(Math.max(target - chunk.startOffset, 0), chunk.text.length);
    return {
      chunkIndex: chunk.index,
      chunkProgress: chunk.text.length > 0 ? clamp01(within / chunk.text.length) : 0,
      characterInChunk: within,
    };
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}
