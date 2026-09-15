import React, { useEffect, useRef, useState } from 'react';

import { PLAYBACK_SPEEDS, PlaybackState, formatTimecode } from '../../../../domain/playback';
import type { NarrationSnapshot } from '../../../../application/narrationPlayer';
import { Checkbox, LabelledSelect } from './controls';
import { ChevronUpIcon, NextIcon, PauseIcon, PlayIcon, RewindIcon, SlidersIcon, StopIcon } from './icons';
import { SLEEP_TIMER_OPTIONS } from '../hooks/useSleepTimer';

export interface ReadingPreferences {
  fontSize: number;
  autoScroll: boolean;
  highlight: boolean;
  /** Off by default: while on, a tap in the text jumps narration to that word. */
  tapToSeek: boolean;
  sleepTimerMinutes: number;
}

interface PlayerControlsProps {
  narration: NarrationSnapshot;
  voices: readonly string[];
  preferences: ReadingPreferences;
  sleepSecondsRemaining: number | null;
  enabled: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onRewind: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
  onPreferencesChange: (changes: Partial<ReadingPreferences>) => void;
}

/** Ties the disclosure button to the panel it opens, for screen readers. */
const ADVANCED_PANEL_ID = 'player-advanced-controls';

/**
 * The transport bar, pinned to the bottom of the viewport, and the settings
 * that used to sit beside it.
 *
 * Two things shape this layout.
 *
 * The transport has to be reachable at any scroll position. Someone reading
 * along a long article should be able to pause without first scrolling to find
 * the button — so the bar is `fixed` rather than `sticky`, at every width.
 *
 * That is only possible because the bar is now *small*. Rewind/play/stop/next
 * and the timeline stay; text size, the three reading toggles, voice, speed and
 * the sleep timer moved into a disclosure that opens above them. Together those
 * ran to eight rows on a phone — most of the viewport — and something that size
 * cannot float over a page, it just covers it. Collapsed, this is two rows.
 *
 * The panel is opaque in every state. It floats over the page, so its
 * background is not decoration: it is the only thing stopping the text
 * underneath being read through it. Disabled therefore dims the controls
 * *inside* the panel, never the panel itself.
 */
