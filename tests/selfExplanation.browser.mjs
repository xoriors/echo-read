import { chromium } from 'playwright-core';

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5204';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));

await page.goto(`${BASE}/tests/pages/selfExplanation.html`);
await page.waitForFunction(() => document.getElementById('out')?.textContent.includes('READY'));

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const body = () => page.locator('#root').innerText();
const submit = page.locator('button', { hasText: /Check My Explanation|Check Again/ });
const textarea = page.locator('textarea');

// --- Before an attempt -----------------------------------------------------
let text = await body();
check(text.includes('Explain retrieval practice'), 'the prompt is shown');
check(await textarea.count() === 1, 'there is somewhere to write — the gap this closes');
check(!text.includes('A solid start'), 'no feedback before submitting');
check(!text.includes('recalling rather than rereading'), 'and nothing from the source is revealed');
check(await submit.isDisabled(), 'submit is disabled while the answer is too short');

await textarea.fill('too short');
check(await submit.isDisabled(), 'still disabled for a nine-character answer');
check((await body()).includes('more characters'), 'and the shortfall is stated rather than left to guess');

const ANSWER = 'Retrieval practice means trying to recall material from memory instead of rereading it.';
await textarea.fill(ANSWER);
check(await submit.isEnabled(), 'enabled once the answer is long enough');
check((await body()).includes('words'), 'a word count replaces the shortfall');
check(!(await body()).includes('A solid start'), 'still no feedback until it is asked for');

// --- After submitting ------------------------------------------------------
await submit.click();
await page.waitForFunction(() => document.getElementById('root').innerText.includes('A solid start'));

text = await body();
const calls = await page.evaluate(() => window.__calls);
check(calls.length === 1, 'submitting grades exactly once');
check(calls[0]?.id === 'e1', 'against the prompt id, not its text');
check(calls[0]?.answer === ANSWER, 'with what the learner actually wrote');

check(text.includes('A solid start'), 'the summary is shown');
check(text.includes('You covered'), 'what was covered is shown');
check(text.includes('You missed'), 'and what was missed — the part a learner cannot see themselves');
check(!text.includes('The source contradicts'), 'an empty list is omitted rather than shown empty');
check(text.includes('recalling rather than rereading'), 'each point quotes its source');
check(text.includes('page 2'), 'and names the page');
check(text.includes('test-model'), 'the AI-generated disclosure names the model');
check(text.includes('2 points discarded'), 'discarded citations are disclosed, not hidden');

// --- Answering again -------------------------------------------------------
await page.locator('button', { hasText: 'Answer Again' }).click();
text = await body();
check(!text.includes('A solid start'), 'answering again clears the feedback');
check(await textarea.inputValue() === ANSWER, 'but keeps what was written, to be improved rather than retyped');

// --- Moving on -------------------------------------------------------------
await page.locator('button', { hasText: 'Next Prompt' }).click();
text = await body();
check(text.includes('Explain interleaving'), 'Next Prompt moves on');
check(await textarea.inputValue() === '', 'with an empty answer');
check(text.includes('Prompt 2 of 2'), 'and the position is stated');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
