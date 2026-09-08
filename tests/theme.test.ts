import { persistTheme, readStoredTheme } from '../src/client/adapters/inbound/react/themeDom';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  faviconHref,
  nextTheme,
  parseTheme,
  themeColor,
} from '../src/client/domain/theme';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

check(DEFAULT_THEME === 'dark', 'dark is the product default');
check(parseTheme(null) === 'dark', 'a missing preference is dark');
check(parseTheme(undefined) === 'dark', 'an unset preference is dark');
check(parseTheme('light') === 'light', 'light is accepted');
check(parseTheme('dark') === 'dark', 'dark is accepted');
check(parseTheme('system') === 'dark', 'anything else falls back to dark');
check(nextTheme('dark') === 'light', 'toggling dark yields light');
check(nextTheme('light') === 'dark', 'toggling light yields dark');
check(themeColor('dark') === '#111827', 'dark theme-color matches the page');
check(themeColor('light') === '#f9fafb', 'light theme-color matches the page');
check(faviconHref('dark') === '/favicon.svg', 'dark uses the dark favicon');
check(faviconHref('light') === '/favicon-light.svg', 'light uses the light favicon');
check(THEME_STORAGE_KEY === 'echoread.theme', 'storage key matches the boot script');

function fakeStorage(initial: Record<string, string> = {}): Storage & { failWrites?: boolean } {
  const map = new Map(Object.entries(initial));

  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem(this: { failWrites?: boolean }, key: string, value: string) {
      if (this.failWrites) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as Storage & { failWrites?: boolean };
}

const readable = fakeStorage({ [THEME_STORAGE_KEY]: 'light' });
readable.failWrites = true;
check(readStoredTheme(readable) === 'light', 'a saved light theme is read even when writes fail');
let persistThrew = false;
try {
  persistTheme('dark', readable);
} catch {
  persistThrew = true;
}
check(!persistThrew, 'a failed persist does not throw');
check(readable.getItem(THEME_STORAGE_KEY) === 'light', 'and the saved value is left alone');
check(readStoredTheme(null) === 'dark', 'missing storage reads as dark');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
