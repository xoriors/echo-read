import { ValidationError } from '../src/shared/domain/errors';
import { extractYoutubeVideoId, normalizeYoutubeUrl } from '../src/server/domain/youtubeUrl';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) {
        failures.push(label);
    }
};

const ID = 'o4I_hOz_MLw';
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

// true when the link is rejected with a ValidationError
function isRejected(link: string): boolean {
    try {
        normalizeYoutubeUrl(link);
        return false;
    } catch (error) {
        return error instanceof ValidationError;
    }
}

// links that must work
const workingLinks = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=30s`,
    `https://www.youtube.com/watch?v=${ID}&list=PL1234567890`,
    `https://www.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=30`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
];

for (const link of workingLinks) {
    check(normalizeYoutubeUrl(link) === CANONICAL, `accepts '${link}'`);
}
check(extractYoutubeVideoId(`https://youtu.be/${ID}`) === ID, 'reads the id from a link');


// links that must be rejected
const badLinks = [
    '',
    'abc',
    `https://example.com/watch?v=${ID}`,
    `https://evilyoutube.com/watch?v=${ID}`,
    `https://www.youtube.com.evil.com/watch?v=${ID}`,
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=abc',
    'https://www.youtube.com/watch?v=abc!defghij',
    'https://youtu.be/',
    'https://www.youtube.com/shorts/',
    'https://www.youtube.com/playlist?list=PL1234567890',
    'https://www.youtube.com/',
    `ftp://www.youtube.com/watch?v=${ID}`,
];

for (const link of badLinks) {
    check(isRejected(link), `rejects '${link}'`);
}
console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
