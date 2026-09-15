/**
 * The transport bar, at the two sizes where it behaves differently.
 *
 * Three rules, each from a real failure.
 *
 * A panel that floats over content must be opaque in every state. The bar was
 * `bg-gray-800/80` with `opacity-50` while disabled — multiplying to a 40%
 * surface — and on a phone the transport and the source form underneath it
 * were both legible, on top of each other.
 *
 * The transport must be reachable at any scroll position. A reader part-way
 * down an article should be able to pause without hunting for the button, so
 * the bar is pinned at every width rather than only where the screen is wide.
 *
 * Which is only possible while it stays a bar. Text size, the reading toggles,
 * voice, speed and the sleep timer ran to eight rows on a phone; those live
 * behind a disclosure now, and what is pinned is two rows. Pinning also hides
 * whatever is beneath it, so the end of the document has to clear it.
 */
import { existsSync } from 'node:fs';

import { chromium } from 'playwright-core';

// Tailwind is loaded from a CDN at runtime, so a layout test needs a copy of it
// — an unstyled page cannot show a layout bug. It is fetched rather than
// committed: 400 KB of somebody else's bundle does not belong in this repo.
const TAILWIND = 'tests/pages/tailwind-local.js';
if (!existsSync(TAILWIND)) {
  console.log(`SKIPPED  ${TAILWIND} is missing. Run: npm run test:assets`);
  process.exit(0);
}

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5204';
const ARTICLE = 'The Rust project is adopting an LLM policy. '.repeat(40);
const SETTINGS_BUTTON = 'button[aria-controls="player-advanced-controls"]';

/**
 * Toggling the disclosure is driven from inside the page.
 *
 * Chromium's phone emulation shrinks the page to fit — this app overflows a
 * 393px viewport by a few dozen pixels — and Playwright's own click then lands
 * at the unscaled coordinates, somewhere up in the document. `isTopmost` below
 * is the check that actually matters here (nothing covers the pinned bar), and
 * it is made in the page's own coordinates, where the scale cannot confuse it.
 */
const toggleSettings = (page) => page.locator(SETTINGS_BUTTON).dispatchEvent('click');

/** Whether the element really is what a tap at its centre would reach. */
function isTopmost(selector) {
  const element = document.querySelector(selector);
  if (!element) return false;

  const box = element.getBoundingClientRect();
  const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
  return hit !== null && element.contains(hit);
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

/** Loads a document and stops in the state the bug report was made from. */
async function openBuffering(viewport) {
  const page = await browser.newPage({ viewport, isMobile: viewport.width < 640 });
  page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 160)));

  // The CDN is unreachable from the sandbox, and an unstyled page cannot show
  // a layout bug.
  const tailwind = (r) =>
    r.fulfill({ path: TAILWIND, contentType: 'application/javascript' });
  await page.route('https://cdn.tailwindcss.com', tailwind);
  await page.route('https://cdn.tailwindcss.com/**', tailwind);

  await page.route('**/api/review-queue', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"cards":[],"questions":[]}' }),
  );
  await page.route('**/api/push/config', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"applicationServerKey":null}' }),
  );
  await page.route('**/api/fetch-article', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: ARTICLE, sources: [] }),
    }),
  );
  // Never answers, which holds the player in Buffering — where `enabled` is
  // false and the panel used to go translucent.
  await page.route('**/api/generate-speech', () => {});

  await page.goto(`${BASE}/tests/pages/mobileLayout.html`);
  await page.waitForSelector('input');
  await page.locator('input').first().fill('https://blog.rust-lang.org/inside-rust/x/');
  await page.locator('button', { hasText: /Read Aloud/ }).click();
  await page.waitForTimeout(1200);

  return page;
}

