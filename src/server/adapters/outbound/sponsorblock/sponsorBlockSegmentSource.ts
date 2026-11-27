import type { Logger } from '../../../application/ports/logger';
import type { SponsorSegmentSource } from '../../../application/ports/sponsorSegmentSource';
import type { SegmentKind, VideoSegment } from '../../../../shared/domain/videoSegments';

const SKIP_SEGMENTS_ENDPOINT = 'https://sponsor.ajay.app/api/skipSegments';
/** The skip map is extra. */
const REQUEST_TIMEOUT_MS = 3000;
const NO_SEGMENTS_STATUS = 404;

const KIND_BY_CATEGORY = new Map<string, SegmentKind>([
  ['sponsor', 'sponsor'],
  ['selfpromo', 'self_promo'],
  ['interaction', 'self_promo'],
  ['intro', 'intro'],
  ['outro', 'outro'],
]);

/** Just enough of fetch for this adapter. */
export type FetchPage = (url: string, init: RequestInit) => Promise<Response>;
export class SponsorBlockSegmentSource implements SponsorSegmentSource {
  constructor(
    private readonly logger: Logger,
    private readonly fetchPage: FetchPage = fetch,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
  ) { }
  async segmentsFor(videoId: string): Promise<VideoSegment[]> {
    const query = new URLSearchParams({
      videoID: videoId,
      categories: JSON.stringify([...KIND_BY_CATEGORY.keys()]),
    });
    const url = `${SKIP_SEGMENTS_ENDPOINT}?${query.toString()}`;
    let response: Response;
    try {
      response = await this.fetchPage(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      this.logger.warn('SponsorBlock unreachable; going on without it', {
        videoId,
        reason: (error as Error).message,
      });
      return [];
    }
    if (response.status === NO_SEGMENTS_STATUS) {
      return [];
    }
    if (!response.ok) {
      this.logger.warn('SponsorBlock refused the request; going on without it', {
        videoId,
        status: response.status,
      });
      return [];
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      this.logger.warn('SponsorBlock sent something unreadable; going on without it', {
        videoId,
        reason: (error as Error).message,
      });
      return [];
    }
    return toVideoSegments(body);
  }
}

/** Turns SponsorBlock's answer into segments. */
function toVideoSegments(body: unknown): VideoSegment[] {
  if (!Array.isArray(body)) {
    return [];
  }
  const segments: VideoSegment[] = [];
  for (const item of body) {
    const times = item?.segment;
    const kind = KIND_BY_CATEGORY.get(item?.category);
    const hasTimes =
      Array.isArray(times) && typeof times[0] === 'number' && typeof times[1] === 'number';
    if (!hasTimes || kind === undefined) {
      continue;
    }
    const start = times[0];
    const end = times[1];
    if (start < 0 || end <= start) {
      continue;
    }
    segments.push({ start, end, kind });
  }
  return segments;
}