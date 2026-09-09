/**
 * Dark is the default; light is a choice that survives a reload.
 *
 * The chrome, logo stroke, favicon, and theme-color all have to follow that
 * choice — a toggle that only flips the page background leaves the rest of the
 * product looking like it still lives in the other theme.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5204';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

await page.route('**/api/review-queue', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '{"cards":[],"questions":[]}' }),
);
await page.route('**/api/push/config', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '{"applicationServerKey":null}' }),
);
await page.route('https://cdn.tailwindcss.com', (r) =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
);
await page.route('https://cdn.tailwindcss.com/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
);
await page.route('https://fonts.googleapis.com/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
);
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());

await page.goto(`${BASE}/`);
await page.waitForSelector('h1');
await page.waitForFunction(() => document.fonts.status === 'loaded');

const snapshot = () =>
  page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 16px "IBM Plex Sans"'),
      document.fonts.load('500 16px "IBM Plex Sans"'),
      document.fonts.load('600 16px "IBM Plex Sans"'),
      document.fonts.load('700 16px "IBM Plex Sans"'),
      document.fonts.load('700 16px "Space Grotesk"'),
    ]);
    await document.fonts.ready;
    const root = document.documentElement;
    const pageEl = document.querySelector('#root > div');
    const wordmark = document.querySelector('header h1');
    const logo = document.querySelector('header svg path');
    const icon = document.querySelector('link[rel="icon"]');
    const meta = document.querySelector('meta[name="theme-color"]');
    const pageStyle = pageEl ? getComputedStyle(pageEl) : null;
    const bg = pageStyle?.backgroundColor ?? '';
    const rgb = /rgba?\(([^)]+)\)/.exec(bg);
    const parts = rgb ? rgb[1].split(',').map((n) => Number(n.trim())) : [];
    return {
      theme: root.dataset.theme,
      colorScheme: root.style.colorScheme || getComputedStyle(root).colorScheme,
      stored: localStorage.getItem('echoread.theme'),
      bg,
      luminance: parts.length >= 3 ? parts[0] + parts[1] + parts[2] : -1,
      logoStroke: logo ? getComputedStyle(logo).stroke || logo.getAttribute('stroke') : null,
      logoStrokeRgb: (() => {
        const raw = logo ? getComputedStyle(logo).stroke || logo.getAttribute('stroke') || '' : '';
        const rgb = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(raw);
        return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
      })(),
      favicon: icon?.getAttribute('href') ?? null,
      themeColor: meta?.getAttribute('content') ?? null,
      uiFont: pageStyle?.fontFamily ?? '',
      wordmarkFont: wordmark ? getComputedStyle(wordmark).fontFamily : '',
      plexWeights: loadedWeights('IBM Plex Sans'),
      groteskWeights: loadedWeights('Space Grotesk'),
      missingFaceRegistered: [...document.fonts].some((face) =>
        String(face.family).replace(/['"]/g, '').toLowerCase() === 'echoreadmissingface',
      ),
    };

    function loadedWeights(family) {
      const want = family.toLowerCase();
      const weights = [];
      document.fonts.forEach((face) => {
        const name = String(face.family).replace(/['"]/g, '');
        if (name.toLowerCase() !== want) return;
        if (face.status !== 'loaded') return;
        weights.push(String(face.weight));
      });
      return [...new Set(weights)].sort();
    }
  });

const dark = await snapshot();
console.log('  dark:', JSON.stringify(dark));
check(dark.theme === 'dark', `default theme is dark (got ${dark.theme})`);
check(String(dark.colorScheme).includes('dark'), `color-scheme is dark (got ${dark.colorScheme})`);
check(dark.luminance >= 0 && dark.luminance < 120, `page background is dark (luminance ${dark.luminance})`);
check(!!dark.logoStroke, 'the logo is on the page');
check(
  Array.isArray(dark.logoStrokeRgb) && dark.logoStrokeRgb.join(',') === '156,163,175',
  `dark logo stroke is gray-400 (got ${dark.logoStrokeRgb})`,
);
check(dark.favicon === '/favicon.svg', `dark favicon (got ${dark.favicon})`);
check(dark.themeColor === '#111827', `dark theme-color (got ${dark.themeColor})`);
check(/IBM Plex Sans/i.test(dark.uiFont), `UI stack names IBM Plex Sans (got ${dark.uiFont})`);
check(/Space Grotesk/i.test(dark.wordmarkFont), `wordmark stack names Space Grotesk (got ${dark.wordmarkFont})`);
check(
  ['400', '500', '600', '700'].every((w) => dark.plexWeights.includes(w)),
  `IBM Plex Sans loads 400/500/600/700 as FontFace entries (got ${dark.plexWeights})`,
);
check(
  dark.groteskWeights.includes('700'),
  `Space Grotesk loads 700 as a FontFace entry (got ${dark.groteskWeights})`,
);
check(dark.missingFaceRegistered === false, 'a family with no @font-face is not registered');

const toggle = page.getByRole('button', { name: 'Switch to light theme' });
check((await toggle.count()) === 1, 'a control offers the light theme');
await toggle.click();
await page.waitForTimeout(100);

const light = await snapshot();
console.log('  light:', JSON.stringify(light));
check(light.theme === 'light', `toggle paints light (got ${light.theme})`);
check(String(light.colorScheme).includes('light'), `color-scheme is light (got ${light.colorScheme})`);
check(light.stored === 'light', 'the choice is written to storage');
check(light.luminance > 600, `page background is light (luminance ${light.luminance})`);
check(light.luminance > dark.luminance, 'light is actually lighter than dark');
check(
  Array.isArray(light.logoStrokeRgb) && light.logoStrokeRgb.join(',') === '75,85,99',
  `light logo stroke is gray-600 (got ${light.logoStrokeRgb})`,
);
check(
  JSON.stringify(light.logoStrokeRgb) !== JSON.stringify(dark.logoStrokeRgb),
  'logo stroke actually changes between themes',
);
check(light.favicon === '/favicon-light.svg', `light favicon (got ${light.favicon})`);
check(light.themeColor === '#f9fafb', `light theme-color (got ${light.themeColor})`);
check(
  await page.getByRole('button', { name: 'Switch to dark theme' }).count() === 1,
  'the control now offers dark',
);

await page.reload();
await page.waitForSelector('h1');
await page.waitForFunction(() => document.fonts.status === 'loaded');
const reloaded = await snapshot();
console.log('  reloaded:', JSON.stringify(reloaded));
check(reloaded.theme === 'light', `light survives a reload (got ${reloaded.theme})`);
check(reloaded.luminance > 600, 'and the page is still light');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
