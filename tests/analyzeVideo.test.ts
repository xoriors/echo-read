/**
 * The video use case with the cache in front of it: the model is asked once
 * per video, and a broken cache never costs the reader their analysis.
 */
import type {
  AnalysisRequest,
  AnalysisResult,
  ContentAnalyzer,
} from '../src/server/application/ports/contentAnalyzer';
import type { Logger } from '../src/server/application/ports/logger';
import type {
  CachedVideoAnalysis,
  SaveVideoAnalysisCommand,
  VideoAnalysisCache,
} from '../src/server/application/ports/videoAnalysisCache';
import { AnalyzeVideoUseCase } from '../src/server/application/usecases/analyzeVideo';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) {
    failures.push(label);
  }
};

const VIDEO_ID = 'dQw4w9WgXcQ';
const LINK = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const SHORT_LINK = `https://youtu.be/${VIDEO_ID}`;

/** A reply in the shape the video prompt asks for. */
const REPLY = `VIDEO_TITLE: Async Rust Without the Pain
VIDEO_URL: ${LINK}
---
**Summary:** how to avoid blocking the runtime.`;

/** Answers every request the same way, and counts how often it was asked. */
class CountingAnalyzer implements ContentAnalyzer {
  calls = 0;
  async analyze(_request: AnalysisRequest): Promise<AnalysisResult> {
    this.calls += 1;
    return { text: REPLY, sources: [], model: 'gemini-test' };
  }
}

/** The cache port backed by a plain Map, so no database is needed. */
class InMemoryCache implements VideoAnalysisCache {
  saved = new Map<string, CachedVideoAnalysis>();
  async get(videoId: string, promptVersion: number): Promise<CachedVideoAnalysis | null> {
    const entry = this.saved.get(`${videoId}:${promptVersion}`);
    if (entry === undefined) {
      return null;
    }
    return entry;
  }
  async put(entry: SaveVideoAnalysisCommand): Promise<void> {
    const createdAt = new Date().toISOString();
    this.saved.set(`${entry.videoId}:${entry.promptVersion}`, { ...entry, createdAt });
  }
}

/** A cache whose storage is gone, like a missing data directory. */
class BrokenCache implements VideoAnalysisCache {
  async get(): Promise<CachedVideoAnalysis | null> {
    throw new Error('disk is gone');
  }
  async put(): Promise<void> {
    throw new Error('disk is gone');
  }
}

/** Keeps every log message, so the test can see what was reported. */
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

// The second request for a video is served from the cache.
{
  const analyzer = new CountingAnalyzer();
  const cache = new InMemoryCache();
  const logger = new RecordingLogger();
  const useCase = new AnalyzeVideoUseCase(analyzer, cache, logger);
  const first = await useCase.execute({ url: LINK });
  check(analyzer.calls === 1, 'the first request asks the model');
  check(cache.saved.size === 1, 'and saves the analysis');
  check(cache.saved.get(`${VIDEO_ID}:1`)?.model === 'gemini-test', 'together with the model that wrote it');
  const second = await useCase.execute({ url: LINK });
  check(analyzer.calls === 1, 'the second request does not ask the model again');
  check(JSON.stringify(second) === JSON.stringify(first), 'and returns the same analysis');
  check(logger.messages.includes('Video analysis served from cache'), 'and says in the log that it was a cache hit');
  await useCase.execute({ url: SHORT_LINK });
  check(analyzer.calls === 1, 'a different link to the same video is a hit too');
}

// Links that are not a YouTube video still work, uncached.
{
  const analyzer = new CountingAnalyzer();
  const cache = new InMemoryCache();
  const useCase = new AnalyzeVideoUseCase(analyzer, cache, new RecordingLogger());
  await useCase.execute({ url: 'https://vimeo.com/123456' });
  await useCase.execute({ url: 'https://vimeo.com/123456' });
  check(analyzer.calls === 2, 'a non-YouTube link is analysed every time');
  check(cache.saved.size === 0, 'and never saved');
}

// A broken cache does not break the analysis.
{
  const analyzer = new CountingAnalyzer();
  const logger = new RecordingLogger();
  const useCase = new AnalyzeVideoUseCase(analyzer, new BrokenCache(), logger);
  let analysis = null;
  try {
    analysis = await useCase.execute({ url: LINK });
  } catch {
    analysis = null;
  }
  check(analysis !== null, 'the analysis still comes back when the cache is down');
  check(analyzer.calls === 1, 'by asking the model');
  check(logger.messages.includes('Video cache unavailable; analysing again'), 'the failed read is logged, not hidden');
  check(logger.messages.includes('Could not save video analysis to cache'), 'and so is the failed save');
}

// ?refresh=1 skips the cache and replaces what was saved.
{
  const analyzer = new CountingAnalyzer();
  const cache = new InMemoryCache();
  const useCase = new AnalyzeVideoUseCase(analyzer, cache, new RecordingLogger());
  await useCase.execute({ url: LINK });
  const savedBefore = cache.saved.get(`${VIDEO_ID}:1`)?.createdAt;
  await new Promise((resolve) => setTimeout(resolve, 5));
  await useCase.execute({ url: LINK, refresh: true });
  check(analyzer.calls === 2, 'a refresh asks the model even though the video is cached');
  check(cache.saved.get(`${VIDEO_ID}:1`)?.createdAt !== savedBefore, 'and saves the new analysis over the old one');
  await useCase.execute({ url: LINK });
  check(analyzer.calls === 2, 'after a refresh, the next normal request is a cache hit again');
}

console.log(failures.length === 0 ? '\nAll passed' : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);