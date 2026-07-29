/**
 * The test runner.
 *
 * Two kinds of test live here. The `.test.ts` files are plain Node — domain
 * logic, migrations against a scratch SQLite file, and the use cases with a
 * stubbed model. The `.browser.mjs` files drive the real React components in
 * Chromium, because the rules that matter most in this app are about what is
 * on screen and what has been spoken, and neither is observable from Node.
 *
 * Browser tests need the app served as modules, so this starts Vite itself
 * rather than asking whoever runs the tests to remember to. `tests/pages/*`
 * are the mount points: each imports the production component and nothing else,
 * so a test cannot pass against a copy of the code that ships.
 *
 * One suite is excluded by default. `explainLive.test.ts` calls the real Gemini
 * API through a running server, so it needs a key and costs money — run it with
 * `npm run test:live` once a server is up.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.TEST_PORT ?? 5210);
const BASE = `http://127.0.0.1:${PORT}`;

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

const suites = readdirSync(HERE)
  .filter((name) => name.endsWith('.test.ts') || name.endsWith('.browser.mjs'))
  // Costs a real model call; opt in with `npm run test:live`.
  .filter((name) => name !== 'explainLive.test.ts')
  .sort();

const needsBrowser = suites.some((name) => name.endsWith('.browser.mjs'));
let vite = null;

if (needsBrowser) {
  vite = spawn('npx', ['vite', '--port', String(PORT), '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  if (!(await waitForServer(BASE))) {
    console.error(`Could not start Vite on ${BASE}`);
    vite.kill();
    process.exit(1);
  }
}

const failed = [];

for (const suite of suites) {
  console.log(`\n── ${suite} ${'─'.repeat(Math.max(0, 60 - suite.length))}`);

  const code = suite.endsWith('.test.ts')
    ? await run('npx', ['tsx', path.join('tests', suite)])
    : await run('node', [path.join('tests', suite)], { env: { ...process.env, TEST_BASE_URL: BASE } });

  if (code !== 0) failed.push(suite);
}

vite?.kill();

console.log(
  failed.length === 0
    ? `\n${suites.length} suites passed`
    : `\n${failed.length} of ${suites.length} suites failed: ${failed.join(', ')}`,
);

process.exit(failed.length === 0 ? 0 : 1);
