/**
 * Review reminders: the VAPID token, the endpoint allowlist, and the rule that
 * decides who gets told.
 *
 * The push itself is not sent here — that needs a real push service — but the
 * token is verified against the public key exactly as one would, so a signature
 * this cannot verify is one Chrome would reject with an opaque 401.
 */
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';

import { VapidPushSender } from '../src/server/adapters/outbound/push/vapidPushSender';
import { isPushEndpoint } from '../src/server/adapters/inbound/http/pushRouter';
import { SendRemindersUseCase, REMINDER_INTERVAL_HOURS } from '../src/server/application/usecases/sendReminders';
import type { Logger } from '../src/server/application/ports/logger';
import type { PushResult, PushSender } from '../src/server/application/ports/pushSender';
import type { PushTarget, StudyRepository } from '../src/server/application/ports/studyRepository';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const silent: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

// --- The VAPID token -------------------------------------------------------
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const sender = new VapidPushSender(privateDer, 'mailto:test@example.com', silent);
const key = sender.applicationServerKey;

check(key !== null, 'a configured sender exposes an application server key');
check(key!.length === 87, `the key is a raw P-256 point, 87 base64url chars (got ${key!.length})`);
check(Buffer.from(key!, 'base64url')[0] === 0x04, 'uncompressed, as a browser requires');

// Reach the token the way the push service will see it.
const captured: { url?: string; headers?: Record<string, string> } = {};
globalThis.fetch = (async (url: string, init: RequestInit) => {
  captured.url = url;
  captured.headers = init.headers as Record<string, string>;
  return { ok: true, status: 201 } as Response;
}) as typeof fetch;

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const outcome = await sender.send(ENDPOINT);

check(outcome === 'sent', `a 201 is a sent push (got ${outcome})`);
check(captured.url === ENDPOINT, 'posted to the subscription endpoint');
check(captured.headers?.TTL === '86400', 'with a one-day TTL — a stale reminder is worse than none');
check(captured.headers?.['Content-Length'] === '0', 'and no payload, so no encryption keys are needed');

const auth = captured.headers?.Authorization ?? '';
check(auth.startsWith('vapid t='), `a VAPID authorization header (got ${auth.slice(0, 20)})`);
check(auth.includes(`k=${key}`), 'carrying the public key');

const jwt = /t=([^,]+)/.exec(auth)?.[1] ?? '';
const [header, claims, signature] = jwt.split('.');

const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
const decodedClaims = JSON.parse(Buffer.from(claims, 'base64url').toString());

check(decodedHeader.alg === 'ES256', 'signed with ES256');
check(decodedClaims.aud === 'https://fcm.googleapis.com', `audience is the push service origin (got ${decodedClaims.aud})`);
check(decodedClaims.sub === 'mailto:test@example.com', 'with a contact subject');
check(decodedClaims.exp > Math.floor(Date.now() / 1000), 'and an expiry in the future');
check(decodedClaims.exp < Math.floor(Date.now() / 1000) + 86_400, 'within the 24h the spec allows');

