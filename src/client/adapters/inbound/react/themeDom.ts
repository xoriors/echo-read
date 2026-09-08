import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  faviconHref,
  parseTheme,
  themeColor,
  type Theme,
} from '../../../domain/theme';

/** Paint the stored theme before React mounts, so the first frame is the right one. */
export function hydrateTheme(): Theme {
  const theme = readStoredTheme();
  applyTheme(theme);
  return theme;
}

/** Writes data-theme, color-scheme, theme-color, and the matching favicon. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeColor(theme));

  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.setAttribute('href', faviconHref(theme));
}

/** Remembers the choice. A full or locked store is ignored so the page stays up. */
export function persistTheme(theme: Theme, storage?: Storage | null): void {
  try {
    storageOf(storage)?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Quota or a store that refuses writes. The session still has the theme; only the memory of it is lost.
  }
}

/** Reads only. A store that throws on get, or cannot be reached, is treated as dark. */
export function readStoredTheme(storage?: Storage | null): Theme {
  try {
    return parseTheme(storageOf(storage)?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** An injected store, else localStorage if merely *reading* it is allowed. */
function storageOf(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
