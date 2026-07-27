import { useEffect, useRef, useState } from 'react';

export const SLEEP_TIMER_OPTIONS = [
  { minutes: 0, label: 'Off' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '60m' },
] as const;

/**
 * Counts down from the selected duration and fires once when it reaches zero.
 * Returns the seconds remaining, or `null` when no timer is armed.
 */
export function useSleepTimer(minutes: number, onElapsed: () => void): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  const onElapsedRef = useRef(onElapsed);
  onElapsedRef.current = onElapsed;

  useEffect(() => {
    if (minutes <= 0) {
      setRemaining(null);
      return;
    }

    setRemaining(minutes * 60);
    const interval = setInterval(() => {
      setRemaining((previous) => {
        if (previous === null) return null;
        if (previous <= 1) {
          onElapsedRef.current();
          return null;
        }
        return previous - 1;
      });
    }, 1_000);

    return () => clearInterval(interval);
  }, [minutes]);

  return remaining;
}
