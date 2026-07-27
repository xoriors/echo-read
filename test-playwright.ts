import { chromium } from 'playwright';
(async () => {
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://example.com');
    console.log("TITLE IS: " + await page.title());
    await browser.close();
  } catch (e) {
    console.error(e);
  }
})();
