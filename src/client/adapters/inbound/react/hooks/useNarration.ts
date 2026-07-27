import { useSyncExternalStore } from 'react';

import type { NarrationSnapshot } from '../../../../application/narrationPlayer';
import { useContainer } from '../ContainerContext';

/** Binds the React tree to the player's snapshot without owning any of it. */
export function useNarration(): NarrationSnapshot {
  const { player } = useContainer();
  return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
}
