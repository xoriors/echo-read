import React, { forwardRef, useRef } from 'react';

import { activeWordRange, wordStartAt } from '../../../../domain/highlighting';
import { ACTIVE_WORD_ID } from '../hooks/useAutoScroll';

interface HighlightedTextProps {
  text: string;
  /** Narration progress through the document, 0–1. */
  progress: number;
  highlight: boolean;
  fontSize: number;
  /** While false the text is inert: taps select and scroll as usual. */
  tapToSeek: boolean;
  onSeekToCharacter: (characterIndex: number) => void;
}

/** How far a pointer may travel and still count as a tap rather than a scroll. */
const TAP_SLOP_PX = 10;

/** Beyond this a press reads as a long-press — on touch, the selection gesture. */
const TAP_MAX_MS = 700;

interface PointerStart {
  x: number;
  y: number;
  time: number;
}

/**
 * Renders the document and marks the word currently being spoken.
 * The word to mark is decided by the domain; this only paints it.
 *
 * Tapping a word plays from there. A tap is the one gesture that behaves the
 * same under a mouse and a finger — unlike double-click, which on touch
 * collides with double-tap-to-zoom and the selection handles.
 */
export const HighlightedText = forwardRef<HTMLParagraphElement, HighlightedTextProps>(function HighlightedText(
  { text, progress, highlight, fontSize, tapToSeek, onSeekToCharacter },
  ref,
) {
  const start = useRef<PointerStart | null>(null);

  const seekHandlers = tapToSeek
    ? {
        onPointerDown: (event: React.PointerEvent<HTMLParagraphElement>) => {
          start.current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
        },
        onPointerCancel: () => {
          start.current = null;
        },
        onPointerUp: (event: React.PointerEvent<HTMLParagraphElement>) => {
          const from = start.current;
          start.current = null;
          if (!from || !isTap(event, from)) return;

          const offset = characterOffsetAt(event.currentTarget, event.clientX, event.clientY);
          if (offset !== null) onSeekToCharacter(wordStartAt(text, offset));
        },
      }
    : {};

  return (
    <p
      ref={ref}
      {...seekHandlers}
      title={tapToSeek ? 'Tap any word to play from there' : undefined}
      className={
        'text-gray-300 leading-relaxed whitespace-pre-wrap transition-all duration-200' +
        (tapToSeek ? ' cursor-pointer touch-manipulation' : '')
      }
      style={{ fontSize: `${fontSize}px` }}
    >
      {highlight ? <Highlighted text={text} progress={progress} /> : text}
    </p>
  );
});

function Highlighted({ text, progress }: { text: string; progress: number }): React.JSX.Element {
  const range = activeWordRange(text, progress);
  if (!range) return <>{text}</>;

  return (
    <>
      {text.slice(0, range.start)}
      <span
        id={ACTIVE_WORD_ID}
        className="bg-blue-600 text-white rounded-sm px-0.5 shadow-sm transition-all duration-75"
      >
        {text.slice(range.start, range.end)}
      </span>
      {text.slice(range.end)}
    </>
  );
}

/**
 * A press only counts if the pointer stayed put, lifted quickly, and left no
 * selection behind. That is what separates "play from here" from scrolling the
 * page, dragging across a phrase, or long-pressing to select.
 */
function isTap(event: React.PointerEvent<HTMLParagraphElement>, from: PointerStart): boolean {
  const travelled = Math.hypot(event.clientX - from.x, event.clientY - from.y);
  if (travelled > TAP_SLOP_PX) return false;
  if (event.timeStamp - from.time > TAP_MAX_MS) return false;

  const selection = window.getSelection();
  return !selection || selection.isCollapsed;
}

interface CaretPosition {
  node: Node;
  offset: number;
}

/**
 * Where in the document a screen coordinate falls.
 *
 * `caretPositionFromPoint` is the standard; Safari and older WebKit only ship
 * the older `caretRangeFromPoint`, so both are tried before giving up.
 */
function caretAt(x: number, y: number): CaretPosition | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };

  const range = doc.caretRangeFromPoint?.(x, y);
  if (range) return { node: range.startContainer, offset: range.startOffset };

  return null;
}

/** Translates a screen coordinate into a character offset within `container`. */
function characterOffsetAt(container: HTMLElement, x: number, y: number): number | null {
  const caret = caretAt(x, y);
  if (!caret || !container.contains(caret.node)) return null;

  // Measuring from the start of the paragraph counts through the highlight
  // span too, so the offset stays correct wherever the marked word sits.
  const measure = document.createRange();
  measure.selectNodeContents(container);
  measure.setEnd(caret.node, caret.offset);

  return measure.toString().length;
}
