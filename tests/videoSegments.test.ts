/** The skip map's arithmetic. */

import {
  contentDensity,
  contentSeconds,
  isSkippable,
  mergeSegments,
  type VideoSegment,
} from '../src/shared/domain/videoSegments';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) {
    failures.push(label);
  }
};

const describe = (segments: readonly VideoSegment[]): string =>
  segments.map((segment) => `${segment.start}-${segment.end} ${segment.kind}`).join(', ');

// What counts as skippable.
check(!isSkippable('content'), 'content is not skippable');
check(isSkippable('sponsor') && isSkippable('filler') && isSkippable('intro'), 'everything else is');

const TEN_MINUTES = 600;
const tenMinuteVideo: VideoSegment[] = [
  { start: 0, end: 30, kind: 'intro' },
  { start: 30, end: 300, kind: 'content' },
  { start: 300, end: 360, kind: 'sponsor' },
  { start: 360, end: 570, kind: 'content' },
  { start: 570, end: 600, kind: 'outro' },
];
check(contentSeconds(tenMinuteVideo) === 480, 'content seconds add up only the content parts');
check(contentDensity(tenMinuteVideo, TEN_MINUTES) === 0.8, 'density is content seconds over the whole video');
check(contentDensity([], TEN_MINUTES) === 0, 'no segments means no known content');
check(contentDensity(tenMinuteVideo, 0) === 0, 'an unknown length gives 0 instead of dividing by zero');
check(contentDensity(tenMinuteVideo, 100) === 1, 'density never goes above 1, even with a wrong length');

// Merging
const model: VideoSegment[] = [
  { start: 0, end: 120, kind: 'content' },
  { start: 120, end: 180, kind: 'filler' },
  { start: 180, end: 300, kind: 'content' },
];

check(
  describe(mergeSegments(model, [])) === describe(model),
  'without SponsorBlock data the model segments are kept as they are',
);

const sponsorInTheMiddle = mergeSegments(model, [{ start: 60, end: 90, kind: 'sponsor' }]);
check(
  describe(sponsorInTheMiddle) === '0-60 content, 60-90 sponsor, 90-120 content, 120-180 filler, 180-300 content',
  'a sponsor inside a content part splits it in two',
);

const sponsorAcrossTwo = mergeSegments(model, [{ start: 100, end: 200, kind: 'sponsor' }]);
check(
  describe(sponsorAcrossTwo) === '0-100 content, 100-200 sponsor, 200-300 content',
  'a sponsor across several parts trims both sides and drops what it covers',
);

const sponsorAtTheStart = mergeSegments(model, [{ start: 0, end: 120, kind: 'sponsor' }]);
check(
  describe(sponsorAtTheStart) === '0-120 sponsor, 120-180 filler, 180-300 content',
  'a sponsor that covers a whole part replaces it',
);

const twoCuts = mergeSegments(
  [{ start: 0, end: 300, kind: 'content' }],
  [
    { start: 200, end: 230, kind: 'self_promo' },
    { start: 50, end: 80, kind: 'sponsor' },
  ],
);
check(
  describe(twoCuts) === '0-50 content, 50-80 sponsor, 80-200 content, 200-230 self_promo, 230-300 content',
  'several SponsorBlock segments all cut, and the result is in time order',
);

console.log(failures.length === 0 ? '\nAll passed' : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);