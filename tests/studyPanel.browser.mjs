import { chromium } from 'playwright-core';

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5204';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));

await page.goto(`${BASE}/tests/pages/studyPanel.html`);
await page.waitForFunction(() => document.getElementById('out')?.textContent.includes('READY'));

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const body = () => page.locator('#root').innerText();

// --- Layout ----------------------------------------------------------------
let text = await body();
check(text.includes('Flashcards (1)'), 'the flashcard tab is counted');
check(text.includes('Questions (1)'), 'the question tab is counted');
check(text.includes('Explain (1)'), 'explanation prompts are a tab of their own now');
check(text.includes('Before you read, look for:'), 'pre-questions stay above the deck, where they belong');
check(text.includes('3 items discarded'), 'the pack discloses what it threw away');
check(text.includes('2 sections'), 'and warns that part of the document could not be generated');
check(text.includes('incomplete'), 'in plain terms — a deck with a hole is not a finished deck');
check(await page.locator('button', { hasText: 'Try those again' }).count() === 1, 'with a way to retry');
check(text.includes('test-model'), 'and which model wrote it');

// The old shape: a bulleted list under the deck with nowhere to write.
check(!text.includes('Explain in your own words:'), 'the read-only prompt list is gone');
check(await page.locator('textarea').count() === 0, 'and no textarea leaks into the flashcard tab');

// --- Export covers both note kinds ----------------------------------------
await page.locator('button', { hasText: 'Export Deck' }).click();
await page.waitForFunction(() => window.__downloads.length > 0);
const [file] = await page.evaluate(() => window.__downloads);
check(file.includes('What is spacing?'), 'the export holds a flashcard');
check(file.includes('Which retained best?'), 'and a question');
check(file.includes('B) Distributed'), 'with its answer lettered');
check(file.split('\n').every((line) => line.split('\t').length === 2), 'every line is two fields');

// --- The Explain tab reaches the gateway ----------------------------------
await page.locator('button', { hasText: 'Explain (1)' }).click();
check((await body()).includes('Explain spacing in your own words.'), 'the Explain tab shows its prompt');
check(await page.locator('textarea').count() === 1, 'and gives the learner somewhere to write');

await page.locator('textarea').fill('Spacing means spreading study across separate sessions rather than massing it.');
await page.locator('button', { hasText: 'Check My Explanation' }).click();
await page.waitForFunction(() => document.getElementById('root').innerText.includes('Nearly there.'));

const checked = await page.evaluate(() => window.__checked);
check(checked.length === 1 && checked[0].id === 'e1', 'submitting calls through with the prompt id');
check((await body()).includes('The delay matters.'), 'and the feedback lands in the panel');

// --- Switching tabs does not disturb the others ---------------------------
await page.locator('button', { hasText: 'Questions (1)' }).click();
text = await body();
check(text.includes('Which retained best?'), 'the question tab still works');
check(!text.includes('Distributed practice is right'), 'and reveals nothing before an attempt');
check(await page.locator('button', { hasText: 'Listen to Answer' }).count() === 0, 'with no answer audio offered yet');

await page.locator('button', { hasText: 'Flashcards (1)' }).click();
check((await body()).includes('What is spacing?'), 'the flashcard tab still works');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
