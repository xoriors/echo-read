export type Theme = 'dark' | 'light';

export const DEFAULT_THEME: Theme = 'dark';

/** Must match the key the index.html boot script reads before paint. */
export const THEME_STORAGE_KEY = 'echoread.theme';

/** Anything other than an explicit light choice is dark, including missing storage. */
export function parseTheme(value: string | null | undefined): Theme {
  return value === 'light' ? 'light' : DEFAULT_THEME;
}

/** The palette that is not `theme`. */
export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** `theme-color` meta so browser chrome matches the page, not the OS. */
export function themeColor(theme: Theme): string {
  return theme === 'light' ? '#f9fafb' : '#111827';
}

/** Favicon with an opaque background that stays visible on that palette's tab strip. */
export function faviconHref(theme: Theme): string {
  return theme === 'light' ? '/favicon-light.svg' : '/favicon.svg';
}
