import type { LibraryState } from '../../domain/library';

/**
 * Driven port for where history and read-later live. The in-memory adapter is
 * the default; a persistent one is a swap in the composition root.
 */
export interface LibraryRepository {
  read(): LibraryState;
  write(state: LibraryState): void;
}
