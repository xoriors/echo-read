import { ENTIRE_PDF, type PdfSelection } from '../../../shared/domain/contentSource';
import { ContentUnavailableError, ValidationError } from '../../../shared/domain/errors';
import type { ReadMode } from '../../../shared/domain/readMode';
import { contentDocument, hasReadableText, type ContentDocument } from '../../domain/contentDocument';
import { isRefusal, pdfPrompt } from '../../domain/prompts';
import type { ContentAnalyzer } from '../ports/contentAnalyzer';

export const PDF_MIME_TYPE = 'application/pdf';

export interface ReadPdfCommand {
  /** base64-encoded PDF bytes. */
  fileData: string;
  readMode: ReadMode;
  selection?: PdfSelection;
}

/** Extract or summarise a PDF, optionally narrowed to a page/chapter range. */
export class ReadPdfUseCase {
  constructor(private readonly analyzer: ContentAnalyzer) {}

  async execute({ fileData, readMode, selection = ENTIRE_PDF }: ReadPdfCommand): Promise<ContentDocument> {
    if (!fileData) throw new ValidationError('PDF data is required');

    const { text } = await this.analyzer.analyze({
      prompt: pdfPrompt(readMode, selection),
      attachments: [{ mimeType: PDF_MIME_TYPE, data: fileData }],
    });

    const document = contentDocument(text);

    if (!hasReadableText(document) || isRefusal(document.text)) {
      throw new ContentUnavailableError(
        'The AI could not extract content from the PDF. The file might be corrupted, password-protected, or contain only images without OCR data.',
      );
    }

    return document;
  }
}
