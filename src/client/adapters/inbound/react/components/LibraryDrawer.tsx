import React, { useState } from 'react';

import type { LibraryEntry, LibraryState } from '../../../../domain/library';
import { BookmarkIcon, CloseIcon, HistoryIcon } from './icons';

type Tab = 'history' | 'readLater';

interface LibraryDrawerProps {
  library: LibraryState;
  open: boolean;
  onClose: () => void;
  onOpenEntry: (entry: LibraryEntry) => void;
}

/** Slide-over listing recent reads and everything saved for later. */
export function LibraryDrawer({ library, open, onClose, onOpenEntry }: LibraryDrawerProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('history');
  const entries = tab === 'history' ? library.history : library.readLater;

  return (
    <>
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-gray-800 border-l border-gray-700 shadow-2xl transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="p-4 sm:p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex bg-gray-700 rounded-lg p-1 space-x-1">
              <TabButton selected={tab === 'history'} onClick={() => setTab('history')}>
                <HistoryIcon />
                History
              </TabButton>
              <TabButton selected={tab === 'readLater'} onClick={() => setTab('readLater')}>
                <BookmarkIcon />
                <span className="hidden sm:inline">Read Later</span>
              </TabButton>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-full transition-colors border border-gray-600"
            >
              <CloseIcon />
            </button>
          </div>

          {entries.length === 0 ? (
            <p className="text-gray-400 text-center mt-[10vh]">
              {tab === 'history' ? 'No recent content found.' : 'Your Read Later list is empty.'}
            </p>
          ) : (
            <ul className="space-y-4 overflow-y-auto flex-1 pb-8 pr-1">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <EntryCard entry={entry} tab={tab} onOpen={() => onOpenEntry(entry)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {open && <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />}
    </>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
        selected ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function EntryCard({
  entry,
  tab,
  onOpen,
}: {
  entry: LibraryEntry;
  tab: Tab;
  onOpen: () => void;
}): React.JSX.Element {
  const timestamp = new Date(entry.createdAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg p-4 transition-colors group relative"
    >
      <h3 className="font-semibold text-blue-400 truncate pr-4 text-lg mb-2" title={entry.title}>
        {entry.title}
      </h3>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="uppercase tracking-wider font-bold bg-gray-800 px-2 py-1 rounded">{entry.kind}</span>
        <span>
          {tab === 'history'
            ? timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : timestamp.toLocaleDateString()}
        </span>
      </div>
    </button>
  );
}