export function PlayerControls({
  narration,
  voices,
  preferences,
  sleepSecondsRemaining,
  enabled,
  onTogglePlay,
  onStop,
  onRewind,
  onNext,
  onSeek,
  onVoiceChange,
  onSpeedChange,
  onPreferencesChange,
}: PlayerControlsProps): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const barHeight = useMeasuredHeight(barRef);

  const isPlaying = narration.state === PlaybackState.Playing;
  const hasMoreParts = narration.chunkIndex + 1 < narration.chunkCount;
  const dimmed = `transition-opacity duration-500 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`;

  return (
    <>
      {/*
        A fixed bar is out of the flow, so the page does not know it is there
        and the last lines of a document end up underneath it. This stands in
        for the bar's height in the flow — measured rather than guessed,
        because the bar grows with the part label, the sleep countdown and the
        phone's bottom inset.

        Only the bar itself is counted. The disclosure opens *over* the page
        like a sheet; reserving room for it as well would jump the document
        every time it was opened.
      */}
      <div aria-hidden="true" style={{ height: barHeight }} />

      {/* The gutters are click-through, so the page either side of a narrow
          bar stays usable. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 sm:px-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-4xl bg-surface border border-b-0 border-line rounded-t-2xl shadow-2xl">
          {advancedOpen && (
            <AdvancedControls
              narration={narration}
              voices={voices}
              preferences={preferences}
              sleepSecondsRemaining={sleepSecondsRemaining}
              className={dimmed}
              onVoiceChange={onVoiceChange}
              onSpeedChange={onSpeedChange}
              onPreferencesChange={onPreferencesChange}
            />
          )}

          <div
            ref={barRef}
            className="px-3 sm:px-5 pt-3"
            // Clears the home indicator on a phone, and nothing anywhere else.
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              {/* Part and sleep are status, not settings: they stay legible
                  with the disclosure shut, which is where a reader who set a
                  sleep timer and put the phone down will leave it. */}
              <div className="flex flex-col items-start justify-center text-xs text-muted leading-tight min-w-0">
                {narration.chunkCount > 1 && (
                  <span className="whitespace-nowrap">
                    Part {narration.chunkIndex + 1} of {narration.chunkCount}
                  </span>
                )}
                {sleepSecondsRemaining !== null && (
                  <span className="whitespace-nowrap text-blue-300">
                    Sleep {formatTimecode(sleepSecondsRemaining)}
                  </span>
                )}
              </div>

              <div className={`flex items-center justify-center space-x-4 sm:space-x-6 ${dimmed}`}>
                <TransportButton onClick={onRewind} disabled={!enabled} label="Rewind 10 seconds">
                  <RewindIcon />
                </TransportButton>
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className="bg-blue-600 text-white rounded-full p-3 sm:p-4 hover:bg-blue-500 transition-transform transform hover:scale-110 disabled:bg-gray-600 disabled:cursor-not-allowed"
                  disabled={!enabled}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <TransportButton onClick={onStop} disabled={!enabled} label="Stop">
                  <StopIcon />
                </TransportButton>
                <TransportButton onClick={onNext} disabled={!enabled || !hasMoreParts} label="Next part">
                  <NextIcon />
                </TransportButton>
              </div>

              {/* Outside the dimmed group on purpose: opening the settings is
                  not a playback command, and a reader waiting on audio can
                  still read what is set. */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((open) => !open)}
                  aria-expanded={advancedOpen}
                  aria-controls={ADVANCED_PANEL_ID}
                  title="Playback and reading settings"
                  className="flex items-center gap-1 px-2 sm:px-3 py-2 rounded-md border border-line-strong bg-raised hover:bg-raised-hover text-fg text-sm font-semibold transition-colors"
                >
                  <SlidersIcon />
                  <span className="hidden sm:inline">Settings</span>
                  <span className={`transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`}>
                    <ChevronUpIcon />
                  </span>
                </button>
              </div>
            </div>

            <div className={`flex items-center space-x-3 mt-2 ${dimmed}`}>
              <span className="text-sm sm:text-base tabular-nums">{formatTimecode(narration.positionSeconds)}</span>
              <input
                type="range"
                min="0"
                max={narration.durationSeconds || 0}
                step="0.1"
                value={narration.positionSeconds}
                onChange={(event) => onSeek(Number(event.target.value))}
                aria-label="Seek"
                className="w-full h-2 bg-raised-hover rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:cursor-not-allowed"
                disabled={!enabled}
              />
              <span className="text-sm sm:text-base tabular-nums">{formatTimecode(narration.durationSeconds)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Everything that is set once and then left alone: reading size, the three
 * reading toggles, voice, speed and the sleep timer.
 *
 * It scrolls inside a bounded height. On a phone this list is taller than the
 * screen, and a sheet that pushed the transport off the top would take away
 * the very buttons it opened above.
 */
function AdvancedControls({
  narration,
  voices,
  preferences,
  sleepSecondsRemaining,
  className,
  onVoiceChange,
  onSpeedChange,
  onPreferencesChange,
}: {
  narration: NarrationSnapshot;
  voices: readonly string[];
  preferences: ReadingPreferences;
  sleepSecondsRemaining: number | null;
  className: string;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
  onPreferencesChange: (changes: Partial<ReadingPreferences>) => void;
}): React.JSX.Element {
  return (
    <div
      id={ADVANCED_PANEL_ID}
      className="border-b border-line px-3 sm:px-5 py-4 max-h-[50vh] overflow-y-auto overscroll-contain"
    >
      <div className={`flex flex-wrap justify-center items-center gap-3 sm:gap-4 ${className}`}>
        <FontSizeControl
          value={preferences.fontSize}
          onChange={(fontSize) => onPreferencesChange({ fontSize })}
        />
        <Checkbox
          checked={preferences.autoScroll}
          onChange={(autoScroll) => onPreferencesChange({ autoScroll })}
          label="Auto-Scroll"
        />
        <Checkbox
          checked={preferences.highlight}
          onChange={(highlight) => onPreferencesChange({ highlight })}
          label="Highlight Text"
        />
        <Checkbox
          checked={preferences.tapToSeek}
          onChange={(tapToSeek) => onPreferencesChange({ tapToSeek })}
          label="Tap to Play From Word"
        />
        <LabelledSelect
          id="voice-select"
          label="Voice:"
          value={narration.voice}
          options={voices.map((voice) => ({ value: voice, label: voice }))}
          onChange={onVoiceChange}
        />
        <LabelledSelect
          id="speed-control"
          label="Speed:"
          value={narration.speed}
          options={PLAYBACK_SPEEDS.map((speed) => ({ value: speed, label: `${speed}x` }))}
          onChange={(value) => onSpeedChange(Number(value))}
        />
        <LabelledSelect
          id="sleep-timer"
          label={
            <>
              Sleep:
              {sleepSecondsRemaining !== null && (
                <span className="text-sm font-normal text-blue-300 ml-1">
                  ({formatTimecode(sleepSecondsRemaining)})
                </span>
              )}
            </>
          }
          value={preferences.sleepTimerMinutes}
          options={SLEEP_TIMER_OPTIONS.map(({ minutes, label }) => ({ value: minutes, label }))}
          onChange={(value) => onPreferencesChange({ sleepTimerMinutes: Number(value) })}
        />
      </div>
    </div>
  );
}

/** Icon-only skip/stop/rewind; the accessible name is `label`, not the glyph. */
function TransportButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-chrome hover:text-fg transition-transform transform hover:scale-110 disabled:text-subtle"
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** Reading size as a range, with small/large A as the ends of the scale. */
function FontSizeControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (size: number) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center space-x-2 bg-raised px-3 py-2 rounded-md border border-line-strong shadow-sm">
      <label htmlFor="font-size-control" className="text-lg font-semibold text-secondary mr-1">
        Text Size:
      </label>
      <span className="text-sm font-bold text-muted">A</span>
      <input
        id="font-size-control"
        type="range"
        min="14"
        max="40"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-20 sm:w-24 h-2 bg-page rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      <span className="text-xl font-bold text-muted">A</span>
    </div>
  );
}

/**
 * The live height of an element, for the spacer that stands in for it.
 *
 * `ResizeObserver` rather than a one-off measurement: the bar reflows when a
 * sleep timer starts, when a multi-part document loads, and on rotation.
 */
function useMeasuredHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = (): void => setHeight(node.getBoundingClientRect().height);
    measure();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}
