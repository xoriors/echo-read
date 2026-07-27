import React, { forwardRef } from 'react';

import { activeWordRange } from '../../../../domain/highlighting';
import { ACTIVE_WORD_ID } from '../hooks/useAutoScroll';

interface HighlightedTextProps {
  text: string;
  /** Narration progress through the document, 0–1. */
  progress: number;
  highlight: boolean;
  fontSize: number;
  onSeekToCharacter: (characterIndex: number) => void;
}

/**
 * Renders the document and marks the word currently being spoken.
 * The word to mark is decided by the domain; this only paints it.
 */
export const HighlightedText = forwardRef<HTMLParagraphElement, HighlightedTextProps>(function HighlightedText(
  { text, progress, highlight, fontSize, onSeekToCharacter },
  ref,
) {
  return (
    <p
      ref={ref}
      onDoubleClick={(event) => handleDoubleClick(event, onSeekToCharacter)}
      title="Double-click anywhere in the text to play from that position"
      className="text-gray-300 leading-relaxed whitespace-pre-wrap transition-all duration-200"
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

/** Translates a double-click into a character offset within the document. */
function handleDoubleClick(
  event: React.MouseEvent<HTMLParagraphElement>,
  onSeekToCharacter: (characterIndex: number) => void,
): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const upToClick = range.cloneRange();
  upToClick.selectNodeContents(event.currentTarget);
  upToClick.setEnd(range.startContainer, range.startOffset);

  onSeekToCharacter(upToClick.toString().length);
  selection.removeAllRanges();
}
