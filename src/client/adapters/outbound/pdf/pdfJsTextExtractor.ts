import type { DocumentPage } from '../../../../shared/domain/page';

/**
 * Pulls a PDF's text layer out, one page at a time.
 *
 * `pdfjs-dist` is roughly four times the size of the whole application bundle,
 * so it is imported dynamically: a reader who never opens a PDF never
 * downloads it. The import is memoised because a second document should not
 * pay for the module again.
 *
 * The buffer passed in is consumed: pdf.js detaches it. Callers must not
 * reuse it afterwards.
 *
 * This recovers only a real text layer. Scanned PDFs are images and yield
 * nothing here — {@link hasTextLayer} is how callers detect that and fall back
 * to sending the bytes to the model, which can read them visually.
 */
type PdfJsModule = typeof import('pdfjs-dist');

let modulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  modulePromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      // `?url` makes Vite emit the worker as its own asset and hand back its
      // final URL. Without a resolvable worker, pdf.js quietly parses on the
      // main thread instead — correct, but it freezes the UI on a long
      // document, which is exactly the case this feature exists to serve.
      import('pdfjs-dist/build/pdf.worker.mjs?url'),
    ]);

    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();

  return modulePromise;
}

/** Text items carry their own spacing hints; `str` is the visible text. */
interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
}

export async function extractPages(data: ArrayBuffer): Promise<DocumentPage[]> {
  const pdfjs = await loadPdfJs();

  // pdf.js takes ownership of this buffer and detaches it. Callers pass a
  // buffer they do not reuse — the scanned-PDF fallback re-reads the original
  // Blob rather than these bytes — so copying it here would just hold a large
  // document in memory twice.
  // Teardown is on the loading task: that is what owns the worker.
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const document = await loadingTask.promise;

  try {
    const pages: DocumentPage[] = [];

    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      try {
        const content = await page.getTextContent();
        pages.push({ number, text: joinTextItems(content.items as TextItemLike[]) });
      } finally {
        page.cleanup();
      }
    }

    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Reassembles a page's text runs into readable prose.
 *
 * pdf.js emits positioned fragments, not sentences: a line can arrive as
 * several items and adjacent items may or may not need a space between them.
 * `hasEOL` marks a line break; otherwise items are joined with a single space
 * unless one side already supplies the whitespace.
 */
function joinTextItems(items: readonly TextItemLike[]): string {
  let text = '';

  for (const item of items) {
    const fragment = item.str ?? '';

    if (fragment && text && !text.endsWith(' ') && !text.endsWith('\n') && !fragment.startsWith(' ')) {
      text += ' ';
    }

    text += fragment;
    if (item.hasEOL) text += '\n';
  }

  return collapseBlankLines(text).trim();
}

/** Layout gaps arrive as runs of empty lines; keep paragraphs, drop the rest. */
function collapseBlankLines(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
