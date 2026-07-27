import { useSyncExternalStore } from 'react';

import type { LibraryState } from '../../../../domain/library';
import { useContainer } from '../ContainerContext';

export function useLibrary(): LibraryState {
  const { library } = useContainer();
  return useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot);
}
