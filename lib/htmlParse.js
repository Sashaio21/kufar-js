import * as cheerio from 'cheerio';
import {
  extractTimeText,
  extractTimeFromItem,
  extractPriceText,
  extractPriceFromItem,
  detectBlocking,
} from './parse.js';

function collapseText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function extractTimeNearLink($, el) {
  let node = $(el);
  for (let i = 0; i < 5; i++) {
    node = node.parent();
    if (!node || node.length === 0) break;
    const found = extractTimeText(collapseText(node.text()));
    if (found) return found;
  }
  return null;
}

function extractPriceNearLink($, el) {
  let node = $(el);
  for (let i = 0; i < 5; i++) {
    node = node.parent();
    if (!node || node.length === 0) break;
    const [usd, byn] = extractPriceText(collapseText(node.text()));
    if (usd || byn) return [usd, byn];
  }
  return [null, null];
}

// Стратегия 1: данные из __NEXT_DATA__ (Next.js SSR JSON)
export function strategyNextData(html) {
  const $ = cheerio.load(html);
  const script = $('script#__NEXT_DATA__').first();
  if (!script.length) return null;

  let data;
  try {
    data = JSON.parse(script.text());
  } catch {
    return null;
  }

  const found = [];
  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      for (const key of ['ads', 'items', 'listings', 'adverts']) {
        if (Array.isArray(node[key])) found.push(node[key]);
      }
      for (const v of Object.values(node)) walk(v);
    }
  }
  walk(data);
  if (!found.length) return null;

  const best = found.reduce((a, b) => (b.length > a.length ? b : a));
  const ads = [];
  for (const item of best) {
    if (!item || typeof item !== 'object') continue;
    const adId = item.ad_id || item.id;
    const link = item.ad_link || item.url;
    let url;
    if (link) url = link;
    else if (adId) url = `https://www.kufar.by/item/${adId}`;
    else continue;

    const [usd, byn] = extractPriceFromItem(item);
    ads.push({ url, time: extractTimeFromItem(item), price_usd: usd, price_byn: byn });
  }
  return ads.length ? ads : null;
}

// Стратегия 2: сырые ссылки вида /vi/... прямо из отрисованного HTML
export function strategyRawLinks(html) {
  const $ = cheerio.load(html);
  const links = $("a[href*='/vi/']");
  const ads = [];
  const seenUrls = new Set();

  links.each((_, el) => {
    let href = $(el).attr('href');
    if (!href) return;
    if (href.startsWith('/')) href = 'https://re.kufar.by' + href;
    if (seenUrls.has(href)) return;
    seenUrls.add(href);

    const [usd, byn] = extractPriceNearLink($, el);
    ads.push({ url: href, time: extractTimeNearLink($, el), price_usd: usd, price_byn: byn });
  });

  return ads.length ? ads : null;
}

export function detectBlockingFromHtml(title, html) {
  const $ = cheerio.load(html.slice(0, 20000));
  const sampleText = collapseText($.root().text());
  return detectBlocking(title, sampleText);
}
