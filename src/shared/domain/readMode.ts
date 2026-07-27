/**
 * How much of the source material the user wants read back to them.
 * Shared by both hexagons: it is part of the request vocabulary the UI speaks
 * and part of the editorial rules the server applies.
 */
export const READ_MODES = ['full', 'short', 'long'] as const;

export type ReadMode = (typeof READ_MODES)[number];

/** The read modes that ask the model to condense rather than reproduce. */
export type SummaryMode = Exclude<ReadMode, 'full'>;

export function isReadMode(value: unknown): value is ReadMode {
  return typeof value === 'string' && (READ_MODES as readonly string[]).includes(value);
}

export function isSummaryMode(mode: ReadMode): mode is SummaryMode {
  return mode !== 'full';
}

/** Human-readable verb used while a read mode is being applied. */
export const READ_MODE_ACTION: Record<ReadMode, string> = {
  full: 'Processing',
  short: 'Summarizing',
  long: 'Creating in-depth summary for',
};

export const READ_MODE_LABEL: Record<ReadMode, string> = {
  full: 'Full Text',
  short: 'Short Summary',
  long: 'Long Summary',
};
