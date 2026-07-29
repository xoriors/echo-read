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
 * Where each page sits inside {@link pagesToText}.
 *
 * Storage keeps one flattened copy of a document, and pages cannot be recovered
 * from it: `PAGE_SEPARATOR` is a blank line, which occurs inside ordinary prose
 * too, so splitting on it would invent page boundaries. An index costs a few
 * dozen bytes per page and is exact, where a second copy of a book's text would
 * cost the book again.
 */
export interface PageSpan {
  number: number;
  start: number;
  /** Exclusive, as `String.slice` expects. */
  end: number;
}

export function pageSpans(pages: readonly DocumentPage[]): PageSpan[] {
  const spans: PageSpan[] = [];
  let cursor = 0;

  for (const page of pages) {
    spans.push({ number: page.number, start: cursor, end: cursor + page.text.length });
    cursor += page.text.length + PAGE_SEPARATOR.length;
  }

  return spans;
}

/**
 * Rebuilds pages from the flattened text and its index.
 *
 * Documents stored before pages were indexed have none, and a missing index is
 * answered with one page rather than an error: the text is still the text, and
 * a citation to page 1 of a single-page document is honest.
 */
export function pagesFromSpans(
  text: string,
  spans: readonly PageSpan[] | null,
): DocumentPage[] {
  if (!spans || spans.length === 0) return singlePage(text);
  return spans.map((span) => ({ number: span.number, text: text.slice(span.start, span.end) }));
}

/**
 * The pages worth showing a model when the subject is one passage.
 *
 * A book will not fit in a call, and the whole book is the wrong context
 * anyway: a prompt about page 40 is answered from the pages around page 40.
 * The window grows outwards from the cited page so context arrives on both
 * sides, and stops at the character budget.
 *
 * A side stops the moment one page will not fit rather than skipping it for a
 * smaller one further out: the result is a contiguous run of pages. A window
 * with a hole in it would let the model cite around a gap it was never shown.
 *
 * The centre page is always included, even alone and even over budget — a
 * prompt about a page has to be answered against that page.
 */
export function pageWindow(
  pages: readonly DocumentPage[],
  around: number | null,
  budget: number,
): DocumentPage[] {
  if (pages.length === 0) return [];

  const centre = Math.max(
    0,
    pages.findIndex((page) => page.number === around),
  );

  let first = centre;
  let last = centre;
  let used = pages[centre].text.length;
  let growBefore = true;
  let growAfter = true;

  while (growBefore || growAfter) {
    const before = growBefore ? pages[first - 1] : undefined;
    const after = growAfter ? pages[last + 1] : undefined;

    if (before && used + before.text.length <= budget) {
      used += before.text.length;
      first--;
    } else {
      growBefore = false;
    }

    if (after && used + after.text.length <= budget) {
      used += after.text.length;
      last++;
    } else {
      growAfter = false;
    }
  }

  return pages.slice(first, last + 1);
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
