import type { ArticleFetcher } from '../../../application/ports/articleFetcher';
import type { Logger } from '../../../application/ports/logger';
import { isUsableArticleText, type RawArticle } from '../../../domain/rawArticle';
import { messageOf } from '../../../../shared/domain/errors';

/**
 * Chain of responsibility over several fetchers, cheapest first.
 *
 * A delegate "wins" only if it produced enough text to clear its own bar; a
 * delegate that throws is logged and skipped, so one broken provider never
 * takes the feature down.
 */
export class FallbackArticleFetcher implements ArticleFetcher {
  readonly name = 'fallback-chain';
  readonly minimumLength: number;

  constructor(
    private readonly delegates: readonly ArticleFetcher[],
    private readonly logger: Logger,
  ) {
    this.minimumLength = Math.min(...delegates.map((delegate) => delegate.minimumLength));
  }

  isAvailable(): boolean {
    return this.delegates.some((delegate) => delegate.isAvailable());
  }

  async fetch(url: string): Promise<RawArticle | null> {
    for (const delegate of this.delegates) {
      if (!delegate.isAvailable()) continue;

      try {
        const article = await delegate.fetch(url);
        if (article && isUsableArticleText(article.text, delegate.minimumLength)) return article;
        this.logger.warn('Fetcher returned too little content', { url, fetcher: delegate.name });
      } catch (error) {
        this.logger.warn('Fetcher failed', { url, fetcher: delegate.name, reason: messageOf(error) });
      }
    }

    return null;
  }
}
