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
}
