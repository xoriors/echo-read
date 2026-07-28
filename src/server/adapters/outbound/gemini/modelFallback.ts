import { AppError, RateLimitedError, UpstreamError } from '../../../../shared/domain/errors';
import type { Logger } from '../../../application/ports/logger';

/**
 * How hard to try before giving up on a model.
 *
 * Gemini answers 503 ("high demand") and 429 (quota) for pressure that is
 * usually temporary and often specific to one model, so a busy model is worth
 * retrying briefly and then worth abandoning for a quieter one.
 */
export interface ModelFallbackPolicy {
  /** Attempts against each model before moving to the next. */
  attemptsPerModel: number;
  /** Pause before the second attempt; doubles each retry. */
  initialDelayMs: number;
  /** Ceiling for any single pause, so a caller is never left hanging. */
  maxDelayMs: number;
}

export const DEFAULT_MODEL_FALLBACK_POLICY: ModelFallbackPolicy = {
  attemptsPerModel: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 8_000,
};

export interface ModelFallbackOptions<T> {
  /** Tried in order; earlier entries are preferred. */
  models: readonly string[];
  /** The provider call, parameterised by which model to use. */
  operation: (model: string) => Promise<T>;
  /** Turns a raw SDK throw into a typed error this module can reason about. */
  mapError: (error: unknown) => AppError;
  logger: Logger;
  /** Names the work in logs, e.g. `analyze` or `synthesize`. */
  operationName: string;
  policy?: ModelFallbackPolicy;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Only overload and quota answers are worth another attempt. A bad prompt, a
 * missing key or a malformed request will fail identically on every model, so
 * those surface immediately rather than after a slow march through the list.
 */
function isWorthRetrying(error: AppError): error is RateLimitedError {
  return error instanceof RateLimitedError;
}

/**
 * The model is retired or not enabled for this key. Retrying it is pointless,
 * but the next model in the list may well answer — so this skips ahead instead
 * of failing the whole call. Google keeps retired names in `models.list`, so a
 * chain can rot without any config change on our side.
 */
function isModelUnusable(error: AppError): boolean {
  return error.status === 404;
}

/** Prefer the provider's own hint, but never wait longer than the ceiling. */
function delayFor(error: RateLimitedError, attempt: number, policy: ModelFallbackPolicy): number {
  const hinted = error.retryAfterSeconds !== undefined ? error.retryAfterSeconds * 1_000 : undefined;
  const backoff = policy.initialDelayMs * 2 ** (attempt - 1);
  return Math.min(hinted ?? backoff, policy.maxDelayMs);
}

/**
 * Runs `operation` against the first model that will serve it.
 *
 * Each model gets `attemptsPerModel` tries with exponential backoff; when they
 * are used up the next model in the list takes over. The error from the last
 * model is what propagates, so the caller still sees a real provider message
 * rather than a synthetic one.
 */
export async function callWithModelFallback<T>({
  models,
  operation,
  mapError,
  logger,
  operationName,
  policy = DEFAULT_MODEL_FALLBACK_POLICY,
}: ModelFallbackOptions<T>): Promise<T> {
  if (models.length === 0) {
    throw new UpstreamError(`No Gemini model configured for ${operationName}.`);
  }

  let lastError: AppError | undefined;

  for (const [modelIndex, model] of models.entries()) {
    const isLastModel = modelIndex === models.length - 1;

    for (let attempt = 1; attempt <= policy.attemptsPerModel; attempt += 1) {
      try {
        const result = await operation(model);

        if (modelIndex > 0 || attempt > 1) {
          logger.info('Gemini call succeeded after retrying', { operation: operationName, model, attempt });
        }
        return result;
      } catch (error) {
        const mapped = mapError(error);
        lastError = mapped;

        if (isModelUnusable(mapped)) {
          if (isLastModel) throw mapped;
          logger.warn('Gemini model unavailable, falling back', {
            operation: operationName,
            model,
            nextModel: models[modelIndex + 1],
            reason: mapped.message,
          });
          break;
        }

        if (!isWorthRetrying(mapped)) throw mapped;

        const isLastAttempt = attempt === policy.attemptsPerModel;
        if (isLastAttempt && isLastModel) throw mapped;

        if (isLastAttempt) {
          logger.warn('Gemini model exhausted, falling back', {
            operation: operationName,
            model,
            nextModel: models[modelIndex + 1],
            attempts: attempt,
            status: mapped.status,
            reason: mapped.message,
          });
          break;
        }

        const delayMs = delayFor(mapped, attempt, policy);
        logger.warn('Gemini call failed, retrying', {
          operation: operationName,
          model,
          attempt,
          delayMs,
          status: mapped.status,
        });
        await sleep(delayMs);
      }
    }
  }

  /* c8 ignore next -- the loop always throws or returns; this keeps TS honest. */
  throw lastError ?? new UpstreamError(`Gemini ${operationName} failed.`);
}
