import type { RawArticle } from '../../domain/rawArticle';

/**
 * Driven port: something that can get the readable text of a web page.
 *
 * Implementations differ wildly in cost and capability (a plain GET, a reader
 * proxy, a remote headless browser), so each declares how much text it must
 * produce before its answer counts as a real article rather than a stub.
 */
export interface ArticleFetcher {
  readonly name: string;

  /** Minimum trimmed length before this fetcher's output is trusted. */
  readonly minimumLength: number;

  /** False when the fetcher lacks the credentials or setup it needs. */
  isAvailable(): boolean;

  /** Resolves to `null` when this fetcher simply could not get the page. */
  fetch(url: string): Promise<RawArticle | null>;
}
