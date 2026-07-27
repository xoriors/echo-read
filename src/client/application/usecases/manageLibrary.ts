import type { SourceKind } from '../../../shared/domain/contentSource';
import type { GroundingSource } from '../../../shared/domain/groundingSource';
import {
  recordInHistory,
  saveForLater,
  type LibraryEntry,
  type LibraryState,
} from '../../domain/library';
import type { LibraryRepository } from '../ports/libraryRepository';
import type { Unsubscribe } from '../ports/statusChannel';

export interface NewLibraryEntry {
  kind: SourceKind;
  title: string;
  url?: string;
  pdfUrl?: string;
  text: string;
  sources: GroundingSource[];
  videoSource: GroundingSource | null;
}

/**
 * Owns history and the read-later list.
 *
 * The rules (cap, de-duplication) live in the domain; persistence lives behind
 * {@link LibraryRepository}; this class is the observable seam between them.
 */
export class LibraryService {
  private state: LibraryState;
  private readonly listeners = new Set<() => void>();
  private sequence = 0;

  constructor(
    private readonly repository: LibraryRepository,
    private readonly now: () => number = Date.now,
  ) {
    this.state = repository.read();
  }

  getSnapshot = (): LibraryState => this.state;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  remember(entry: NewLibraryEntry): LibraryEntry {
    const created = this.materialise(entry);
    this.commit(recordInHistory(this.state, created));
    return created;
  }

  saveForLater(entry: NewLibraryEntry): void {
    this.commit(saveForLater(this.state, this.materialise(entry)));
  }

  private materialise(entry: NewLibraryEntry): LibraryEntry {
    const createdAt = this.now();
    return { ...entry, id: `${createdAt}-${this.sequence++}`, createdAt };
  }

  private commit(next: LibraryState): void {
    if (next === this.state) return;

    this.state = next;
    this.repository.write(next);
    this.listeners.forEach((listener) => listener());
  }
}
