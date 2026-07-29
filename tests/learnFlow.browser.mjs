/**
 * The whole app, driven as a reader drives it: paste text, pick a mode, submit.
 *
 * Everything else in this suite mounts one component. This one mounts the real
 * entry point, because the rules being checked live in the wiring — which panel
 * opens for which mode, and what the narration player is handed — and none of
 * that is visible from a component in isolation.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5204';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const DOCUMENT = 'Spaced practice means distributing study across separate sessions. '.repeat(6);

// Count speech calls: in Learn mode there must be none. The document is not
// meant to be narrated there, and a stray call is money as well as noise.
let speechCalls = 0;
await page.route('**/api/generate-speech', async (route) => {
  speechCalls++;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ base64Audio: Buffer.alloc(48).toString('base64') }),
  });
});

await page.route('**/api/summarize-text', async (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ text: DOCUMENT, sources: [] }),
  }),
);

await page.route('**/api/review-queue', async (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: [] }) }),
);

await page.route('**/api/study-pack', async (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      packId: 'p1',
      documentId: 'd1',
      model: 'test-model',
      generatedAt: '2026-01-01T00:00:00Z',
      flashcards: [{ id: 'c1', front: 'What is spacing?', back: 'Study spread over time.', sourcePage: 1, documentTitle: 'Pasted', dueAt: null }],
      quizItems: [{ id: 'q1', stem: 'Which retained best?', options: ['Massed', 'Distributed', 'Rereading', 'Highlighting'], answerIndex: 1, rationale: 'Delayed recall was higher.', sourcePage: 1 }],
      preQuestions: [{ question: 'What makes practice effective?' }],
      selfExplanationPrompts: [{ id: 'e1', prompt: 'Explain spacing in your own words.', sourcePage: 1 }],
      rejected: 0,
      reused: false,
    }),
  }),
);

await page.goto(`${BASE}/tests/pages/learnFlow.html`);
await page.waitForSelector('textarea, input[type="url"]');

const body = () => page.locator('#root').innerText();
const player = () => page.locator('button[title="Rewind 10 seconds"], button[aria-label*="Rewind"]');

// --- Reach the paste-text form and choose Learn ---------------------------
await page.locator('button', { hasText: /^Text$/ }).click();
await page.locator('textarea').first().fill(DOCUMENT);

let text = await body();
check(text.includes('Learn'), 'Learn is offered beside the read modes');

await page.locator('button', { hasText: /^Learn$/ }).click();
await page.locator('button', { hasText: /Read|Listen|Go|Start/ }).first().click();

// --- The study panel opens, and the transport does not ---------------------
await page.waitForFunction(() => document.body.innerText.includes('Create Study Pack'), null, { timeout: 20_000 });

text = await body();
check(text.includes('Create Study Pack'), 'Learn opens the study panel');
check(!text.includes('Sleep Timer'), 'and no player controls come with it');
check(await page.locator('input[type="range"]').count() === 0, 'no seek bar for a document nobody is listening to');
check(speechCalls === 0, `nothing is narrated in Learn mode (${speechCalls} speech calls)`);

// Pressing space must not start reading the document out loud either.
await page.keyboard.press('Space');
await page.waitForTimeout(400);
check(speechCalls === 0, 'and space does not start it');

// --- Generating a pack still works ----------------------------------------
await page.locator('button', { hasText: 'Create Study Pack' }).click();
await page.waitForFunction(() => document.body.innerText.includes('Flashcards (1)'), null, { timeout: 20_000 });

text = await body();
check(text.includes('Flashcards (1)'), 'the pack arrives');
check(text.includes('Explain (1)'), 'with its explanation tab');
check(await page.locator('input[type="range"]').count() === 0, 'and still no transport under the deck');
check(speechCalls === 0, `still nothing narrated (${speechCalls} speech calls)`);

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
