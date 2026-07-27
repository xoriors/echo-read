/**
 * Speech synthesis is billed and rate-limited per call, and long passages time
 * out, so a document is narrated in pieces. Splitting on sentence boundaries
 * keeps the seams from landing mid-thought.
 */
export const DEFAULT_MAX_CHUNK_LENGTH = 4000;

const SENTENCE = /[^.!?\n]+[.!?\n]+/g;

export function splitIntoChunks(text: string, maxLength = DEFAULT_MAX_CHUNK_LENGTH): string[] {
  const sentences = text.match(SENTENCE) ?? [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLength && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += ` ${sentence}`;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks;
}
