/**
 * The kinds of material EchoRead can turn into speech.
 *
 * `SourceKind` is the ubiquitous language for "where did this text come from",
 * used by the UI tabs, the library entries and the server use cases alike.
 */
export const SOURCE_KINDS = ['url', 'text', 'pdf', 'video'] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  url: 'URL',
  text: 'Text',
  pdf: 'PDF',
  video: 'Analyze Video',
};

export function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === 'string' && (SOURCE_KINDS as readonly string[]).includes(value);
}

/** Which part of a PDF the reader is interested in. */
export const PDF_SELECTION_MODES = ['all', 'pages', 'chapters'] as const;

export type PdfSelectionMode = (typeof PDF_SELECTION_MODES)[number];

export interface PdfSelection {
  mode: PdfSelectionMode;
  /** 1-based, inclusive. Only meaningful for `pages` / `chapters`. */
  start?: number;
  /** 1-based, inclusive. Only meaningful for `pages` / `chapters`. */
  end?: number;
}

export const ENTIRE_PDF: PdfSelection = { mode: 'all' };

export function isRangedSelection(selection: PdfSelection): boolean {
  return selection.mode === 'pages' || selection.mode === 'chapters';
}

export const PDF_SELECTION_LABEL: Record<PdfSelectionMode, string> = {
  all: 'Entire Document',
  pages: 'Page Range',
  chapters: 'Chapter Range',
};
