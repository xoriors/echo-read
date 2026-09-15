/**
 * How a document is cut into parts for synthesis.
 *
 * Nothing plays until the first part has been synthesised in full, so the size
 * of that part *is* the time to first audio. It used to be the same 4000
 * characters as every other part, which is half a minute of silence on a long
 * article. Now the parts ramp: a sentence or two first, then a few times more
 * each time, up to the ceiling.
 */
import { Narration } from '../src/client/domain/narration';
import { DEFAULT_CHUNKING, chunkLimitAt, splitIntoChunks } from '../src/client/domain/textChunker';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const SENTENCE = 'Spaced practice distributes study across sessions rather than massing it. ';
/** Long enough to need every step of the ramp and then some. */
const ARTICLE = SENTENCE.repeat(400).trim();

const endsOnSentence = (chunk: string): boolean => /[.!?]$/.test(chunk);
const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

// --- The ramp ----------------------------------------------------------------
check(chunkLimitAt(0) === 300, `the first part is at most 300 characters (got ${chunkLimitAt(0)})`);
check(chunkLimitAt(1) === 900, `the second may be three times that (got ${chunkLimitAt(1)})`);
check(chunkLimitAt(2) === 2700, `and the third three times again (got ${chunkLimitAt(2)})`);
check(chunkLimitAt(3) === 4000, `the fourth reaches the ceiling (got ${chunkLimitAt(3)})`);
check(chunkLimitAt(40) === 4000, 'and it stays there however deep into the document');
check(
  chunkLimitAt(0, { firstLength: 0, growth: 3, maxLength: 4000 }) === 1,
  'a limit is never zero, so a cut always makes progress',
);

const chunks = splitIntoChunks(ARTICLE);
check(chunks.length > 4, `a long article has more than four parts (got ${chunks.length})`);
check(chunks[0].length <= 300, `the first part is short (${chunks[0].length} chars)`);
check(chunks[0].length > 200, `but not a single sentence when more would fit (${chunks[0].length} chars)`);
check(chunks[1].length <= 900 && chunks[1].length > 300, `the second is longer (${chunks[1].length} chars)`);
check(chunks[2].length <= 2700 && chunks[2].length > 900, `the third longer still (${chunks[2].length} chars)`);
check(
  chunks.slice(3, -1).every((chunk) => chunk.length <= 4000 && chunk.length > 2700),
  'the rest fill up to the ceiling',
);
check(chunks.every(endsOnSentence), 'every part ends at a sentence boundary');
check(
  words(chunks.join(' ')).join(' ') === words(ARTICLE).join(' '),
  'and nothing is lost or reordered across the parts',
);

// --- Where the ramp does not apply ------------------------------------------
check(splitIntoChunks('One short sentence.').length === 1, 'a short text is one part');
check(splitIntoChunks(SENTENCE.repeat(3)).length === 1, 'three sentences under the limit are one part');
check(splitIntoChunks('').length === 0, 'an empty text has no parts');
check(splitIntoChunks('\n\n  \n').length === 0, 'whitespace alone has no parts');

// --- Sentences the regex used to drop ---------------------------------------
const tail = splitIntoChunks('First sentence. And a last one with no full stop');
check(tail.join(' ').endsWith('no full stop'), 'a final sentence without a terminator is still read');

// --- A "sentence" longer than a whole part ----------------------------------
const unpunctuated = 'word '.repeat(2000).trim();
const pieces = splitIntoChunks(unpunctuated);
check(pieces[0].length <= 300, `a passage with no punctuation still starts small (${pieces[0].length} chars)`);
check(
  pieces.every((piece) => piece.length <= 4000),
  'and no piece of it exceeds the ceiling',
);
check(
  pieces.every((piece) => words(piece).every((word) => word === 'word')),
  'and it is cut between words, never through one',
);
check(words(pieces.join(' ')).length === 2000, 'with every word kept');

const exact = `${'a'.repeat(148)} ${'b'.repeat(151)} ${'c'.repeat(10)}`;
const fitted = splitIntoChunks(exact);
check(fitted[0].length === 300, `a word ending exactly at the limit is kept in the part (${fitted[0].length})`);

const oneWord = 'x'.repeat(1000);
const hard = splitIntoChunks(oneWord);
check(hard.length > 1 && hard.join('') === oneWord, 'a single word longer than a part is cut rather than sent whole');

// Limits of 10, 20 and 25: the cuts follow the ramp, not the first limit.
const policy = { firstLength: 10, growth: 2, maxLength: 25 };
check(
  splitIntoChunks('aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj', policy).join('|') ===
    'aaaa bbbb|cccc dddd eeee ffff|gggg hhhh iiii jjjj',
  'the ramp is honoured while cutting an over-long sentence',
);

// --- Narration keeps its offsets straight -----------------------------------
const narration = Narration.of(ARTICLE);
check(narration.chunkCount === chunks.length, 'Narration uses the same parts');
check(
  narration.chunks.every(
    (chunk, index) =>
      chunk.startOffset === narration.chunks.slice(0, index).reduce((sum, c) => sum + c.text.length, 0),
  ),
  'each part starts where the previous ones end',
);
check(narration.locate(0).chunkIndex === 0, 'the first character is in the first part');
check(
  narration.locate(narration.chunks[1].startOffset + 5).chunkIndex === 1,
  'a character just inside the second part locates to it',
);
check(
  narration.locate(narration.spokenLength - 1).chunkIndex === narration.chunkCount - 1,
  'the last character is in the last part',
);
check(DEFAULT_CHUNKING.maxLength === 4000, 'the ceiling is unchanged, so the cost per document barely moves');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
