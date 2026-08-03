import { API_ROUTES, type PushConfigResponse } from '../../../../shared/contracts/api';

/**
 * Turning review reminders on and off, in this browser.
 *
 * All of it lives behind these four functions because the browser APIs
 * involved are unusually unforgiving: the permission prompt can be asked for
 * exactly once, denial is permanent until the reader digs into site settings,
 * and none of the APIs exist at all on some platforms. Nothing above this file
 * should have to know that.
 */
export type ReminderState = 'unsupported' | 'unconfigured' | 'off' | 'on' | 'blocked';

const SERVICE_WORKER = '/sw.js';

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * What the UI should offer right now.
 *
 * "blocked" is separated from "off" because they need different words: one is
 * a button, the other is an explanation, and offering a button that cannot
 * work is worse than saying so.
 */
export async function reminderState(): Promise<ReminderState> {
  if (!supported()) return 'unsupported';
  if (!(await applicationServerKey())) return 'unconfigured';
  if (Notification.permission === 'denied') return 'blocked';

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  return subscription ? 'on' : 'off';
}

let cachedKey: string | null | undefined;

async function applicationServerKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;

  try {
    const response = await fetch(API_ROUTES.pushConfig);
    const { applicationServerKey: key } = (await response.json()) as PushConfigResponse;
    cachedKey = key;
  } catch {
    cachedKey = null;
  }

  return cachedKey;
}

/**
 * Asks permission, subscribes, and tells the server where to reach us.
 *
 * Returns the state to show, not a boolean: a reader who denies the prompt has
 * not failed at anything, and the UI needs to say something different from
 * "error".
 */
export async function enableReminders(): Promise<ReminderState> {
  const key = await applicationServerKey();
  if (!supported() || !key) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER);
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Required by Chrome, and the honest setting regardless: every push this
      // sends results in a notification the reader sees.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(key),
    }));

  const stored = await post(API_ROUTES.pushSubscribe, subscription.endpoint);

  // If the server will not remember us, do not leave the browser subscribed —
  // it would sit there holding a permission for pushes that never come.
  if (!stored) {
    await subscription.unsubscribe();
    return 'off';
  }

  return 'on';
}

export async function disableReminders(): Promise<ReminderState> {
  if (!supported()) return 'unsupported';

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return 'off';

  // Server first: if the browser unsubscribes and the POST then fails, the
  // endpoint is dead but still stored, and the reader keeps "receiving"
  // reminders that go nowhere. The push service will reject them eventually,
  // but forgetting it now is cheaper and immediate.
  await post(API_ROUTES.pushUnsubscribe, subscription.endpoint);
  await subscription.unsubscribe();

  return 'off';
}

async function post(path: string, endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** `applicationServerKey` wants raw bytes; the server sends base64url. */
function decodeKey(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
