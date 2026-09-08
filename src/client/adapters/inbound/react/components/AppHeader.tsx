import React from 'react';

import { HistoryIcon, LogoIcon } from './icons';
import { ThemeToggle } from './ThemeToggle';

export function AppHeader({ onOpenLibrary }: { onOpenLibrary: () => void }): React.JSX.Element {
  return (
    <header className="mb-8 relative">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <LogoIcon />
          <div>
            <h1 className="text-5xl md:text-6xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-[var(--er-brand-from)] to-[var(--er-brand-to)]">
              EchoRead
            </h1>
            <p className="text-xl text-muted mt-1">Your personal AI-powered article reader.</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onOpenLibrary}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-raised text-chrome hover:text-fg rounded-lg transition-colors border border-line shadow-sm mt-2"
          >
            <HistoryIcon />
            <span className="hidden sm:inline font-semibold">History</span>
          </button>
        </div>
      </div>
    </header>
  );
}
