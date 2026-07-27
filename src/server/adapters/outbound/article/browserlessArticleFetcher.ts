import { chromium } from 'playwright-core';

import type { ArticleFetcher } from '../../../application/ports/articleFetcher';
import { MIN_RENDERED_ARTICLE_LENGTH, type RawArticle } from '../../../domain/rawArticle';

const BROWSERLESS_ENDPOINT = 'wss://chrome.browserless.io';
const NAVIGATION_TIMEOUT_MS = 15_000;

/**
 * Last resort: drive a real remote browser. Costs a credential and a few
 * seconds, so the chain only reaches it when cheaper fetchers came up short.
 */
export class BrowserlessArticleFetcher implements ArticleFetcher {
  readonly name = 'browserless';
  readonly minimumLength = MIN_RENDERED_ARTICLE_LENGTH;

  constructor(private readonly apiKey: string | undefined) {}

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetch(url: string): Promise<RawArticle | null> {
    if (!this.apiKey) return null;

    const browser = await chromium.connectOverCDP(`${BROWSERLESS_ENDPOINT}?token=${this.apiKey}`);
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      const text = await page.evaluate(() => document.body.innerText);
      return { url, text, retrievedBy: this.name };
    } finally {
      await browser.close();
    }
  }
}
