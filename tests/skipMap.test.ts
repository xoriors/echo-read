/**
 * What the skip map shows: the verdict chip's text, and where each segment
 * sits on the timeline bar.
 */
import { timelineBlocks, verdictSummary } from '../src/client/domain/skipMap';
import type { VideoSegment } from '../src/shared/domain/videoSegments';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) {
    failures.push(label);
  }
};

const FORTY_TWO_MINUTES = 42 * 60;
const FLOAT_TOLERANCE = 1e-9;
const mockupVideo: VideoSegment[] = [
  { start: 0, end: 60, kind: 'intro' },
  { start: 60, end: 60 + 18 * 60, kind: 'content' },
  { start: 60 + 18 * 60, end: FORTY_TWO_MINUTES, kind: 'filler' },
];

// The verdict chip.
check(
  verdictSummary('skim', mockupVideo, FORTY_TWO_MINUTES) === 'Skim — ~18 of 42 min matter',
  'the chip reads like the mockup',
);
check(
  verdictSummary('watch', mockupVideo, FORTY_TWO_MINUTES).startsWith('Watch'),
  'each call gets its own label',
);
check(verdictSummary('skip', mockupVideo, 0) === 'Skip', 'without a known length only the call is shown');
check(
  verdictSummary('skim', [{ start: 0, end: 20, kind: 'content' }], 40) === 'Skim — ~0 of 1 min matter',
  'a very short video still counts as at least one minute',
);
check(
  verdictSummary('watch', mockupVideo, 10 * 60) === 'Watch — ~10 of 10 min matter',
  'the content part never claims more minutes than the video has',
);

// The timeline bar.
const TEN_MINUTES = 600;
const blocks = timelineBlocks(
  [
    { start: 0, end: 60, kind: 'intro' },
    { start: 60, end: 300, kind: 'content' },
    { start: 300, end: 600, kind: 'sponsor' },
  ],
  TEN_MINUTES,
);
check(blocks.length === 3, 'every segment becomes a block');
check(blocks[0].leftPercent === 0 && blocks[0].widthPercent === 10, 'the first minute of ten is the first 10%');
check(blocks[1].leftPercent === 10 && blocks[1].widthPercent === 40, 'the next block starts where it left off');
check(blocks[2].startSeconds === 300, 'clicking a block jumps to where it starts');

const clipped = timelineBlocks(
  [
    { start: -5, end: 30, kind: 'intro' },
    { start: 550, end: 700, kind: 'outro' },
    { start: 650, end: 700, kind: 'filler' },
  ],
  TEN_MINUTES,
);
check(clipped.length === 2, 'a segment entirely past the end is dropped');
check(clipped[0].leftPercent === 0 && clipped[0].startSeconds === 0, 'one starting before 0 is cut at 0');
const clippedEnd = clipped[1].leftPercent + clipped[1].widthPercent;
check(
  Math.abs(clippedEnd - 100) < FLOAT_TOLERANCE,
  'one running past the end stops at the end of the bar',
);
check(timelineBlocks(mockupVideo, 0).length === 0, 'without a known length there is no bar');

console.log(failures.length === 0 ? '\nAll passed' : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);