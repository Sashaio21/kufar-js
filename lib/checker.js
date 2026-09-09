import { getState, setState, getSeenUrls, addSeenUrls } from './state.js';
import { fetchCurrentAds, BlockedError } from './scraper.js';
import { sendMessage } from './telegram.js';
import { formatTimeDisplay, formatPriceDisplay } from './parse.js';
import { MAX_CONSECUTIVE_EMPTY, MAX_BACKOFF_MULTIPLIER } from './config.js';

async function notifyProblem(reason) {
  const state = await getState();
  const problems = state.consecutiveProblems + 1;
  const alreadyAlerted = state.alerted;
  const oldMultiplier = state.backoffMultiplier;

  const isExplicitBlock = reason !== 'нет объявлений ни одним из способов';
  const firstAlert =
    (problems === 1 && isExplicitBlock) || (!isExplicitBlock && problems === MAX_CONSECUTIVE_EMPTY);
  const escalation = alreadyAlerted && problems % MAX_CONSECUTIVE_EMPTY === 0;

  if (!firstAlert && !escalation) {
    await setState({ consecutiveProblems: problems, lastProblemReason: reason });
    return;
  }

  const newMultiplier = Math.min(Math.max(oldMultiplier * 2, 2), MAX_BACKOFF_MULTIPLIER);
  const baseInterval = state.interval;

  if (newMultiplier === oldMultiplier && alreadyAlerted && !escalation) {
    await setState({ consecutiveProblems: problems, lastProblemReason: reason });
    return;
  }

  await setState({
    consecutiveProblems: problems,
    lastProblemReason: reason,
    backoffMultiplier: newMultiplier,
    alerted: true,
  });

  const effective = baseInterval * newMultiplier;
  const text =
    `⚠️ Проблема с доступом к kufar (проверок подряд: ${problems}).\n` +
    `Причина: ${reason}\n` +
    `Увеличиваю паузу между проверками до ${effective} сек. ` +
    `(x${newMultiplier} от обычных ${baseInterval} сек.), пока доступ не восстановится.`;
  console.warn(text.replace(/\n/g, ' '));
  await sendMessage(text);
}

async function notifyRecovered() {
  const state = await getState();
  const wasAlerted = state.alerted;
  await setState({
    consecutiveProblems: 0,
    alerted: false,
    backoffMultiplier: 1,
    lastProblemReason: null,
  });
  if (!wasAlerted) return;

  const text = `✅ Доступ к kufar восстановлен. Возвращаюсь к обычной паузе ${state.interval} сек.`;
  console.log(text);
  await sendMessage(text);
}

// Аналог check_once() из Python-версии
export async function runCheckOnce() {
  const seen = await getSeenUrls();

  let currentAds;
  try {
    currentAds = await fetchCurrentAds();
  } catch (e) {
    if (e instanceof BlockedError) {
      await notifyProblem(`похоже на блокировку/капчу (${e.message})`);
    } else {
      console.error('Ошибка при запросе страницы:', e);
      await notifyProblem(`ошибка браузера/сети: ${e.message || e}`);
    }
    return { ok: false };
  }

  if (!currentAds) {
    console.warn(
      'Не удалось найти объявления ни одним из способов. Возможно, сайт изменил структуру страницы или показывает капчу/блокировку.'
    );
    await notifyProblem('нет объявлений ни одним из способов');
    return { ok: false };
  }

  await notifyRecovered();

  const currentUrls = currentAds.map((ad) => ad.url);
  const newAds = currentAds.filter((ad) => !seen.has(ad.url));

  if (newAds.length) {
    console.log(`Найдено новых объявлений: ${newAds.length}`);
    for (const ad of newAds) {
      const timeLine = formatTimeDisplay(ad.time) || 'время публикации не найдено';
      const priceLine = formatPriceDisplay(ad.price_usd, ad.price_byn) || 'цена не найдена';
      const message = `Новое объявление\nЦена: ${priceLine}\nОпубликовано: ${timeLine}\n${ad.url}`;
      await sendMessage(message);
    }
  }

  await addSeenUrls(currentUrls);
  return { ok: true, newAds: newAds.length, total: currentAds.length };
}

// Вызывается из /api/cron. В отличие от Python-версии, где таймер жил
// в бесконечном цикле, тут cron дёргает функцию часто (см. vercel.json),
// а реальная проверка запускается только когда наступило nextCheckAt —
// это и есть аналог "паузы между проверками" с учётом бэкоффа.
export async function runCheckIfDue() {
  const state = await getState();
  const now = Date.now();
  if (state.nextCheckAt && now < state.nextCheckAt) {
    return { skipped: true, nextCheckInSeconds: Math.round((state.nextCheckAt - now) / 1000) };
  }

  const result = await runCheckOnce();
  const fresh = await getState();
  const effectiveIntervalMs = fresh.interval * fresh.backoffMultiplier * 1000;
  await setState({ nextCheckAt: Date.now() + effectiveIntervalMs });
  return result;
}
