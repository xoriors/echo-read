import React from 'react';

import { HistoryIcon, LogoIcon } from './icons';

export function AppHeader({ onOpenLibrary }: { onOpenLibrary: () => void }): React.JSX.Element {
  return (
    <header className="mb-8 relative">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <LogoIcon />
          <div>
            <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
              EchoRead
            </h1>
            <p className="text-xl text-gray-400 mt-1">Your personal AI-powered article reader.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors border border-gray-700 shadow-sm mt-2"
        >
          <HistoryIcon />
          <span className="hidden sm:inline font-semibold">History</span>
        </button>
      </div>
    </header>
  );
}
