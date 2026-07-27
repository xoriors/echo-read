export type Unsubscribe = () => void;

/**
 * Driven port for transient progress messages ("Waiting 30s to retry…").
 *
 * Adapters deep in the stack publish; the UI subscribes. Neither needs a
 * reference to the other.
 */
export interface StatusChannel {
  publish(message: string): void;
  subscribe(listener: (message: string) => void): Unsubscribe;
}
