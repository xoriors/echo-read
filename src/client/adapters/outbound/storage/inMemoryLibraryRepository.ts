import type { LibraryRepository } from '../../../application/ports/libraryRepository';
import { EMPTY_LIBRARY, type LibraryState } from '../../../domain/library';

/**
 * Session-scoped storage: history lasts as long as the tab does.
 *
 * Swapping in a `localStorage`- or server-backed repository is a one-line
 * change in the composition root; nothing above this port would notice.
 */
export class InMemoryLibraryRepository implements LibraryRepository {
  private state: LibraryState = EMPTY_LIBRARY;

  read(): LibraryState {
    return this.state;
  }

  write(state: LibraryState): void {
    this.state = state;
  }
}
