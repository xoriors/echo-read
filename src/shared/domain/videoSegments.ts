/**
 * The parts of a video and what each one is: real content or something a
 * viewer could skip.
 */

/** What a stretch of the video is. */
export type SegmentKind =
  | 'content'
  | 'intro'
  | 'outro'
  | 'sponsor'
  | 'self_promo'
  | 'filler'
  | 'tangent';

/** One stretch of the video. */
export interface VideoSegment {
  start: number;
  end: number;
  kind: SegmentKind;
}

/** The model's call on whether a video is worth the time. */
export type VerdictCall = 'watch' | 'skim' | 'skip';

/** True for anything except real content. */
export function isSkippable(kind: SegmentKind): boolean {
  return kind !== 'content';
}

export function contentSeconds(segments: readonly VideoSegment[]): number {
  let total = 0;
  for (const segment of segments) {
    if (!isSkippable(segment.kind)) {
      total += segment.end - segment.start;
    }
  }
  return total;
}

export function contentDensity(segments: readonly VideoSegment[], durationSeconds: number): number {
  if (durationSeconds <= 0) {
    return 0;
  }
  const density = contentSeconds(segments) / durationSeconds;
  return Math.min(Math.max(density, 0), 1);
}

/** Combines the model's segments with the ones from SponsorBlock. */
export function mergeSegments(
  modelSegments: readonly VideoSegment[],
  sponsorBlockSegments: readonly VideoSegment[],
): VideoSegment[] {
  const merged: VideoSegment[] = [...sponsorBlockSegments];
  for (const segment of modelSegments) {
    const pieces = cutAround(segment, sponsorBlockSegments);
    merged.push(...pieces);
  }
  merged.sort((a, b) => a.start - b.start);
  return merged;
}

/** The parts of segment that none of the cuts overlap. */
function cutAround(segment: VideoSegment, cuts: readonly VideoSegment[]): VideoSegment[] {
  let pieces: VideoSegment[] = [segment];
  for (const cut of cuts) {
    const remaining: VideoSegment[] = [];
    for (const piece of pieces) {
      const overlaps = cut.start < piece.end && cut.end > piece.start;
      if (!overlaps) {
        remaining.push(piece);
        continue;
      }
      if (cut.start > piece.start) {
        remaining.push({ ...piece, end: cut.start });
      }
      if (cut.end < piece.end) {
        remaining.push({ ...piece, start: cut.end });
      }
    }
    pieces = remaining;
  }
  return pieces;
}