/**
 * Speech synthesis is billed and rate-limited per call, and long passages time
 * out, so a document is narrated in pieces. Splitting on sentence boundaries
 * keeps the seams from landing mid-thought.
 *
 * The pieces are not all the same size. Nothing can play until the first one
 * has been synthesised in full, and a listener experiences that wait as the
 * app being slow — so the first piece is a sentence or two, a few seconds of
 * work rather than half a minute. Each piece after it may be a few times
 * longer than the one before, up to the ceiling: a piece only has to be long
 * enough to keep playing while the next one is being made, and the next one
 * is being made from the moment this one is asked for.
 */
export interface ChunkingPolicy {
  /** Longest the first chunk may be — the one the listener waits for. */
  firstLength: number;
  /** How many times longer each chunk may be than the one before it. */
  growth: number;
  /** Longest any chunk may be, however far into the document it falls. */
  maxLength: number;
}

/** 300 → 900 → 2700 → 4000 → 4000 → … */
export const DEFAULT_CHUNKING: ChunkingPolicy = {
  firstLength: 300,
  growth: 3,
  maxLength: 4000,
};

/** Longest the chunk at `index` may be. */
export function chunkLimitAt(index: number, policy: ChunkingPolicy = DEFAULT_CHUNKING): number {
  const ramped = Math.floor(policy.firstLength * policy.growth ** index);
  return Math.max(1, Math.min(policy.maxLength, ramped));
}

/**
 * A run of text up to and including its terminator. The `$` alternative keeps
 * a final sentence that has no terminator, which would otherwise never be read.
 */
const SENTENCE = /[^.!?\n]+(?:[.!?\n]+|$)/g;

export function splitIntoChunks(text: string, policy: ChunkingPolicy = DEFAULT_CHUNKING): string[] {
  const chunks: string[] = [];
  const queue: string[] = [...(text.match(SENTENCE) ?? [text])];
  let current = '';

  const close = (chunk: string): void => {
    const trimmed = chunk.trim();
    if (trimmed) chunks.push(trimmed);
  };

  while (queue.length > 0) {
    const limit = chunkLimitAt(chunks.length, policy);
    const sentence = queue[0];

    if (current.length + sentence.length <= limit) {
      current += sentence;
      queue.shift();
    } else if (current.length > 0) {
      // Full. The sentence is tried again against the next chunk's limit.
      close(current);
      current = '';
    } else {
      // One sentence longer than a whole chunk — a list, a heading, a passage
      // with no punctuation. Cut it at a word rather than send it whole.
      const cut = wordBoundaryBefore(sentence, limit);
      close(sentence.slice(0, cut));
      queue[0] = sentence.slice(cut);
    }
  }

  close(current);
  return chunks;
}

/**
 * Where to cut `text` so that the head is at most `limit` long and ends on a
 * whole word. A single word longer than the limit is cut mid-word: better
 * than never reading it, and better than an unbounded request.
 */
function wordBoundaryBefore(text: string, limit: number): number {
  // One past the limit, so a word that ends exactly at the limit is kept.
  const lastGap = text.slice(0, limit + 1).search(/\s\S*$/);
  return lastGap > 0 ? lastGap : limit;
}
