import type { LibraryRepository } from '../../../application/ports/libraryRepository';
import { EMPTY_LIBRARY, type LibraryEntry, type LibraryState } from '../../../domain/library';

export const LIBRARY_STORAGE_KEY = 'echoread.library.v1';

/**
 * History that survives a refresh.
 *
 * The in-memory adapter this replaces lasted as long as the tab, which made the
 * library useless for the thing it exists for: coming back. A reader who closed
 * the tab had no route back to a document except pasting it again — and with
 * study decks kept per owner on the server, that meant re-pasting a document to
 * reach work that was already saved.
 *
 * Entries carry the document's full text, so this can grow. `HISTORY_LIMIT`
 * bounds history; read-later is the reader's own list and is left alone, but a
 * quota failure is swallowed — losing history is a far better outcome than a
 * throw that takes the page down mid-read.
 */
export class LocalStorageLibraryRepository implements LibraryRepository {
  constructor(
    private readonly storage: Storage | null = safeStorage(),
    private readonly key: string = LIBRARY_STORAGE_KEY,
  ) {}

  read(): LibraryState {
    const raw = this.storage?.getItem(this.key);
    if (!raw) return EMPTY_LIBRARY;

    try {
      const parsed: unknown = JSON.parse(raw);
      return {
        history: entriesOf(parsed, 'history'),
        readLater: entriesOf(parsed, 'readLater'),
      };
    } catch {
      // Corrupt or written by an older shape: start clean rather than crash on
      // every read from here on.
      return EMPTY_LIBRARY;
    }
  }

  write(state: LibraryState): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(state));
    } catch {
      // Out of quota, or storage disabled after construction. The reader keeps
      // their session; only the record of it is lost.
    }
  }
}

/**
 * `localStorage` throws on access in some privacy modes rather than being
 * absent, so it is probed once here instead of at every call site.
 */
function safeStorage(): Storage | null {
  try {
    const probe = '__echoread_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Anything that is not a well-formed entry is dropped, not repaired. */
function entriesOf(parsed: unknown, field: 'history' | 'readLater'): LibraryEntry[] {
  const list: unknown = (parsed as Record<string, unknown> | null)?.[field];
  if (!Array.isArray(list)) return [];

  return list.filter(isEntry);
}

function isEntry(value: unknown): value is LibraryEntry {
  const entry = value as LibraryEntry | null;

  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.text === 'string' &&
    typeof entry.kind === 'string' &&
    Array.isArray(entry.sources)
  );
}
