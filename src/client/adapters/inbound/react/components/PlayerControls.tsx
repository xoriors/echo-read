import React from 'react';

import { PLAYBACK_SPEEDS, PlaybackState, formatTimecode } from '../../../../domain/playback';
import type { NarrationSnapshot } from '../../../../application/narrationPlayer';
import { Checkbox, LabelledSelect } from './controls';
import { NextIcon, PauseIcon, PlayIcon, RewindIcon, StopIcon } from './icons';
import { SLEEP_TIMER_OPTIONS } from '../hooks/useSleepTimer';

export interface ReadingPreferences {
  fontSize: number;
  autoScroll: boolean;
  highlight: boolean;
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

/** The sticky transport bar and the reading preferences that sit with it. */
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
  const isPlaying = narration.state === PlaybackState.Playing;
  const hasMoreParts = narration.chunkIndex + 1 < narration.chunkCount;

  return (
    <div
      className={`sticky bottom-4 w-full max-w-4xl bg-gray-800/80 backdrop-blur-sm p-5 rounded-2xl shadow-2xl transition-opacity duration-500 ${
        enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
      }`}
    >
      <div className="flex items-center justify-center space-x-6 mb-4">
        <TransportButton onClick={onRewind} disabled={!enabled} label="Rewind 10 seconds">
          <RewindIcon />
        </TransportButton>
        <button
          type="button"
          onClick={onTogglePlay}
          className="bg-blue-600 text-white rounded-full p-4 hover:bg-blue-500 transition-transform transform hover:scale-110 disabled:bg-gray-600 disabled:cursor-not-allowed"
          disabled={!enabled}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <TransportButton onClick={onStop} disabled={!enabled} label="Stop">
          <StopIcon />
        </TransportButton>
        <TransportButton onClick={onNext} disabled={!enabled || !hasMoreParts} label="Next part" className="ml-2">
          <NextIcon />
        </TransportButton>
      </div>

      {narration.chunkCount > 1 && (
        <div className="text-center text-xs text-gray-400 mt-1 mb-2">
          Part {narration.chunkIndex + 1} of {narration.chunkCount}
        </div>
      )}

      <div className="flex items-center space-x-4">
        <span className="text-lg">{formatTimecode(narration.positionSeconds)}</span>
        <input
          type="range"
          min="0"
          max={narration.durationSeconds || 0}
          step="0.1"
          value={narration.positionSeconds}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Seek"
          className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:cursor-not-allowed"
          disabled={!enabled}
        />
        <span className="text-lg">{formatTimecode(narration.durationSeconds)}</span>
      </div>

      <div className="flex flex-wrap justify-center items-center gap-4 mt-4">
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

function TransportButton({
  onClick,
  disabled,
  label,
  className = '',
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`text-gray-300 hover:text-white transition-transform transform hover:scale-110 disabled:text-gray-600 ${className}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function FontSizeControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (size: number) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center space-x-2 bg-gray-700 px-3 py-2 rounded-md border border-gray-600 shadow-sm">
      <label htmlFor="font-size-control" className="text-lg font-semibold text-gray-200 mr-1">
        Text Size:
      </label>
      <span className="text-sm font-bold text-gray-400">A</span>
      <input
        id="font-size-control"
        type="range"
        min="14"
        max="40"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-20 sm:w-24 h-2 bg-gray-900 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      <span className="text-xl font-bold text-gray-400">A</span>
    </div>
  );
}
