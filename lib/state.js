// В Python-версии состояние (интервал, бэкофф, seen_ads) жило в памяти
// процесса и в локальном json-файле. На Vercel функция не имеет постоянной
// памяти/диска между вызовами, поэтому всё это хранится во внешнем
// key-value хранилище (Vercel KV / Upstash Redis, подключается во вкладке
// Storage проекта на Vercel — тогда переменные окружения подставятся сами).
import { kv } from '@vercel/kv';
import { DEFAULT_CHECK_INTERVAL_SECONDS } from './config.js';

const STATE_KEY = 'kufar:state';
const SEEN_KEY = 'kufar:seen';

const DEFAULT_STATE = {
  interval: DEFAULT_CHECK_INTERVAL_SECONDS,
  nextCheckAt: 0,
  consecutiveProblems: 0,
  alerted: false,
  backoffMultiplier: 1,
  lastProblemReason: null,
};

export async function getState() {
  const stored = await kv.get(STATE_KEY);
  return { ...DEFAULT_STATE, ...(stored || {}) };
}

export async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await kv.set(STATE_KEY, next);
  return next;
}

export async function getSeenUrls() {
  const members = await kv.smembers(SEEN_KEY);
  return new Set(members || []);
}

export async function addSeenUrls(urls) {
  if (!urls || !urls.length) return;
  await kv.sadd(SEEN_KEY, ...urls);
}
