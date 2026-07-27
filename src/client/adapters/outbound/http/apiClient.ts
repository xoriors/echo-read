import type { ApiErrorResponse } from '../../../../shared/contracts/api';
import {
  AppError,
  ConfigurationError,
  RateLimitedError,
  UpstreamError,
  messageOf,
} from '../../../../shared/domain/errors';
import type { StatusChannel } from '../../../application/ports/statusChannel';

export interface RetryPolicy {
  /** Total attempts, including the first. */
  attempts: number;
  /** Fallback wait when the server rate-limits us without a hint. */
  rateLimitWaitSeconds: number;
  /** Fallback wait when the provider is temporarily unavailable. */
  unavailableWaitSeconds: number;
  /** Linear backoff step for transient transport failures. */
  backoffStepMs: number;
}

export const CONTENT_RETRY_POLICY: RetryPolicy = {
  attempts: 5,
  rateLimitWaitSeconds: 30,
  unavailableWaitSeconds: 10,
  backoffStepMs: 2_000,
};

/** Speech is called once per chunk, so it waits longer rather than giving up. */
export const SPEECH_RETRY_POLICY: RetryPolicy = {
  attempts: 15,
  rateLimitWaitSeconds: 40,
  unavailableWaitSeconds: 10,
  backoffStepMs: 5_000,
};

export type Sleeper = (milliseconds: number) => Promise<void>;

const sleep: Sleeper = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * One JSON-over-HTTP client for the whole app, with the retry behaviour that
 * used to be copy-pasted into every service function.
 *
 * Rate limits are waited out (honouring the server's `retryAfterSeconds` hint)
 * and transport hiccups get a linear backoff; a plain rejection — a bad URL, an
 * empty document — fails immediately instead of being retried pointlessly.
 */
export class ApiClient {
  constructor(
    private readonly status: StatusChannel,
    private readonly delay: Sleeper = sleep,
  ) {}

  async post<TResponse>(path: string, body: unknown, policy: RetryPolicy): Promise<TResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt < policy.attempts; attempt++) {
      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (response.ok) return (await response.json()) as TResponse;
        throw await toAppError(response);
      } catch (error) {
        lastError = error;

        const waitSeconds = rateLimitWaitFor(error, policy);
        if (waitSeconds !== null) {
          this.status.publish(`API busy. Waiting ${waitSeconds}s to retry...`);
          await this.delay(waitSeconds * 1_000);
          continue;
        }

        if (!isTransient(error) || attempt === policy.attempts - 1) break;
        await this.delay(policy.backoffStepMs * (attempt + 1));
      }
    }

    throw lastError instanceof AppError
      ? lastError
      : new UpstreamError(messageOf(lastError, 'Failed to complete request after retries.'));
  }
}

async function toAppError(response: Response): Promise<AppError> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorResponse;
  const message = body.error || `HTTP error! status: ${response.status}`;

  if (body.code === 'configuration') return new ConfigurationError(message);

  if (response.status === 429 || response.status === 503 || body.retryAfterSeconds !== undefined) {
    return new RateLimitedError(message, response.status, body.retryAfterSeconds);
  }

  return new UpstreamError(message, response.status);
}

/** Seconds to wait, or `null` if this failure is not a rate limit. */
function rateLimitWaitFor(error: unknown, policy: RetryPolicy): number | null {
  if (!(error instanceof RateLimitedError)) return null;
  if (error.retryAfterSeconds !== undefined) return error.retryAfterSeconds;
  return error.status === 503 ? policy.unavailableWaitSeconds : policy.rateLimitWaitSeconds;
}

/**
 * Server faults and network failures are worth another attempt. A 4xx is not,
 * and neither is a misconfigured deployment — no amount of waiting adds an API
 * key, so that failure is reported to the reader immediately.
 */
function isTransient(error: unknown): boolean {
  if (error instanceof ConfigurationError) return false;
  if (error instanceof AppError) return error.status >= 500;
  return true;
}
