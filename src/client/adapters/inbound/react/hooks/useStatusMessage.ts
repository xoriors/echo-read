import { useEffect, useState } from 'react';

import { useContainer } from '../ContainerContext';

/** Surfaces whatever the status port last announced ("Waiting 30s…"). */
export function useStatusMessage(): [string, (message: string) => void] {
  const { status } = useContainer();
  const [message, setMessage] = useState('');

  useEffect(() => status.subscribe(setMessage), [status]);

  return [message, (next: string) => status.publish(next)];
}
