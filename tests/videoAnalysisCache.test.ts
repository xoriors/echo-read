/**
 * The SQLite side of the video cache: what goes in comes back out the same.
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { migrate } from '../src/server/adapters/outbound/sqlite/migrations';
import { SqliteDatabaseProvider } from '../src/server/adapters/outbound/sqlite/sqliteDatabase';
import { SqliteVideoAnalysisCache } from '../src/server/adapters/outbound/sqlite/sqliteVideoAnalysisCache';
import type { VideoAnalysis } from '../src/server/domain/contentDocument';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) {
    failures.push(label);
  }
};

// A new database in a scratch folder.
const DIR = path.join(process.cwd(), '.test-data', 'video-cache');
rmSync(DIR, { recursive: true, force: true });
const provider = new SqliteDatabaseProvider(DIR);
migrate(provider.get());
const cache = new SqliteVideoAnalysisCache(provider);
const VIDEO_ID = 'dQw4w9WgXcQ';
const ANALYSIS: VideoAnalysis = {
  text: '**Summary:** a short talk about caching.',
  sources: [{ title: 'Some page', uri: `https://example.com/page` }],
  videoSource: { title: 'The video', uri: `https://www.youtube.com/watch?v=${VIDEO_ID}` },
};

check((await cache.get(VIDEO_ID, 1)) === null, 'an empty cache misses');

// Save and read back.
await cache.put({
  videoId: VIDEO_ID,
  promptVersion: 1,
  model: 'gemini-test',
  durationSeconds: 2530,
  analysis: ANALYSIS,
});

const saved = await cache.get(VIDEO_ID, 1);
check(saved !== null, 'a saved analysis is found again');
check(JSON.stringify(saved?.analysis) === JSON.stringify(ANALYSIS),
  'the analysis comes back exactly as it was saved');
check(saved?.model === 'gemini-test', 'the model is kept');
check(saved?.durationSeconds === 2530, 'the duration is kept');
check(typeof saved?.createdAt === 'string' && saved.createdAt.length > 0, 'the database fills in when it was saved');

// Only the exact video and version.
check((await cache.get(VIDEO_ID, 2)) === null, 'a newer prompt version misses');
check((await cache.get('aaaaaaaaaaa', 1)) === null, 'another video misses');

// A missing duration is allowed.
await cache.put({
  videoId: 'bbbbbbbbbbb',
  promptVersion: 1,
  model: 'gemini-test',
  durationSeconds: null,
  analysis: ANALYSIS,
});
check((await cache.get('bbbbbbbbbbb', 1))?.durationSeconds === null, 'an unknown duration is stored as null');

// Saving again replaces the old analysis.
const NEWER: VideoAnalysis = { ...ANALYSIS, text: '**Summary:** a newer take.' };
await cache.put({
  videoId: VIDEO_ID,
  promptVersion: 1,
  model: 'gemini-newer',
  durationSeconds: 2530,
  analysis: NEWER,
});
const replaced = await cache.get(VIDEO_ID, 1);
check(replaced?.analysis.text === NEWER.text, 're-analysing a video replaces the old analysis');
check(replaced?.model === 'gemini-newer', 'and records the model that did it');
provider.close();
rmSync(DIR, { recursive: true, force: true });
console.log(failures.length === 0 ? '\nAll passed' : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);