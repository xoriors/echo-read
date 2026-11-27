/** The SponsorBlock adapter, with a fake fetch so no real request is made. */
import type { Logger } from '../src/server/application/ports/logger';
import {
  type FetchPage,
  SponsorBlockSegmentSource,
} from '../src/server/adapters/outbound/sponsorblock/sponsorBlockSegmentSource';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    failures.push(label);
  }
};

const VIDEO_ID = 'dQw4w9WgXcQ';
const TEST_TIMEOUT_MS = 20;
const HANGING_CONNECTION_MS = 5000;

/** Keeps every log message. */
class RecordingLogger implements Logger {
  messages: string[] = [];
  debug(message: string): void {
    this.messages.push(message);
  }
  info(message: string): void {
    this.messages.push(message);
  }
  warn(message: string): void {
    this.messages.push(message);
  }
  error(message: string): void {
    this.messages.push(message);
  }
}

function answering(status: number, body: unknown): FetchPage {
  return async () => new Response(JSON.stringify(body), { status });
}

{
  let requestedUrl = '';
  const fetchPage: FetchPage = async (url) => {
    requestedUrl = url;
    return new Response(
      JSON.stringify([
        { segment: [12.5, 40], category: 'sponsor', actionType: 'skip' },
        { segment: [0, 8], category: 'intro', actionType: 'skip' },
        { segment: [300, 315], category: 'selfpromo', actionType: 'skip' },
      ]),
      { status: 200 },
    );
  };
  const source = new SponsorBlockSegmentSource(new RecordingLogger(), fetchPage);
  const segments = await source.segmentsFor(VIDEO_ID);
  check(segments.length === 3, 'every marked segment comes back');
  check(
    segments[0].start === 12.5 && segments[0].end === 40 && segments[0].kind === 'sponsor',
    'with its start, end and kind',
  );
  check(segments[2].kind === 'self_promo', "SponsorBlock's 'selfpromo' becomes our 'self_promo'");
  check(requestedUrl.includes(`videoID=${VIDEO_ID}`), 'the request asks for the right video');
  check(requestedUrl.includes('sponsor') && requestedUrl.includes('intro'), 'and for the categories we use');
}

// Nothing marked is not an error.
{
  const logger = new RecordingLogger();
  const source = new SponsorBlockSegmentSource(logger, answering(404, 'Not Found'));
  const segments = await source.segmentsFor(VIDEO_ID);
  check(segments.length === 0, 'a video nobody has marked gives an empty list');
  check(logger.messages.length === 0, 'and nothing is logged, since that is normal');
}

{
  const logger = new RecordingLogger();
  const source = new SponsorBlockSegmentSource(logger, answering(500, 'oops'));
  const segments = await source.segmentsFor(VIDEO_ID);
  check(segments.length === 0, 'a server error gives an empty list');
  check(logger.messages.includes('SponsorBlock refused the request; going on without it'), 'and is logged');
}
{
  const logger = new RecordingLogger();
  const offline: FetchPage = async () => {
    throw new Error('getaddrinfo ENOTFOUND sponsor.ajay.app');
  };
  const source = new SponsorBlockSegmentSource(logger, offline);
  const segments = await source.segmentsFor(VIDEO_ID);
  check(segments.length === 0, 'no network gives an empty list');
  check(logger.messages.includes('SponsorBlock unreachable; going on without it'), 'and is logged');
}
{
  const logger = new RecordingLogger();
  // Never answers on its own; only gives up when the request is aborted.
  const hanging: FetchPage = (_url, init) =>
    new Promise((_resolve, reject) => {
      const connection = setTimeout(() => { }, HANGING_CONNECTION_MS);
      init.signal?.addEventListener('abort', () => {
        clearTimeout(connection);
        reject(new Error('timed out'));
      });
    });
  const source = new SponsorBlockSegmentSource(logger, hanging, TEST_TIMEOUT_MS);
  const segments = await source.segmentsFor(VIDEO_ID);
  check(segments.length === 0, 'a request that hangs is given up on');
  check(logger.messages.includes('SponsorBlock unreachable; going on without it'), 'and that is logged too');
}
{
  const logger = new RecordingLogger();
  const notJson: FetchPage = async () => new Response('<html>maintenance</html>', { status: 200 });
  const source = new SponsorBlockSegmentSource(logger, notJson);
  const segments = await source.segmentsFor(VIDEO_ID);
  check(segments.length === 0, 'an answer that is not JSON gives an empty list');
  check(logger.messages.includes('SponsorBlock sent something unreadable; going on without it'), 'and is logged');
}

// Malformed items are skipped, the rest kept.
{
  const source = new SponsorBlockSegmentSource(
    new RecordingLogger(),
    answering(200, [
      { segment: [10, 20], category: 'sponsor' },
      { segment: [30, 25], category: 'sponsor' },
      { segment: ['a', 'b'], category: 'sponsor' },
      { segment: [40, 50], category: 'music_offtopic' },
      { segment: [60, 70], category: 'toString' },
      { category: 'sponsor' },
      null,
    ]),
  );
  const segments = await source.segmentsFor(VIDEO_ID);
  check(segments.length === 1 && segments[0].start === 10, 'only the well-formed, known segment is kept');
}
{
  const source = new SponsorBlockSegmentSource(new RecordingLogger(), answering(200, { not: 'a list' }));
  const segments = await source.segmentsFor(VIDEO_ID);
  check(segments.length === 0, 'an answer that is not a list gives an empty list');
}

console.log(failures.length === 0 ? '\nAll passed' : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);