/**
 * The error vocabulary both hexagons share.
 *
 * Adapters translate foreign failures (HTTP status codes, SDK exceptions) into
 * these types at the boundary, so use cases and the UI can reason about *what
 * went wrong* instead of parsing provider-specific strings.
 */

export type AppErrorCode =
  | 'validation'
  | 'configuration'
  | 'content_unavailable'
  | 'upstream_failure'
  | 'rate_limited';

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Status to surface if this error crosses an HTTP boundary. */
  readonly status: number;

  constructor(message: string, code: AppErrorCode, status: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

/** The caller sent something we can reject without touching any provider. */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'validation', 400);
  }
}

/** The deployment is missing a credential or setting we need. */
export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 'configuration', 500);
  }
}

/** We reached the provider, but no usable content came back. */
export class ContentUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 'content_unavailable', 400);
  }
}

/** A downstream provider failed in a way we cannot recover from here. */
export class UpstreamError extends AppError {
  constructor(message: string, status = 500) {
    super(message, 'upstream_failure', status);
  }
}

/**
 * A downstream provider asked us to slow down. `retryAfterSeconds` carries the
 * provider's own hint when it gave one, so retry policies do not have to
 * re-parse error text.
 */
export class RateLimitedError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(message: string, status = 429, retryAfterSeconds?: number) {
    super(message, 'rate_limited', status);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Best-effort message extraction for values thrown by third-party code. */
export function messageOf(error: unknown, fallback = 'An unknown error occurred.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