/** The bar, plus what a reader would actually see through and around it. */
function inspectBar() {
  const seek = document.querySelector('input[aria-label="Seek"]');
  if (!seek) return null;

  const alphaOf = (element) => {
    const rgba = /rgba?\(([^)]+)\)/.exec(getComputedStyle(element).backgroundColor);
    if (!rgba) return 0;
    const parts = rgba[1].split(',').map((n) => Number(n.trim()));
    return parts.length === 4 ? parts[3] : 1;
  };

  // The painted surface is the nearest ancestor that has a background at all;
  // the transparent rows in between were never going to hide anything.
  let surface = seek.parentElement;
  while (surface && alphaOf(surface) === 0) surface = surface.parentElement;

  // Effective opacity of that surface: its own alpha, times every ancestor's
  // `opacity`. The bug was the product, not either factor alone.
  let alpha = alphaOf(surface);
  for (let node = surface; node; node = node.parentElement) {
    alpha *= Number(getComputedStyle(node).opacity);
  }

  let pinned = null;
  for (let node = surface; node && !pinned; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') pinned = node;
  }

  const box = (pinned ?? surface).getBoundingClientRect();
  const play = document.querySelector('button[aria-label="Play"], button[aria-label="Pause"]');
  const playBox = play?.getBoundingClientRect();
  const text = document.querySelector('p.whitespace-pre-wrap');

  return {
    pinned: pinned !== null,
    surfaceAlpha: Number(alpha.toFixed(3)),
    heightRatio: Number((box.height / window.innerHeight).toFixed(2)),
    // How far the bar sits off the bottom of the viewport, wherever the page
    // has been scrolled to.
    bottomGap: Math.round(window.innerHeight - box.bottom),
    playOnScreen: playBox ? playBox.top >= 0 && playBox.bottom <= window.innerHeight : false,
    // Everything that moved behind the disclosure, counted where it lives.
    settings: ['#font-size-control', '#voice-select', '#speed-control', '#sleep-timer'].filter((id) =>
      document.querySelector(id),
    ).length,
    readingToggles: document.querySelectorAll('#player-advanced-controls input[type="checkbox"]').length,
    // Clearance for the last line of the document, once scrolled as far as the
    // page goes.
    documentClearsBar: text ? Math.round(box.top - text.getBoundingClientRect().bottom) : null,
  };
}

const scrollToEnd = (page) =>
  page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

// --- Phone -----------------------------------------------------------------
const phone = await openBuffering({ width: 393, height: 851 });
const small = await phone.evaluate(inspectBar);
console.log('  phone:', JSON.stringify(small));

check(small !== null, 'the transport bar is on the page');
check(small.surfaceAlpha === 1, `its surface is fully opaque even while disabled (got ${small.surfaceAlpha})`);
check(small.pinned && small.bottomGap === 0, `it is pinned to the bottom (gap: ${small.bottomGap}px)`);
check(
  small.heightRatio < 0.3,
  `and at ${Math.round(small.heightRatio * 100)}% of the viewport it is a bar, not a wall`,
);
check(
  small.settings === 0 && small.readingToggles === 0,
  `voice, speed, sleep, text size and the reading toggles are all behind the disclosure (found ${small.settings} + ${small.readingToggles})`,
);

const scrolled = await scrollToEnd(phone).then(() => phone.evaluate(inspectBar));
console.log('  phone, scrolled:', JSON.stringify(scrolled));

check(scrolled.bottomGap === 0 && scrolled.playOnScreen, 'it is still there after scrolling to the end');
check(
  scrolled.documentClearsBar > 0,
  `and the last line of the document clears it by ${scrolled.documentClearsBar}px rather than hiding under it`,
);
check(
  await phone.evaluate(isTopmost, SETTINGS_BUTTON),
  'and a tap on the bar reaches the bar, not the article scrolled behind it',
);

await toggleSettings(phone);
const opened = await phone.evaluate(inspectBar);
console.log('  phone, settings open:', JSON.stringify(opened));

check(
  opened.settings === 4 && opened.readingToggles === 3,
  `opening it reveals all seven settings (found ${opened.settings} + ${opened.readingToggles})`,
);
check(
  opened.playOnScreen && opened.heightRatio < 0.9,
  `and at ${Math.round(opened.heightRatio * 100)}% of the viewport the transport is still on screen`,
);

await toggleSettings(phone);
check((await phone.evaluate(inspectBar)).settings === 0, 'and it closes again');
await phone.close();

// --- Desktop ---------------------------------------------------------------
const desktop = await openBuffering({ width: 1280, height: 900 });
const large = await desktop.evaluate(inspectBar);
console.log('  desktop:', JSON.stringify(large));

check(large.surfaceAlpha === 1, `opaque here too (got ${large.surfaceAlpha})`);
check(large.pinned && large.bottomGap === 0, `pinned here too (gap: ${large.bottomGap}px)`);
check(
  large.heightRatio < 0.3,
  `and still a bar — ${Math.round(large.heightRatio * 100)}% of the viewport`,
);

const desktopScrolled = await scrollToEnd(desktop).then(() => desktop.evaluate(inspectBar));
check(
  desktopScrolled.bottomGap === 0 && desktopScrolled.documentClearsBar > 0,
  `it survives a scroll with the document clear of it (${desktopScrolled.documentClearsBar}px)`,
);
await desktop.close();

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
