import { chromium } from 'playwright-core';

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5204';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();

const spoken = [];
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console error]', m.text().slice(0, 200));
});
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));

// One millisecond of silence: enough for decode() and play() to run for real,
// short enough that the sequence does not wait on audio.
const SILENCE = Buffer.alloc(48).toString('base64');

await page.route('**/api/generate-speech', async (route) => {
  const body = route.request().postDataJSON();
  spoken.push(body.text);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ base64Audio: SILENCE }),
  });
});

await page.goto(`${BASE}/tests/pages/quizAudio.html`);
await page.waitForFunction(() => document.getElementById('out')?.textContent.includes('READY'));

const answer = await page.evaluate(() => window.__answer);
const fail = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) fail.push(label);
};

// --- Before an attempt -----------------------------------------------------
check(await page.locator('button', { hasText: /^Listen$/ }).count() === 1, 'Listen button offered before an attempt');
check(await page.locator('button', { hasText: 'Listen to Answer' }).count() === 0, 'no answer button before an attempt');

await page.locator('button', { hasText: /^Listen$/ }).click();
await page.waitForFunction(() => true);
await page.waitForTimeout(1500);

const beforeAttempt = spoken.join(' | ');
console.log(`  spoken before attempt: ${JSON.stringify(spoken)}`);
check(spoken.length > 0, 'pressing Listen speaks something');
check(beforeAttempt.includes('Which retrieval schedule'), 'the stem is spoken');
check(/A\. .*B\. .*C\. .*D\./s.test(beforeAttempt), 'all four options are spoken, lettered');
// The assertion that matters most: the answer is inside the options list, so
// look for it being *announced* as the answer, and for the rationale, neither
// of which may appear before an attempt.
check(!beforeAttempt.includes('The answer is'), 'the answer is NEVER announced before an attempt');
check(!beforeAttempt.includes('Spacing the same total study time'), 'the rationale is NEVER spoken before an attempt');

// --- After an attempt ------------------------------------------------------
spoken.length = 0;
await page.locator('button', { hasText: 'Massed practice' }).click();
check(await page.locator('button', { hasText: 'Listen to Answer' }).count() === 1, 'answer button appears after an attempt');
check(await page.locator('button', { hasText: /^Listen$/ }).count() === 0, 'question-only button is replaced after an attempt');

await page.locator('button', { hasText: 'Listen to Answer' }).click();
await page.waitForTimeout(1500);

const afterAttempt = spoken.join(' | ');
console.log(`  spoken after attempt:  ${JSON.stringify(spoken)}`);
check(afterAttempt.includes(`The answer is: ${answer}`), 'the answer IS spoken after an attempt');
check(afterAttempt.includes('Spacing the same total study time'), 'the rationale is spoken after an attempt');

console.log(fail.length === 0 ? '\nDONE all passed' : `\nDONE ${fail.length} failed`);
await browser.close();
process.exit(fail.length === 0 ? 0 : 1);
