import { ENTIRE_PDF, type PdfSelection, PDF_SELECTION_MODES } from '../../../../shared/domain/contentSource';
import { ValidationError } from '../../../../shared/domain/errors';
import { isReadMode, type ReadMode, type SummaryMode } from '../../../../shared/domain/readMode';

/**
 * Turns untyped request bodies into the typed commands use cases expect.
 * Anything malformed becomes a {@link ValidationError}, which the error
 * middleware renders as a 400.
 */

type Body = Record<string, unknown>;

export function requireString(body: Body, field: string, label = field): string {
  const value = body?.[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${label} is required`);
  }
  return value;
}

export function readModeOf(body: Body, fallback: ReadMode = 'full'): ReadMode {
  const value = body?.readMode;
  return isReadMode(value) ? value : fallback;
}

export function summaryModeOf(body: Body): SummaryMode {
  return readModeOf(body, 'short') === 'long' ? 'long' : 'short';
}

export function pdfSelectionOf(body: Body): PdfSelection {
  const raw = body?.selection as Partial<PdfSelection> | undefined;
  if (!raw || !PDF_SELECTION_MODES.includes(raw.mode as PdfSelection['mode'])) return ENTIRE_PDF;

  return {
    mode: raw.mode as PdfSelection['mode'],
    start: positiveIntegerOrUndefined(raw.start),
    end: positiveIntegerOrUndefined(raw.end),
  };
}

function positiveIntegerOrUndefined(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
