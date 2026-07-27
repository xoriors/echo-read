import type { ArticleFetcher } from '../../../application/ports/articleFetcher';
import type { Logger } from '../../../application/ports/logger';
import { MIN_USABLE_ARTICLE_LENGTH, type RawArticle } from '../../../domain/rawArticle';

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

/**
 * A plain GET of the page. Returns raw markup, which the model is asked to
 * clean up downstream — good enough for server-rendered articles.
 */
export class HttpArticleFetcher implements ArticleFetcher {
  readonly name = 'http';
  readonly minimumLength = MIN_USABLE_ARTICLE_LENGTH;

  constructor(private readonly logger: Logger) {}

  isAvailable(): boolean {
    return true;
  }

  async fetch(url: string): Promise<RawArticle | null> {
    const response = await fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT } });

    if (!response.ok) {
      this.logger.warn('Direct fetch rejected the request', { url, status: response.status });
      return null;
    }

    return { url, text: await response.text(), retrievedBy: this.name };
  }
}
