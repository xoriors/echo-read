import {
  contentSeconds,
  type SegmentKind,
  type VerdictCall,
  type VideoSegment,
} from '../../shared/domain/videoSegments';

const SECONDS_PER_MINUTE = 60;
const FULL_WIDTH_PERCENT = 100;

const VERDICT_LABELS: Record<VerdictCall, string> = {
  watch: 'Watch',
  skim: 'Skim',
  skip: 'Skip',
};

/** The text on the verdict chip. */
export function verdictSummary(
  call: VerdictCall,
  segments: readonly VideoSegment[],
  durationSeconds: number,
): string {
  const label = VERDICT_LABELS[call];
  if (durationSeconds <= 0) {
    return label;
  }
  const totalMinutes = Math.max(1, Math.round(durationSeconds / SECONDS_PER_MINUTE));
  const contentMinutes = Math.min(totalMinutes, Math.round(contentSeconds(segments) / SECONDS_PER_MINUTE),);
  return `${label} — ~${contentMinutes} of ${totalMinutes} min matter`;
}

/** Where one segment sits on the timeline bar. */
export interface TimelineBlock {
  kind: SegmentKind;
  leftPercent: number;
  widthPercent: number;
  startSeconds: number;
}

/** Places each segment on the timeline bar. */
export function timelineBlocks(
  segments: readonly VideoSegment[],
  durationSeconds: number,
): TimelineBlock[] {
  if (durationSeconds <= 0) {
    return [];
  }
  const blocks: TimelineBlock[] = [];
  for (const segment of segments) {
    const start = Math.max(segment.start, 0);
    const end = Math.min(segment.end, durationSeconds);
    if (end <= start) {
      continue;
    }
    blocks.push({
      kind: segment.kind,
      leftPercent: (start / durationSeconds) * FULL_WIDTH_PERCENT,
      widthPercent: ((end - start) / durationSeconds) * FULL_WIDTH_PERCENT,
      startSeconds: start,
    });
  }
  return blocks;
}