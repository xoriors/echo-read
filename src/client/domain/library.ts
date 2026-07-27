import type { SourceKind } from '../../shared/domain/contentSource';
import type { GroundingSource } from '../../shared/domain/groundingSource';

/** Something the reader already opened, kept so they can return to it. */
export interface LibraryEntry {
  id: string;
  kind: SourceKind;
  title: string;
  /** Original web address, for `url` and `video` entries. */
  url?: string;
  /** Address the PDF was downloaded from, when it was not a local file. */
  pdfUrl?: string;
  text: string;
  sources: GroundingSource[];
  videoSource: GroundingSource | null;
  createdAt: number;
}

export interface LibraryState {
  history: LibraryEntry[];
  readLater: LibraryEntry[];
}

/** Recent history is a convenience, not an archive — keep it short. */
export const HISTORY_LIMIT = 5;

export const EMPTY_LIBRARY: LibraryState = { history: [], readLater: [] };

/** Two entries describe the same material if they point at the same place. */
export function isSameMaterial(left: LibraryEntry, right: LibraryEntry): boolean {
  return (
    left.kind === right.kind &&
    left.title === right.title &&
    left.url === right.url &&
    left.pdfUrl === right.pdfUrl
  );
}

export function recordInHistory(state: LibraryState, entry: LibraryEntry): LibraryState {
  return { ...state, history: [entry, ...state.history].slice(0, HISTORY_LIMIT) };
}

/** Saving the same article twice is a no-op rather than a duplicate row. */
export function saveForLater(state: LibraryState, entry: LibraryEntry): LibraryState {
  if (state.readLater.some((saved) => isSameMaterial(saved, entry))) return state;
  return { ...state, readLater: [entry, ...state.readLater] };
}
