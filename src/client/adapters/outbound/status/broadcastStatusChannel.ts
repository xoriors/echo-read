import type { StatusChannel, Unsubscribe } from '../../../application/ports/statusChannel';

/**
 * In-process pub/sub for status messages.
 *
 * This replaces the `window` CustomEvents the services used to dispatch to
 * reach the view: the dependency is now explicit and does not need a DOM.
 */
export class BroadcastStatusChannel implements StatusChannel {
  private latest = '';
  private readonly listeners = new Set<(message: string) => void>();

  publish(message: string): void {
    this.latest = message;
    this.listeners.forEach((listener) => listener(message));
  }

  subscribe(listener: (message: string) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get current(): string {
    return this.latest;
  }
}
