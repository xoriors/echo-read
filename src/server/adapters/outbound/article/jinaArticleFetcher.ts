import type { ArticleFetcher } from '../../../application/ports/articleFetcher';
import type { Logger } from '../../../application/ports/logger';
import { MIN_RENDERED_ARTICLE_LENGTH, type RawArticle } from '../../../domain/rawArticle';

const JINA_READER_ENDPOINT = 'https://r.jina.ai/';

/**
 * Reader proxy that renders the page server-side and returns plain text.
 * First choice: no credentials needed and it copes with client-rendered pages.
 */
export class JinaArticleFetcher implements ArticleFetcher {
  readonly name = 'jina';
  readonly minimumLength = MIN_RENDERED_ARTICLE_LENGTH;

  constructor(private readonly logger: Logger) {}

  isAvailable(): boolean {
    return true;
  }

  async fetch(url: string): Promise<RawArticle | null> {
    const response = await fetch(`${JINA_READER_ENDPOINT}${url}`);

    if (!response.ok) {
      this.logger.warn('Jina reader rejected the request', { url, status: response.status });
      return null;
    }

    const text = await response.text();
    return { url, text, retrievedBy: this.name };
  }
}
