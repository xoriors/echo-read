import { ContentUnavailableError, ValidationError } from '../../../shared/domain/errors';
import type { SummaryMode } from '../../../shared/domain/readMode';
import { contentDocument, hasReadableText, type ContentDocument } from '../../domain/contentDocument';
import { pastedTextPrompt } from '../../domain/prompts';
import type { ContentAnalyzer } from '../ports/contentAnalyzer';

export interface SummarizeTextCommand {
  text: string;
  readMode: SummaryMode;
}

/** Condense text the user supplied directly. */
export class SummarizeTextUseCase {
  constructor(private readonly analyzer: ContentAnalyzer) {}

  async execute({ text, readMode }: SummarizeTextCommand): Promise<ContentDocument> {
    if (!text?.trim()) throw new ValidationError('Text is required');

    const result = await this.analyzer.analyze({ prompt: pastedTextPrompt(text, readMode) });
    const document = contentDocument(result.text);

    if (!hasReadableText(document)) {
      throw new ContentUnavailableError('The AI could not generate a summary from the provided text.');
    }

    return document;
  }
}
