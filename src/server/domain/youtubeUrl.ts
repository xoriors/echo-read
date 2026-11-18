import { ValidationError } from '../../shared/domain/errors';

const ERROR_MESSAGE = 'Please enter a valid YouTube video link!';

// the hosts we accept; any other site is rejected
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];

// a YouTube video id has 11 chars: letters, digits, _ and -
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// reads the video id from a YT link or throws a ValidationError
// works with watch?v=, youtu.be/, /shorts/ and /live/ links
export function extractYoutubeVideoId(input: string): string {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        // 'abc' or an empty string is not a link at all
        throw new ValidationError(ERROR_MESSAGE);
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new ValidationError(ERROR_MESSAGE);
    }

    const host = url.hostname.toLowerCase();

    // transform '/shorts/abc' in ['shorts', 'abc']
    const parts = url.pathname.split('/').filter(Boolean);
    let videoId = '';

    if (host === 'youtu.be') {
        // https://youtu.be/ID
        videoId = parts[0] || '';
    } else if (YOUTUBE_HOSTS.includes(host)) {
        if (parts[0] === 'watch') {
            // https://www.youtube.com/watch?v=ID
            videoId = url.searchParams.get('v') || '';
        } else if (parts[0] === 'shorts' || parts[0] === 'live') {
            // https://www.youtube.com/shorts/ID
            videoId = parts[1] || '';
        }
    }

    if (!VIDEO_ID_PATTERN.test(videoId)) {
        throw new ValidationError(ERROR_MESSAGE);
    }

    return videoId;
}

// any valid YouTube link becomes https://www.youtube.com/watch?v=ID
export function normalizeYoutubeUrl(input: string): string {
    const videoId = extractYoutubeVideoId(input);
    return `https://www.youtube.com/watch?v=${videoId}`;
}
