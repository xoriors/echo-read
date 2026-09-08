export type Theme = 'dark' | 'light';

export const DEFAULT_THEME: Theme = 'dark';

/** Must match the key the index.html boot script reads before paint. */
export const THEME_STORAGE_KEY = 'echoread.theme';

export function parseTheme(value: string | null | undefined): Theme {
  return value === 'light' ? 'light' : DEFAULT_THEME;
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function themeColor(theme: Theme): string {
  return theme === 'light' ? '#f9fafb' : '#111827';
}

export function faviconHref(theme: Theme): string {
  return theme === 'light' ? '/favicon-light.svg' : '/favicon.svg';
}
