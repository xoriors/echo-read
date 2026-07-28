import type { DocumentPage } from '../../../shared/domain/page';

/**
 * Driven port: somewhere a PDF's bytes can be obtained from.
 *
 * A local file and a remote URL differ only in how they are read, so the use
 * case takes this instead of branching on where the PDF came from.
 */
export interface PdfSource {
  /** Human-readable label, used for history entries. */
  readonly name: string;

  readAsBase64(): Promise<string>;

  /**
   * The text layer, page by page.
   *
   * A scanned PDF holds images rather than text and yields nothing usable
   * here. Callers test the result with `hasTextLayer` and fall back to
   * {@link readAsBase64}, letting the model read those pages visually.
   */
  readPages(): Promise<DocumentPage[]>;
}
