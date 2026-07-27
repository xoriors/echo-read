import { ContentUnavailableError, ValidationError } from '../../../shared/domain/errors';
import { groundingSourceOf } from '../../../shared/domain/groundingSource';
import type { ReadMode } from '../../../shared/domain/readMode';
import { contentDocument, hasReadableText, type ContentDocument } from '../../domain/contentDocument';
import { articlePrompt } from '../../domain/prompts';
import type { ArticleFetcher } from '../ports/articleFetcher';
import type { ContentAnalyzer } from '../ports/contentAnalyzer';
import type { Logger } from '../ports/logger';

export interface ReadArticleCommand {
  url: string;
  readMode: ReadMode;
}

/**
 * Scrape a page, then have the model turn it into listenable prose.
 *
 * The two halves are deliberately separate ports: swapping the scraper (or the
 * model) is a wiring change in the composition root, not a change here.
 */
export class ReadArticleUseCase {
  constructor(
    private readonly fetcher: ArticleFetcher,
    private readonly analyzer: ContentAnalyzer,
    private readonly logger: Logger,
  ) {}

  async execute({ url, readMode }: ReadArticleCommand): Promise<ContentDocument> {
    if (!url?.trim()) throw new ValidationError('URL is required');

    const article = await this.fetcher.fetch(url);
    if (!article) {
      throw new ContentUnavailableError(
        'Could not extract sufficient content from the URL. It might be behind a hard paywall or bot protection.',
      );
    }

    this.logger.info('Article retrieved', {
      url,
      characters: article.text.length,
      retrievedBy: article.retrievedBy,
    });

    const { text } = await this.analyzer.analyze({ prompt: articlePrompt(article.text, readMode) });
    const document = contentDocument(text, [groundingSourceOf(url)]);

    if (!hasReadableText(document)) {
      throw new ContentUnavailableError(
        'The AI could not extract content from the URL. It might be behind a paywall, require a login, or be inaccessible.',
      );
    }

    return document;
  }
}
