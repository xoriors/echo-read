import {
  LIBRARY_STORAGE_KEY,
  LocalStorageLibraryRepository,
} from '../src/client/adapters/outbound/storage/localStorageLibraryRepository';
import { LibraryService } from '../src/client/application/usecases/manageLibrary';
import { HISTORY_LIMIT } from '../src/client/domain/library';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

/** Enough of the Storage interface to stand in for one. */
function fakeStorage(initial: Record<string, string> = {}): Storage & { failWrites?: boolean } {
  const map = new Map(Object.entries(initial));

  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem(this: { failWrites?: boolean }, key: string, value: string) {
      if (this.failWrites) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as Storage & { failWrites?: boolean };
}

const entry = {
  kind: 'url' as const,
  title: 'Spacing effects',
  url: 'https://example.com/spacing',
  text: 'Spaced practice distributes study across sessions.',
  sources: [],
  videoSource: null,
};

// --- Surviving a reload ----------------------------------------------------
const storage = fakeStorage();
const first = new LibraryService(new LocalStorageLibraryRepository(storage));
first.remember(entry);
first.saveForLater({ ...entry, title: 'Retrieval practice' });

check(!!storage.getItem(LIBRARY_STORAGE_KEY), 'the library is written to storage');

// A second service over the same storage is what a page reload looks like.
const reloaded = new LibraryService(new LocalStorageLibraryRepository(storage));
const state = reloaded.getSnapshot();

check(state.history.length === 1, `history survives a reload (got ${state.history.length})`);
check(state.history[0]?.title === 'Spacing effects', 'with the entry intact');
check(state.history[0]?.text === entry.text, 'and its text, so it can be reopened without re-fetching');
check(state.readLater.length === 1, 'read-later survives too');
check(state.readLater[0]?.title === 'Retrieval practice', 'with the right entry');

// --- History stays bounded -------------------------------------------------
const bounded = new LibraryService(new LocalStorageLibraryRepository(storage));
for (let i = 0; i < HISTORY_LIMIT + 4; i++) bounded.remember({ ...entry, title: `Doc ${i}` });

const after = new LibraryService(new LocalStorageLibraryRepository(storage)).getSnapshot();
check(after.history.length === HISTORY_LIMIT, `history is capped at ${HISTORY_LIMIT} (got ${after.history.length})`);
check(after.history[0]?.title === `Doc ${HISTORY_LIMIT + 3}`, 'newest first');

// --- Bad data costs the library, not the page ------------------------------
const corrupt = new LocalStorageLibraryRepository(fakeStorage({ [LIBRARY_STORAGE_KEY]: '{not json' }));
check(corrupt.read().history.length === 0, 'unparseable storage reads as empty rather than throwing');

const wrongShape = new LocalStorageLibraryRepository(
  fakeStorage({ [LIBRARY_STORAGE_KEY]: '{"history":[{"nope":1},{"id":"a","kind":"url","title":"T","text":"x","sources":[]}]}' }),
);
const salvaged = wrongShape.read();
check(salvaged.history.length === 1, 'a malformed entry is dropped and the rest kept');
check(salvaged.history[0]?.title === 'T', 'the good entry survives');

// --- Storage that refuses to write ----------------------------------------
const full = fakeStorage();
full.failWrites = true;
let threw = false;
try {
  new LibraryService(new LocalStorageLibraryRepository(full)).remember(entry);
} catch {
  threw = true;
}
check(!threw, 'a full or disabled storage does not take the page down mid-read');

// --- No storage at all (private mode) --------------------------------------
const none = new LocalStorageLibraryRepository(null);
check(none.read().history.length === 0, 'no storage reads empty');
let threwWithoutStorage = false;
try {
  none.write({ history: [], readLater: [] });
} catch {
  threwWithoutStorage = true;
}
check(!threwWithoutStorage, 'and writing without storage is a no-op, not a crash');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
