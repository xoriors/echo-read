/**
 * The same video can come as youtu.be/ID, watch?v=ID or /shorts/ID.
 * The analysis cache needs one key for all of them, otherwise it would
 * analyse the same video once per link format.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SHORT_LINK_HOST = 'youtu.be';
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const ID_IN_PATH_PREFIXES = new Set(['shorts', 'embed', 'live', 'v']); // paths that carry the id

/** Returns the video id, or null if the link is not a YouTube video. */
export function youtubeVideoId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(withScheme(link.trim()));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const firstSegment = segments[0] ?? '';
  let candidate: string | null = null;
  if (host === SHORT_LINK_HOST) {
    candidate = firstSegment;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (firstSegment === 'watch') {
      candidate = url.searchParams.get('v');
    } else if (ID_IN_PATH_PREFIXES.has(firstSegment)) {
      candidate = segments[1] ?? null;
    }
  }
  if (candidate === null || !VIDEO_ID_PATTERN.test(candidate)) {
    return null;
  }
  return candidate;
}

/** URL rejects when people paste without a scheme. */
function withScheme(link: string): string {
  if (/^https?:\/\//i.test(link)) {
    return link;
  }
  return `https://${link}`;
}
