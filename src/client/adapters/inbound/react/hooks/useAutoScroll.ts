import { useEffect, type RefObject } from 'react';

/** Id the highlighter puts on the active word, so scrolling can find it. */
export const ACTIVE_WORD_ID = 'active-highlight-word';

const MANUAL_SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ', 'Home', 'End'];

interface AutoScrollOptions {
  enabled: boolean;
  /** Narration progress, 0–1: re-runs the scroll as reading advances. */
  progress: number;
  textRef: RefObject<HTMLElement | null>;
  /** Called when the reader scrolls themselves and takes back control. */
  onManualScroll: () => void;
}

/**
 * Keeps the passage being read near the middle of the viewport, and steps
 * aside the moment the reader scrolls for themselves.
 */
export function useAutoScroll({ enabled, progress, textRef, onManualScroll }: AutoScrollOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handle = (event: Event) => {
      if (event.type === 'keydown' && !MANUAL_SCROLL_KEYS.includes((event as KeyboardEvent).key)) return;
      onManualScroll();
    };

    const options: AddEventListenerOptions = { passive: true };
    window.addEventListener('wheel', handle, options);
    window.addEventListener('touchmove', handle, options);
    window.addEventListener('keydown', handle, options);

    return () => {
      window.removeEventListener('wheel', handle);
      window.removeEventListener('touchmove', handle);
      window.removeEventListener('keydown', handle);
    };
  }, [enabled, onManualScroll]);

  useEffect(() => {
    if (!enabled) return;
    window.scrollTo({ top: targetScrollTop(textRef.current, progress) ?? window.scrollY });
  }, [enabled, progress, textRef]);
}

function targetScrollTop(textElement: HTMLElement | null, progress: number): number | null {
  const activeWord = document.getElementById(ACTIVE_WORD_ID);

  if (activeWord) {
    const rect = activeWord.getBoundingClientRect();
    return rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2;
  }

  // No highlight to aim at (it is switched off): fall back to proportional.
  if (!textElement) return null;
  const top = textElement.getBoundingClientRect().top + window.scrollY;
  return top + textElement.offsetHeight * progress - window.innerHeight / 2;
}
