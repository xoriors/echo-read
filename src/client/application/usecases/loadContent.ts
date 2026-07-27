import type { PdfSelection } from '../../../shared/domain/contentSource';
import { ContentUnavailableError } from '../../../shared/domain/errors';
import type { GroundingSource } from '../../../shared/domain/groundingSource';
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
    };
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

      case 'pdf': {
        this.status.publish('Downloading PDF...');
        const base64Data = await command.source.readAsBase64();
        this.status.publish(`${READ_MODE_ACTION[command.readMode]} PDF...`);
        return this.gateway.extractPdf(base64Data, command.readMode, command.selection);
      }
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
