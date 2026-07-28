import { ContentUnavailableError } from '../../../../shared/domain/errors';
import type { DocumentPage } from '../../../../shared/domain/page';
import type { PdfSource } from '../../../application/ports/pdfSource';
import { extractPages } from './pdfJsTextExtractor';

/** CORS-blocked PDFs are retried through a public read-only proxy. */
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

/** A PDF the reader picked from their own machine. */
export class LocalFilePdfSource implements PdfSource {
  constructor(private readonly file: File) {}

  get name(): string {
    return this.file.name;
  }

  readAsBase64(): Promise<string> {
    return blobToBase64(this.file);
  }

  async readPages(): Promise<DocumentPage[]> {
    return extractPagesOf(this.file);
  }
}

/** A PDF that has to be downloaded first. */
export class RemotePdfSource implements PdfSource {
  /** Memoised so asking for pages and then bytes does not download twice. */
  private downloaded: Promise<Blob> | null = null;

  constructor(private readonly url: string) {}

  get name(): string {
    return this.url;
  }

  async readAsBase64(): Promise<string> {
    try {
      return await blobToBase64(await this.blob());
    } catch (error) {
      if (error instanceof ContentUnavailableError) throw error;
      throw new ContentUnavailableError(
        'Could not download the PDF from the provided URL. It might be protected or inaccessible.',
      );
    }
  }

  async readPages(): Promise<DocumentPage[]> {
    try {
      return await extractPagesOf(await this.blob());
    } catch {
      // The download failed. Report nothing rather than throwing, so the
      // caller falls through to the bytes path — which raises the same
      // failure with a message written for a reader.
      return [];
    }
  }

  private blob(): Promise<Blob> {
    // Memoised so asking for pages and then bytes downloads once — but a
    // rejection is cleared, otherwise one transient network failure would
    // poison this source for the rest of its life.
    this.downloaded ??= this.download().catch((error: unknown) => {
      this.downloaded = null;
      throw error;
    });

    return this.downloaded;
  }

  private async download(): Promise<Blob> {
    const response = (await tryFetch(this.url)) ?? (await tryFetch(`${CORS_PROXY}${encodeURIComponent(this.url)}`));

    if (!response) {
      throw new ContentUnavailableError(
        'Could not download the PDF from the provided URL. It might be protected or inaccessible.',
      );
    }

    return response.blob();
  }
}

async function tryFetch(url: string): Promise<Response | null> {
  try {
    const response = await fetch(url);
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [, payload] = dataUrl.split(',', 2);
      if (payload) resolve(payload);
      else reject(new Error('Could not read the PDF contents.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the PDF contents.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * A text layer is an optimisation, not a requirement: if extraction throws —
 * an encrypted PDF, a malformed one, a pdf.js quirk — the caller still has the
 * bytes to send to the model. So failure degrades to "no pages" rather than
 * failing the load.
 */
async function extractPagesOf(blob: Blob): Promise<DocumentPage[]> {
  try {
    return await extractPages(await blob.arrayBuffer());
  } catch {
    return [];
  }
}
