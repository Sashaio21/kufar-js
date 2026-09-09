export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export const TARGET_URL =
  process.env.TARGET_URL ||
  'https://re.kufar.by/l/grodno/snyat/kvartiru/1k?cur=USD&prc=r%3A0%2C200';

export const DEFAULT_CHECK_INTERVAL_SECONDS = Number(process.env.CHECK_INTERVAL_SECONDS || 300);
export const MIN_CHECK_INTERVAL_SECONDS = Number(process.env.MIN_CHECK_INTERVAL_SECONDS || 30);
export const PAGE_LOAD_WAIT_MS = Number(process.env.PAGE_LOAD_WAIT_SECONDS || 15) * 1000;
export const MAX_CONSECUTIVE_EMPTY = Number(process.env.MAX_CONSECUTIVE_EMPTY || 3);
export const MAX_BACKOFF_MULTIPLIER = Number(process.env.MAX_BACKOFF_MULTIPLIER || 8);
export const CRON_SECRET = process.env.CRON_SECRET;

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn(
    'TELEGRAM_TOKEN и/или TELEGRAM_CHAT_ID не заданы — бот не сможет отправлять сообщения.'
  );
}