// The assertion that matters: the signature verifies against the public key,
// in the raw r‖s form JWT requires rather than Node's default DER.
const valid = verify(
  null,
  Buffer.from(`${header}.${claims}`),
  { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' },
  Buffer.from(signature, 'base64url'),
);
check(valid, 'the signature verifies — this is what a push service checks');

// --- A dead subscription is reported as dead -------------------------------
globalThis.fetch = (async () => ({ ok: false, status: 410 }) as Response) as typeof fetch;
check((await sender.send(ENDPOINT)) === 'expired', 'a 410 means the subscription is gone');

globalThis.fetch = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch;
check((await sender.send(ENDPOINT)) === 'failed', 'a 500 is worth retrying, not forgetting');

globalThis.fetch = (async () => {
  throw new Error('network down');
}) as typeof fetch;
check((await sender.send(ENDPOINT)) === 'failed', 'so is a network failure');

// --- Not configured --------------------------------------------------------
const unconfigured = new VapidPushSender(undefined, 'mailto:test@example.com', silent);
check(unconfigured.applicationServerKey === null, 'no key configured means no key offered');
check((await unconfigured.send(ENDPOINT)) === 'failed', 'and nothing is sent');

// --- The endpoint allowlist ------------------------------------------------
// The subscribe route takes a URL from a browser that the server later POSTs
// to. Without an allowlist that is a server-side request forgery primitive.
for (const good of [
  'https://fcm.googleapis.com/fcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://web.push.apple.com/abc',
  'https://wns2-par02p.notify.windows.com/w/?token=abc',
]) {
  check(isPushEndpoint(good), `accepted: ${new URL(good).host}`);
}

for (const bad of [
  'https://evil.example.com/steal',
  'http://fcm.googleapis.com/fcm/send/abc',
  'https://fcm.googleapis.com.evil.com/x',
  'https://169.254.169.254/latest/meta-data/',
  'http://localhost:3000/api/study-pack',
  'file:///etc/passwd',
  'not a url',
  '',
]) {
  check(!isPushEndpoint(bad), `rejected: ${bad.slice(0, 45) || '(empty)'}`);
}

// --- Who gets reminded -----------------------------------------------------
class FakeRepository {
  targets: PushTarget[] = [
    { ownerId: 'a', endpoint: 'https://fcm.googleapis.com/fcm/send/a' },
    { ownerId: 'b', endpoint: 'https://fcm.googleapis.com/fcm/send/b' },
    { ownerId: 'c', endpoint: 'https://fcm.googleapis.com/fcm/send/c' },
  ];
  deleted: string[] = [];
  marked: string[] = [];
  askedNotifiedBefore = '';

  async subscriptionsToRemind(_now: string, notifiedBefore: string): Promise<PushTarget[]> {
    this.askedNotifiedBefore = notifiedBefore;
    return this.targets;
  }
  async deletePushSubscription(endpoint: string): Promise<void> {
    this.deleted.push(endpoint);
  }
  async markReminded(endpoints: readonly string[]): Promise<void> {
    this.marked = [...endpoints];
  }
}

const outcomes: Record<string, PushResult> = {
  'https://fcm.googleapis.com/fcm/send/a': 'sent',
  'https://fcm.googleapis.com/fcm/send/b': 'expired',
  'https://fcm.googleapis.com/fcm/send/c': 'failed',
};

const fakeSender: PushSender = {
  applicationServerKey: 'k',
  send: async (endpoint) => outcomes[endpoint] ?? 'failed',
};

const repository = new FakeRepository();
const now = new Date('2026-08-03T12:00:00Z');
const result = await new SendRemindersUseCase(
  repository as unknown as StudyRepository,
  fakeSender,
  silent,
).execute(now);

check(result.considered === 3, `every candidate is considered (got ${result.considered})`);
check(result.sent === 1 && result.expired === 1 && result.failed === 1, 'each outcome is counted separately');
check(
  repository.deleted.join() === 'https://fcm.googleapis.com/fcm/send/b',
  'an expired subscription is forgotten, not retried daily forever',
);
check(
  repository.marked.join() === 'https://fcm.googleapis.com/fcm/send/a',
  'only a delivered reminder counts as told',
);
check(
  !repository.marked.includes('https://fcm.googleapis.com/fcm/send/c'),
  'a transient failure is left unmarked, so it is retried rather than costing a day',
);

const hoursBack = (now.getTime() - new Date(repository.askedNotifiedBefore).getTime()) / 3_600_000;
check(
  Math.round(hoursBack) === REMINDER_INTERVAL_HOURS,
  `nobody is told twice within ${REMINDER_INTERVAL_HOURS}h (asked for ${Math.round(hoursBack)}h)`,
);

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
