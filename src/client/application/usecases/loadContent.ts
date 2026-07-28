import type { PdfSelection } from '../../../shared/domain/contentSource';
import { ContentUnavailableError } from '../../../shared/domain/errors';
import type { GroundingSource } from '../../../shared/domain/groundingSource';
import {
  hasTextLayer,
  pagesInRange,
  pagesToText,
  singlePage,
  type DocumentPage,
} from '../../../shared/domain/page';
import { READ_MODE_ACTION, isSummaryMode, type ReadMode } from '../../../shared/domain/readMode';
import type { ContentGateway } from '../ports/contentGateway';
import type { PdfSource } from '../ports/pdfSource';
import type { StatusChannel } from '../ports/statusChannel';

export type LoadContentCommand =
  | { kind: 'url'; url: string; readMode: ReadMode }
  | { kind: 'text'; text: string; readMode: ReadMode }
  | { kind: 'video'; url: string }
  | { kind: 'pdf'; source: PdfSource; readMode: ReadMode; selection: PdfSelection };

export interface LoadedContent {
  text: string;
  sources: GroundingSource[];
  videoSource: GroundingSource | null;
  /**
   * The document as pages. Sources without real pages collapse to one, so
   * everything downstream can cite a page without knowing the source kind.
   */
  pages: DocumentPage[];
}

/**
 * Turns whatever the reader supplied into text worth narrating.
 *
 * One entry point for four source kinds keeps the branching in a single place
 * instead of scattered through the view, and lets the UI stay unaware of which
 * endpoint backs which tab.
 */
export class LoadContentUseCase {
  constructor(
    private readonly gateway: ContentGateway,
    private readonly status: StatusChannel,
  ) {}

  async execute(command: LoadContentCommand): Promise<LoadedContent> {
    this.status.publish(describeWork(command));

    const retrieved = await this.retrieve(command);

    if (!retrieved.text.trim()) {
      throw new ContentUnavailableError('The extracted content is empty.');
    }

    return {
      text: retrieved.text,
      sources: retrieved.sources ?? [],
      videoSource: retrieved.videoSource ?? null,
      pages: retrieved.pages ?? singlePage(retrieved.text),
    };
  }

  /**
   * Prefers the PDF's own text layer, and only sends bytes to the model when
   * there isn't one.
   *
   * Reading the text locally is better on every axis available: a page range
   * becomes an exact slice instead of an instruction the model may ignore,
   * "full" needs no model call at all, and nothing is truncated on the way.
   *
   * Two cases still need the model. A scanned PDF has no text to extract, and
   * a chapter range cannot be resolved from a text layer — chapters are a
   * structure pdf.js does not report — so both fall back to sending bytes.
   */
  private async retrievePdf(command: Extract<LoadContentCommand, { kind: 'pdf' }>) {
    const needsModelForStructure = command.selection.mode === 'chapters';

    if (!needsModelForStructure) {
      this.status.publish('Reading PDF...');
      const pages = await command.source.readPages();

      if (hasTextLayer(pages)) {
        const selected =
          command.selection.mode === 'pages'
            ? pagesInRange(pages, command.selection.start, command.selection.end)
            : pages;

        const text = pagesToText(selected);

        if (!isSummaryMode(command.readMode)) return { text, sources: [], pages: selected };

        this.status.publish(`${READ_MODE_ACTION[command.readMode]} PDF...`);
        const summary = await this.gateway.summarizeText(text, command.readMode);
        return { ...summary, pages: singlePage(summary.text) };
      }
    }

    this.status.publish('Downloading PDF...');
    const base64Data = await command.source.readAsBase64();
    this.status.publish(`${READ_MODE_ACTION[command.readMode]} PDF...`);
    return this.gateway.extractPdf(base64Data, command.readMode, command.selection);
  }

  private async retrieve(command: LoadContentCommand) {
    switch (command.kind) {
      case 'url':
        return this.gateway.fetchArticle(command.url, command.readMode);

      case 'video':
        return this.gateway.analyzeVideo(command.url);

      case 'text':
        // "Full" needs no model call — the reader already gave us the text.
        return isSummaryMode(command.readMode)
          ? this.gateway.summarizeText(command.text, command.readMode)
          : { text: command.text, sources: [] };

      case 'pdf':
        return this.retrievePdf(command);
    }
  }
}

function describeWork(command: LoadContentCommand): string {
  switch (command.kind) {
    case 'url':
      return `${READ_MODE_ACTION[command.readMode]} article...`;
    case 'video':
      return 'Analyzing video...';
    case 'pdf':
      return `${READ_MODE_ACTION[command.readMode]} PDF...`;
    case 'text':
      return command.readMode === 'full' ? 'Preparing text...' : `${READ_MODE_ACTION[command.readMode]} text...`;
  }
}
