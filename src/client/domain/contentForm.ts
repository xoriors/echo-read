import {
  isRangedSelection,
  type PdfSelection,
  type PdfSelectionMode,
  type SourceKind,
} from '../../shared/domain/contentSource';
import type { DocumentMode } from './documentMode';

/**
 * What the reader has typed in, before it becomes a request.
 *
 * Kept as strings because that is what inputs produce; the rules for turning
 * it into something valid live here rather than in the components.
 */
export interface ContentForm {
  kind: SourceKind;
  /** Full / Short / Long / Learn — the last opens the study panel instead. */
  readMode: DocumentMode;
  url: string;
  pastedText: string;
  pdf: PdfForm;
}

export interface PdfForm {
  method: 'file' | 'url';
  fileName: string | null;
  url: string;
  selectionMode: PdfSelectionMode;
  rangeStart: string;
  rangeEnd: string;
}

export const EMPTY_PDF_FORM: PdfForm = {
  method: 'file',
  fileName: null,
  url: '',
  selectionMode: 'all',
  rangeStart: '',
  rangeEnd: '',
};

export const EMPTY_CONTENT_FORM: ContentForm = {
  kind: 'url',
  readMode: 'full',
  url: '',
  pastedText: '',
  pdf: EMPTY_PDF_FORM,
};

/**
 * Whether the submit button should be live. Cheap enough to run on every
 * keystroke, and deliberately more forgiving than {@link validateContentForm}.
 */
export function isSubmittable(form: ContentForm): boolean {
  switch (form.kind) {
    case 'url':
    case 'video':
      return !!form.url.trim();
    case 'text':
      return !!form.pastedText.trim();
    case 'pdf':
      return form.pdf.method === 'file' ? !!form.pdf.fileName : !!form.pdf.url.trim();
  }
}

/** Returns the message to show the reader, or `null` when the form is good. */
export function validateContentForm(form: ContentForm): string | null {
  switch (form.kind) {
    case 'url':
    case 'video':
      return form.url.trim() ? null : 'Please enter a URL.';
    case 'text':
      return form.pastedText.trim() ? null : 'Please paste some text.';
    case 'pdf':
      return validatePdfForm(form.pdf);
  }
}

function validatePdfForm(pdf: PdfForm): string | null {
  if (pdf.method === 'file' && !pdf.fileName) return 'Please select a PDF file.';

  if (pdf.method === 'url') {
    if (!pdf.url.trim()) return 'Please enter a PDF URL.';
    if (!isPdfUrl(pdf.url)) return 'The provided URL must point to a .pdf file.';
  }

  return validateRange(pdf);
}

function validateRange(pdf: PdfForm): string | null {
  if (!isRangedSelection({ mode: pdf.selectionMode })) return null;

  const start = Number.parseInt(pdf.rangeStart, 10);
  const end = Number.parseInt(pdf.rangeEnd, 10);
  if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start) {
    return `Please enter a valid ${pdf.selectionMode === 'pages' ? 'page' : 'chapter'} range.`;
  }

  return null;
}

function isPdfUrl(candidate: string): boolean {
  try {
    return new URL(candidate).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

export function pdfSelectionOf(pdf: PdfForm): PdfSelection {
  if (!isRangedSelection({ mode: pdf.selectionMode })) return { mode: pdf.selectionMode };

  return {
    mode: pdf.selectionMode,
    start: Number.parseInt(pdf.rangeStart, 10),
    end: Number.parseInt(pdf.rangeEnd, 10),
  };
}

/** The label this submission should carry in history and read-later. */
export function describeForm(form: ContentForm): string {
  switch (form.kind) {
    case 'url':
    case 'video':
      return form.url;
    case 'pdf':
      return form.pdf.method === 'file' ? (form.pdf.fileName ?? 'Uploaded PDF') : form.pdf.url;
    case 'text':
      return 'Pasted Text';
  }
}

/** The address worth putting on the clipboard, if there is one. */
export function shareableLink(form: ContentForm): string | null {
  switch (form.kind) {
    case 'url':
    case 'video':
      return form.url || null;
    case 'pdf':
      return (form.pdf.method === 'url' ? form.pdf.url : form.pdf.fileName) || null;
    case 'text':
      return null;
  }
}
