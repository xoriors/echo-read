import { loadServerConfig } from '../src/server/config/environment';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

// A non-empty env object, so `loadServerConfig` does not fall through to
// reading the real process environment or a local .env file.
const base = { PATH: '/usr/bin' } as NodeJS.ProcessEnv;

// --- Production without a secret ------------------------------------------
// The bug this guards: the owner cookie *is* the identity, so a key generated
// at boot means every restart silently orphans every deck. This app scales to
// zero, so restarts happen whenever it goes idle.
let message = '';
try {
  loadServerConfig({ ...base, NODE_ENV: 'production' });
} catch (error) {
  message = (error as Error).message;
}

check(message.length > 0, 'production refuses to boot without SESSION_SECRET');
check(message.includes('SESSION_SECRET'), 'and names the variable');
check(/openssl|fly secrets/.test(message), 'and says how to produce one');

// --- Production with one --------------------------------------------------
const configured = loadServerConfig({
  ...base,
  NODE_ENV: 'production',
  SESSION_SECRET: 'a-real-secret',
});
check(configured.sessionSecret === 'a-real-secret', 'a configured secret is used verbatim');
check(configured.isProduction, 'and production is detected');
check(configured.dataDir === '/data', 'with the volume as the data directory');

// Secrets pasted into a hosting UI often arrive quoted.
const quoted = loadServerConfig({ ...base, NODE_ENV: 'production', SESSION_SECRET: '"padded"' });
check(quoted.sessionSecret === 'padded', 'quotes around a pasted secret are stripped');

// An empty value must not read as "configured".
let emptyRejected = false;
try {
  loadServerConfig({ ...base, NODE_ENV: 'production', SESSION_SECRET: '   ' });
} catch {
  emptyRejected = true;
}
check(emptyRejected, 'a blank secret is treated as missing, not accepted');

// --- Development ----------------------------------------------------------
const dev = loadServerConfig(base);
check(dev.sessionSecret.length > 0, 'development still boots without one');
check(!dev.isProduction, 'and is not production');
check(dev.dataDir === '.data', 'writing to a local data directory');

const devAgain = loadServerConfig(base);
check(
  dev.sessionSecret !== devAgain.sessionSecret,
  'the generated development key differs per boot — which is exactly why production must not use one',
);

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
