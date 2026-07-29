/**
 * Reopening the app: is a reader's own work reachable?
 *
 * Decks were persisted per owner and the UI never asked for them, so the only
 * route back to your own cards was to paste the original document in again and
 * choose Learn. This drives the shipping entry point on a cold load, which is
 * the only place that behaviour is visible.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5204';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const CARDS = [
  { id: 'c1', front: 'What is spacing?', back: 'Study spread over separate sessions.', sourcePage: 1, documentTitle: 'Study techniques', dueAt: '2026-07-28T00:00:00Z' },
  { id: 'c2', front: 'What is retrieval practice?', back: 'Recalling rather than rereading.', sourcePage: 2, documentTitle: 'Memory', dueAt: '2026-07-28T00:00:00Z' },
];

let queueCalls = 0;
let graded = [];
let queue = CARDS;

await page.route('**/api/review-queue', async (route) => {
  queueCalls++;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: queue }) });
});

await page.route('**/api/review-card', async (route) => {
  graded.push(route.request().postDataJSON());
  queue = queue.slice(1); // Grading it takes it out of the queue.
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dueAt: '2026-08-02T00:00:00Z' }) });
});

await page.route('**/api/generate-speech', async (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ base64Audio: Buffer.alloc(48).toString('base64') }) }),
);

// --- A cold load ------------------------------------------------------------
await page.goto(`${BASE}/tests/pages/learnFlow.html`);
await page.waitForFunction(() => document.body.innerText.length > 0);
await page.waitForTimeout(800);

const body = () => page.locator('#root').innerText();
let text = await body();

check(queueCalls > 0, `the due queue is fetched on arrival (${queueCalls} calls)`);
check(text.includes('2 cards due'), 'and what is waiting is shown before anything is opened');
check(text.includes('Across 2 documents'), 'spanning every document, not just one');
check(await page.locator('button', { hasText: 'Review Now' }).count() === 1, 'with a way to start');

// The answer must not be sitting there.
check(!text.includes('Study spread over separate sessions'), 'no answer is visible before reviewing');

// --- Reviewing without opening a document ----------------------------------
await page.locator('button', { hasText: 'Review Now' }).click();
text = await body();
check(text.includes('What is spacing?'), 'the first card appears in place');
check(!text.includes('Study spread over separate sessions'), 'still hidden until asked for');
check(await page.locator('textarea, input[type="url"]').count() > 0, 'and the source form is still there — reviewing did not navigate away');

await page.locator('button', { hasText: /Show Answer|Reveal/ }).click();
check((await body()).includes('Study spread over separate sessions'), 'the answer reveals on request');

await page.locator('button', { hasText: /^Good$/ }).click();
await page.waitForTimeout(600);

check(graded.length === 1, 'grading calls through');
check(graded[0]?.cardId === 'c1', 'with the right card');
check(graded[0]?.rating === 3, 'and the rating that was pressed');
check(queueCalls >= 2, 'the queue is re-read after grading, so the count is live');
check((await body()).includes('1 card due'), 'and the panel now says one card, singular');

// --- Nothing due means no panel --------------------------------------------
queue = [];
await page.reload();
await page.waitForTimeout(800);
text = await body();
check(!text.includes('cards due'), 'an empty queue shows nothing rather than an empty box');
check(!text.includes('card due'), 'not even in the singular');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
