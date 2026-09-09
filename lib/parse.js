// Портировано 1:1 по логике с main.py (парсинг относительных/абсолютных дат
// и цен из текста объявлений re.kufar.by).

const RU_MONTHS_GENITIVE = {
  1: 'января', 2: 'февраля', 3: 'марта', 4: 'апреля',
  5: 'мая', 6: 'июня', 7: 'июля', 8: 'августа',
  9: 'сентября', 10: 'октября', 11: 'ноября', 12: 'декабря',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatRuDatetime(dt) {
  return `${dt.getDate()} ${RU_MONTHS_GENITIVE[dt.getMonth() + 1]} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

const RELATIVE_PATTERN = /(\d+)\s*(секунд[аы]?|минут[аы]?|час(?:а|ов)?|день|дня|дней)\s*назад/i;
const TODAY_PATTERN = /сегодня(?:\s*в\s*(\d{1,2}):(\d{2}))?/i;
const YESTERDAY_PATTERN = /вчера(?:\s*в\s*(\d{1,2}):(\d{2}))?/i;
const ABS_DATE_PATTERN = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s*(\d{1,2}):(\d{2}))?/;
const TIME_ONLY_PATTERN = /\b(\d{1,2}):(\d{2})\b/;

const TIME_PATTERNS = [RELATIVE_PATTERN, TODAY_PATTERN, YESTERDAY_PATTERN, ABS_DATE_PATTERN, TIME_ONLY_PATTERN];

const TIME_FIELD_NAMES = ['list_time', 'created', 'created_at', 'date', 'publish_date', 'published_at', 'time'];

function unitToMs(unitWord) {
  const w = unitWord.toLowerCase();
  if (w.startsWith('сек')) return 1000;
  if (w.startsWith('мин')) return 60 * 1000;
  if (w.startsWith('час')) return 60 * 60 * 1000;
  if (w.startsWith('д')) return 24 * 60 * 60 * 1000; // день/дня/дней
  return null;
}

export function parseTimeTextToDt(text, now = new Date()) {
  if (!text) return null;

  let m = RELATIVE_PATTERN.exec(text);
  if (m) {
    const amount = parseInt(m[1], 10);
    const ms = unitToMs(m[2]);
    if (ms == null) return null;
    return new Date(now.getTime() - amount * ms);
  }

  m = TODAY_PATTERN.exec(text);
  if (m) {
    const dt = new Date(now);
    const hour = m[1] !== undefined ? parseInt(m[1], 10) : now.getHours();
    const minute = m[2] !== undefined ? parseInt(m[2], 10) : now.getMinutes();
    dt.setHours(hour, minute, 0, 0);
    return dt;
  }

  m = YESTERDAY_PATTERN.exec(text);
  if (m) {
    const base = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hour = m[1] !== undefined ? parseInt(m[1], 10) : 0;
    const minute = m[2] !== undefined ? parseInt(m[2], 10) : 0;
    base.setHours(hour, minute, 0, 0);
    return base;
  }

  m = ABS_DATE_PATTERN.exec(text);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    const hour = m[4] !== undefined ? parseInt(m[4], 10) : 0;
    const minute = m[5] !== undefined ? parseInt(m[5], 10) : 0;
    const dt = new Date(year, month - 1, day, hour, minute);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
      return null; // невалидная дата (аналог ValueError в Python)
    }
    return dt;
  }

  m = TIME_ONLY_PATTERN.exec(text);
  if (m) {
    const dt = new Date(now);
    dt.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    return dt;
  }

  return null;
}

export function formatTimeDisplay(timeText) {
  if (!timeText) return null;
  const dt = parseTimeTextToDt(timeText);
  return dt ? formatRuDatetime(dt) : timeText;
}

export function extractTimeText(text) {
  if (!text) return null;
  for (const pattern of TIME_PATTERNS) {
    const m = pattern.exec(text);
    if (m) return m[0].trim();
  }
  return null;
}

export function extractTimeFromItem(item) {
  for (const key of TIME_FIELD_NAMES) {
    if (item[key]) return String(item[key]);
  }
  return null;
}

// ---------------------- ЦЕНА ----------------------

const NUMBER = '\\d{1,6}';
const USD_PATTERN = new RegExp(`(?:\\$\\s?${NUMBER}\\b|\\b${NUMBER}\\s?\\$)`);
const BYN_PATTERN = new RegExp(`\\b${NUMBER}\\s?(?:руб\\.?|р\\.|BYN\\b)`, 'i');

const PRICE_USD_FIELD_NAMES = ['price_usd', 'priceUsd', 'priceUSD'];
const PRICE_BYN_FIELD_NAMES = ['price_byn', 'priceByn', 'priceBYN', 'price'];

function cleanAmount(raw) {
  const digits = raw.replace(/[^\d]/g, '');
  return digits || null;
}

export function extractPriceText(text) {
  if (!text) return [null, null];
  const usdMatch = USD_PATTERN.exec(text);
  const bynMatch = BYN_PATTERN.exec(text);
  return [usdMatch ? cleanAmount(usdMatch[0]) : null, bynMatch ? cleanAmount(bynMatch[0]) : null];
}

function moneyFromJsonValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  let n = num;
  if (n >= 1000) n = n / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function extractPriceFromItem(item) {
  let usd = null;
  let byn = null;
  for (const key of PRICE_USD_FIELD_NAMES) {
    if (item[key]) {
      usd = moneyFromJsonValue(item[key]);
      if (usd) break;
    }
  }
  for (const key of PRICE_BYN_FIELD_NAMES) {
    if (item[key]) {
      byn = moneyFromJsonValue(item[key]);
      if (byn) break;
    }
  }
  return [usd, byn];
}

export function formatPriceDisplay(usd, byn) {
  const parts = [];
  if (usd) parts.push(`${usd} $`);
  if (byn) parts.push(`${byn} руб.`);
  return parts.length ? parts.join(' / ') : null;
}

// ---------------------- ДЕТЕКТ БЛОКИРОВКИ ----------------------

export const BLOCK_INDICATORS = new RegExp(
  '(access denied|доступ запрещ|заблокирован|IP.{0,10}(заблокирован|banned)' +
    '|too many requests|429 |слишком много запрос' +
    '|captcha|капч' +
    '|подтвердите,?\\s*что вы не робот|я не робот' +
    '|checking your browser|just a moment|attention required' +
    '|unusual traffic|подозрительн\\w* активност)',
  'i'
);

export function detectBlocking(title, sampleText) {
  const combined = `${title || ''} ${sampleText || ''}`;
  const match = BLOCK_INDICATORS.exec(combined);
  return match ? match[0].trim() : null;
}
