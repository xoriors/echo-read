
import type { VideoSegment } from '../../../shared/domain/videoSegments';

/**
 * Driven port: parts of a video that viewers have marked as skippable.
 * Never fails: when there is nothing or the source is down, it returns [].
 */
export interface SponsorSegmentSource {
  segmentsFor(videoId: string): Promise<VideoSegment[]>;
}
