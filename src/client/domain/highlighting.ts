export interface TextRange {
  start: number;
  /** Exclusive. */
  end: number;
}

/**
 * The word to highlight when narration is `progress` (0–1) through `text`.
 *
 * Audio gives us elapsed time, not word boundaries, so the position is
 * estimated proportionally and then widened to the surrounding word — close
 * enough to follow along, and never mid-word.
 */
export function activeWordRange(text: string, progress: number): TextRange | null {
  if (!text) return null;

  const clamped = Math.min(Math.max(progress, 0), 1);
  let cursor = Math.min(Math.floor(clamped * text.length), text.length - 1);
  if (cursor < 0) cursor = 0;

  // Landing on whitespace means we are between words; take the one just read.
  while (cursor > 0 && !isWordCharacter(text[cursor])) cursor--;

  let start = cursor;
  while (start > 0 && isWordCharacter(text[start - 1])) start--;

  let end = cursor;
  while (end < text.length && isWordCharacter(text[end])) end++;

  return end > start ? { start, end } : null;
}

/**
 * The first character of the word at `index`.
 *
 * A tap lands wherever the finger lands — usually mid-word — but narration
 * should resume at a word boundary rather than halfway through one. Landing on
 * whitespace between words snaps forward to the next word, so tapping a gap
 * never replays the word before it.
 */
export function wordStartAt(text: string, index: number): number {
  if (!text) return 0;

  let cursor = Math.min(Math.max(index, 0), text.length);

  while (cursor < text.length && !isWordCharacter(text[cursor])) cursor++;
  if (cursor >= text.length) return text.length;

  while (cursor > 0 && isWordCharacter(text[cursor - 1])) cursor--;

  return cursor;
}

function isWordCharacter(character: string): boolean {
  return /\S/.test(character);
}
