/**
 * Documents, as pages.
 *
 * Until now a PDF reached the model as bytes and came back as prose, so
 * nothing downstream could say *where* a claim came from. Carrying pages
 * through the pipeline is what lets a generated flashcard cite page 12 — and
 * what lets us check that it really is on page 12 before showing it.
 *
 * Sources without pages (a URL, pasted text) are modelled as a single page, so
 * one shape works everywhere and callers never branch on source kind.
 */
export interface DocumentPage {
  /** 1-based, matching what a reader sees in a PDF viewer. */
  number: number;
  text: string;
}

/** Separator between pages in the flattened text handed to narration. */
export const PAGE_SEPARATOR = '\n\n';

export function singlePage(text: string): DocumentPage[] {
  return [{ number: 1, text }];
}

/** The reading text: pages joined, in order. */
export function pagesToText(pages: readonly DocumentPage[]): string {
  return pages.map((page) => page.text).join(PAGE_SEPARATOR);
}

export function totalCharacters(pages: readonly DocumentPage[]): number {
  return pages.reduce((total, page) => total + page.text.length, 0);
}

/**
 * Whether a text layer was actually recovered.
 *
 * Scanned PDFs are images: `pdfjs` returns a page per sheet and no words on
 * any of them. A handful of stray characters (a page number burnt into the
 * scan, a watermark) is not a text layer either, so the test is per-page
 * average rather than a bare emptiness check.
 */
export const MIN_CHARACTERS_PER_PAGE = 25;

export function hasTextLayer(pages: readonly DocumentPage[]): boolean {
  if (pages.length === 0) return false;
  return totalCharacters(pages) / pages.length >= MIN_CHARACTERS_PER_PAGE;
}

/**
 * Which page a character offset into {@link pagesToText} falls on.
 *
 * Narration works on the flattened text, so turning a position back into a
 * page is how playback position, highlighting and citations stay reconcilable.
 */
export function pageAtOffset(pages: readonly DocumentPage[], offset: number): number | null {
  if (pages.length === 0) return null;

  const target = Math.max(0, offset);
  let cursor = 0;

  for (const page of pages) {
    const end = cursor + page.text.length;
    if (target < end) return page.number;
    cursor = end + PAGE_SEPARATOR.length;
  }

  return pages[pages.length - 1].number;
}

/**
 * Verifies a citation: does `quote` actually occur on page `number`?
 *
 * Models cite confidently and wrongly, so a page reference is only worth
 * showing if the quote backing it can be found there. Whitespace is
 * normalised because extraction inserts line breaks the model does not echo.
 */
export function quoteOccursOnPage(
  pages: readonly DocumentPage[],
  number: number,
  quote: string,
): boolean {
  const page = pages.find((candidate) => candidate.number === number);
  if (!page || !quote.trim()) return false;

  return normalise(page.text).includes(normalise(quote));
}

/**
 * The pages a reader asked for, 1-based and inclusive.
 *
 * With a real text layer this is an exact slice. It used to be a sentence in a
 * prompt asking the model to please restrict itself to those pages.
 */
export function pagesInRange(
  pages: readonly DocumentPage[],
  start: number | undefined,
  end: number | undefined,
): DocumentPage[] {
  const first = start ?? 1;
  const last = end ?? pages.length;

  return pages.filter((page) => page.number >= first && page.number <= last);
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
