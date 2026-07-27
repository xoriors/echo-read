import { AppError, RateLimitedError, UpstreamError, messageOf } from '../../../../shared/domain/errors';

const RETRY_HINT = /retry in ([0-9.]+)s/i;
const RATE_LIMIT_MARKERS = ['429', 'quota', 'resource_exhausted'];
const UNAVAILABLE_MARKERS = ['503', 'unavailable'];

interface GoogleApiErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

/**
 * The Gemini SDK reports failures as `Error`s whose message often *contains* a
 * JSON body. Digging that out is adapter work: everything above this file sees
 * a typed {@link AppError} instead.
 */
export function mapGeminiError(error: unknown, fallbackMessage: string): AppError {
  if (error instanceof AppError) return error;

  const raw = messageOf(error, fallbackMessage);
  const body = parseEmbeddedJson(raw);

  const status = body?.error?.code ?? (error as { status?: number })?.status ?? 500;
  const message = body?.error?.message ?? raw;
  const retryAfterSeconds = parseRetryHint(raw);

  if (isRateLimited(status, message)) {
    return new RateLimitedError(message, status === 503 ? 503 : 429, retryAfterSeconds);
  }

  return new UpstreamError(message, status);
}

function parseEmbeddedJson(raw: string): GoogleApiErrorBody | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  try {
    return JSON.parse(raw.substring(start)) as GoogleApiErrorBody;
  } catch {
    return null;
  }
}

function parseRetryHint(raw: string): number | undefined {
  const seconds = RETRY_HINT.exec(raw)?.[1];
  return seconds ? Math.ceil(parseFloat(seconds)) + 2 : undefined;
}

function isRateLimited(status: number, message: string): boolean {
  if (status === 429 || status === 503) return true;
  const haystack = message.toLowerCase();
  return [...RATE_LIMIT_MARKERS, ...UNAVAILABLE_MARKERS].some((marker) => haystack.includes(marker));
}
