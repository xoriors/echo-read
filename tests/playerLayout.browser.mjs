/**
 * The transport bar, at the two sizes where it behaves differently.
 *
 * The bug this guards: the bar is `sticky`, so it floats over the page, and it
 * was `bg-gray-800/80` with `opacity-50` while disabled — multiplying to a 40%
 * surface. While audio was being prepared on a phone, the transport and the
 * source form underneath it were both legible, on top of each other.
 *
 * Two rules come out of that. A panel that floats over content must be opaque
 * in every state, and something most of the viewport tall cannot float at all.
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

/** The panel, plus what a reader would actually see through it. */
function inspectPanel() {
  const panel = [...document.querySelectorAll('div')].find(
    (d) =>
      typeof d.className === 'string' &&
      d.className.includes('rounded-2xl') &&
      d.querySelector('input[type="range"]'),
  );
  if (!panel) return null;

  const style = getComputedStyle(panel);
  const box = panel.getBoundingClientRect();

  // Effective opacity of the surface: the background's own alpha, times every
  // ancestor's `opacity`. The bug was the product, not either factor alone.
  const rgba = /rgba?\(([^)]+)\)/.exec(style.backgroundColor);
  const parts = rgba ? rgba[1].split(',').map((n) => Number(n.trim())) : [];
  let alpha = parts.length === 4 ? parts[3] : 1;

  for (let node = panel; node; node = node.parentElement) {
    alpha *= Number(getComputedStyle(node).opacity);
  }

  return {
    position: style.position,
    surfaceAlpha: Number(alpha.toFixed(3)),
    heightRatio: Number((box.height / window.innerHeight).toFixed(2)),
  };
}

// --- Phone -----------------------------------------------------------------
const phone = await openBuffering({ width: 393, height: 851 });
const small = await phone.evaluate(inspectPanel);
console.log('  phone:', JSON.stringify(small));

check(small !== null, 'the transport panel is on the page');
check(small.surfaceAlpha === 1, `its surface is fully opaque even while disabled (got ${small.surfaceAlpha})`);
check(small.position !== 'sticky', `it does not float on a phone (position: ${small.position})`);
check(
  small.heightRatio > 0.5,
  `and at ${Math.round(small.heightRatio * 100)}% of the viewport it plainly could not have`,
);
await phone.close();

// --- Desktop ---------------------------------------------------------------
const desktop = await openBuffering({ width: 1280, height: 900 });
const large = await desktop.evaluate(inspectPanel);
console.log('  desktop:', JSON.stringify(large));

check(large.surfaceAlpha === 1, `opaque here too (got ${large.surfaceAlpha})`);
check(large.position === 'sticky', `but still floats where there is room (position: ${large.position})`);
check(
  large.heightRatio < 0.5,
  `and is a bar rather than a wall — ${Math.round(large.heightRatio * 100)}% of the viewport`,
);
await desktop.close();

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
