/** The outcome of one push. Distinguishes "try later" from "this is dead". */
export type PushResult = 'sent' | 'expired' | 'failed';

/**
 * Driven port: wakes a browser that does not have EchoRead open.
 *
 * Deliberately payload-free. What is due changes between sending and arriving,
 * and the service worker reads the queue itself when the notification is shown
 * — so the message is right at the moment it is read, and the server never
 * holds the subscription's encryption keys.
 */
export interface PushSender {
  /** The key a browser subscribes with, or null when push is not configured. */
  readonly applicationServerKey: string | null;

  send(endpoint: string): Promise<PushResult>;
}
