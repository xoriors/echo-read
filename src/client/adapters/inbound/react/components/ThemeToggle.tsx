import React from 'react';

import { useTheme } from '../hooks/useTheme';

export function ThemeToggle(): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const toLight = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={!toLight}
      title={toLight ? 'Light theme' : 'Dark theme'}
      className="flex items-center justify-center p-2 bg-surface hover:bg-raised text-chrome hover:text-fg rounded-lg transition-colors border border-line shadow-sm mt-2"
    >
      {toLight ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

const SunIcon = (): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true">
    <path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm0-16.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 12 1.5Zm0 16.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 12 18Zm10.5-6a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75ZM4.5 12a.75.75 0 0 1-.75.75H2.25a.75.75 0 0 1 0-1.5H3.75A.75.75 0 0 1 4.5 12Zm14.773 6.523a.75.75 0 0 1-1.06 0l-1.061-1.06a.75.75 0 1 1 1.06-1.061l1.061 1.06a.75.75 0 0 1 0 1.061ZM6.788 7.788a.75.75 0 0 1-1.06 0L4.667 6.727a.75.75 0 0 1 1.06-1.06l1.061 1.06a.75.75 0 0 1 0 1.061Zm11.445-1.061a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.062-1.06l1.061-1.061a.75.75 0 0 1 1.061 0ZM7.788 17.273a.75.75 0 0 1-1.06 0l-1.061-1.06a.75.75 0 1 1 1.06-1.062l1.061 1.061a.75.75 0 0 1 0 1.061Z" />
  </svg>
);

const MoonIcon = (): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.23 2.504-7.877 6.111-9.504a.75.75 0 0 1 .819.162Z"
      clipRule="evenodd"
    />
  </svg>
);
