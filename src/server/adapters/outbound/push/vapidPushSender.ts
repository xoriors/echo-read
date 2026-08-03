import { createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto';

import type { Logger } from '../../../application/ports/logger';
import type { PushResult, PushSender } from '../../../application/ports/pushSender';

/**
 * Web Push over VAPID, without a dependency.
 *
 * The `web-push` package exists mostly to encrypt payloads: that needs ECDH
 * against the subscription's keys, HKDF, and AES-GCM, and getting any of it
 * wrong fails silently in a browser nobody is watching. Sending *no* payload
 * skips all of it — what is left is a signed JWT and an empty POST, which is
 * small enough to be read and checked here.
 *
 * The trade is that the browser learns only "something is due", and the service
 * worker fetches the details. That is the better shape anyway: a count baked in
 * at send time is stale by the time anyone reads it.
 */
export class VapidPushSender implements PushSender {
  private readonly privateKey: KeyObject | null;
  readonly applicationServerKey: string | null;

  constructor(
    privateKeyBase64: string | undefined,
    private readonly subject: string,
    private readonly logger: Logger,
  ) {
    this.privateKey = privateKeyBase64 ? importPrivateKey(privateKeyBase64) : null;
    this.applicationServerKey = this.privateKey ? rawPublicKey(this.privateKey) : null;
  }

  async send(endpoint: string): Promise<PushResult> {
    if (!this.privateKey || !this.applicationServerKey) return 'failed';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `vapid t=${this.token(endpoint)}, k=${this.applicationServerKey}`,
          // Deliver for a day, then give up. A reminder that arrives two days
          // late is worse than none: it tells the reader about a queue that has
          // already moved on.
          TTL: '86400',
          'Content-Length': '0',
        },
      });

      // The subscription is gone — the browser was uninstalled, the permission
      // revoked, or it simply expired. Reported so the caller can forget it
      // rather than retrying a dead endpoint every day forever.
      if (response.status === 404 || response.status === 410) return 'expired';

      if (!response.ok) {
        this.logger.warn('Push rejected', { status: response.status, host: hostOf(endpoint) });
        return 'failed';
      }

      return 'sent';
    } catch (error) {
      this.logger.warn('Push failed', {
        host: hostOf(endpoint),
        reason: (error as Error).message,
      });
      return 'failed';
    }
  }

  /**
   * The VAPID JWT: proof to the push service that this server is the one the
   * browser subscribed to. Audience is the push service's own origin, so a
   * token captured from one cannot be replayed at another.
   */
  private token(endpoint: string): string {
    const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const claims = base64url(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
        sub: this.subject,
      }),
    );

    const signingInput = `${header}.${claims}`;
    // ES256 wants the raw r‖s pair; Node defaults to DER, which push services
    // reject with an opaque 401.
    const signature = sign(null, Buffer.from(signingInput), {
      key: this.privateKey!,
      dsaEncoding: 'ieee-p1363',
    });

    return `${signingInput}.${signature.toString('base64url')}`;
  }
}

/** Twelve hours. The spec caps VAPID tokens at 24; half that leaves room for clock skew. */
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

function importPrivateKey(base64: string): KeyObject {
  return createPrivateKey({
    key: Buffer.from(base64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
}

/**
 * The public key as a browser wants it: the uncompressed P-256 point,
 * `0x04 ‖ X ‖ Y`, base64url. This is what goes into `applicationServerKey`.
 */
function rawPublicKey(privateKey: KeyObject): string {
  const { x, y } = createPublicKey(privateKey).export({ format: 'jwk' }) as {
    x: string;
    y: string;
  };

  return Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(x, 'base64url'),
    Buffer.from(y, 'base64url'),
  ]).toString('base64url');
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

/** Host only: a push endpoint's path is a bearer credential and must not be logged. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown';
  }
}
