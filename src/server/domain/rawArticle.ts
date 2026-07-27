/**
 * The unprocessed text scraped off a web page, before the model cleans it up.
 */
export interface RawArticle {
  url: string;
  text: string;
  /** Name of the fetcher that produced it — useful in logs and diagnostics. */
  retrievedBy: string;
}

/**
 * Below this, a scrape is a cookie banner or an error page rather than an
 * article, and is not worth spending a model call on.
 */
export const MIN_USABLE_ARTICLE_LENGTH = 50;

/** Scrapers that render the page themselves are held to a higher bar. */
export const MIN_RENDERED_ARTICLE_LENGTH = 100;

export function isUsableArticleText(text: string | null | undefined, minimumLength: number): boolean {
  return !!text && text.trim().length >= minimumLength;
}
