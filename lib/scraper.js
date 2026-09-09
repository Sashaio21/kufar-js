import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { TARGET_URL, PAGE_LOAD_WAIT_MS, USER_AGENT } from './config.js';
import { strategyNextData, strategyRawLinks, detectBlockingFromHtml } from './htmlParse.js';

export class BlockedError extends Error {}

export async function fetchCurrentAds() {
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--lang=ru-RU', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9' });

    // маскируем признак автоматизации, как в Python-версии через CDP
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // не грузим картинки/шрифты/медиа — ускоряет загрузку, что критично
    // при жёстких лимитах времени выполнения serverless-функций
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_LOAD_WAIT_MS + 15000,
    });

    try {
      await page.waitForSelector("a[href*='/vi/']", { timeout: PAGE_LOAD_WAIT_MS });
    } catch {
      console.warn(
        `За ${PAGE_LOAD_WAIT_MS / 1000} сек. не дождались появления карточек объявлений. Пробуем распарсить то, что есть.`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const html = await page.content();
    const title = await page.title();

    const blockReason = detectBlockingFromHtml(title, html);
    if (blockReason) throw new BlockedError(blockReason);

    let ads = strategyNextData(html);
    if (ads) {
      console.log(`Данные получены через __NEXT_DATA__ (${ads.length} объявлений).`);
      return ads;
    }

    ads = strategyRawLinks(html);
    if (ads) {
      console.log(`Данные получены через ссылки в отрисованном HTML (${ads.length} объявлений).`);
      return ads;
    }

    return null;
  } finally {
    await browser.close();
  }
}
