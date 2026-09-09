import { TELEGRAM_CHAT_ID, MIN_CHECK_INTERVAL_SECONDS } from '../lib/config.js';
import { getState, setState } from '../lib/state.js';
import { sendMessage } from '../lib/telegram.js';
import { runCheckOnce } from '../lib/checker.js';

const HELP_TEXT =
  'Доступные команды:\n' +
  '/status - периодичность, время следующей проверки и статус блокировки\n' +
  '/interval <секунды> - сменить базовую периодичность проверки\n' +
  '/check - проверить объявления прямо сейчас\n' +
  '/help - это сообщение\n\n' +
  'Если сайт начнёт блокировать запросы (капча/лимит) - бот сам ' +
  'пришлёт предупреждение и временно увеличит паузу между проверками, ' +
  'а когда доступ восстановится - сообщит об этом отдельно.';

// Команды принимаются только от TELEGRAM_CHAT_ID из настроек — сообщения
// от других chat_id игнорируются (как is_authorized() в Python-версии).
function isAuthorized(chatId) {
  return String(chatId) === String(TELEGRAM_CHAT_ID);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

  const update = req.body || {};
  const message = update.message;
  if (!message || !message.text) {
    res.status(200).send('OK');
    return;
  }

  const chatId = message.chat && message.chat.id;
  if (!isAuthorized(chatId)) {
    res.status(200).send('OK');
    return;
  }

  const text = message.text.trim();
  const [cmd, ...rest] = text.split(/\s+/);

  if (cmd === '/start' || cmd === '/help') {
    await sendMessage(HELP_TEXT);
  } else if (cmd === '/status') {
    const state = await getState();
    const remaining = Math.max(0, Math.round((state.nextCheckAt - Date.now()) / 1000));
    const lines = [
      `Базовая периодичность: ${state.interval} сек.`,
      `Следующая проверка примерно через: ${remaining} сек.`,
    ];
    if (state.alerted) {
      lines.push(
        `⚠️ Сейчас проблема с доступом (подряд: ${state.consecutiveProblems}), ` +
          `причина: ${state.lastProblemReason}. Бэкофф: x${state.backoffMultiplier} ` +
          `(реальная пауза ${state.interval * state.backoffMultiplier} сек.).`
      );
    } else {
      lines.push('Доступ в порядке, блокировок не обнаружено.');
    }
    await sendMessage(lines.join('\n'));
  } else if (cmd === '/interval') {
    const value = rest[0];
    if (!value || !/^\d+$/.test(value)) {
      await sendMessage('Использование: /interval <секунды>, например /interval 120');
    } else {
      const seconds = parseInt(value, 10);
      if (seconds < MIN_CHECK_INTERVAL_SECONDS) {
        await sendMessage(
          `Слишком маленький интервал. Минимум ${MIN_CHECK_INTERVAL_SECONDS} сек., чтобы не долбить сайт слишком часто.`
        );
      } else {
        await setState({ interval: seconds, nextCheckAt: Date.now() + seconds * 1000 });
        await sendMessage(`Готово. Новая периодичность проверки: ${seconds} сек.`);
      }
    }
  } else if (cmd === '/check') {
    await sendMessage('Запускаю проверку прямо сейчас...');
    // В Python-версии /check "будил" фоновый цикл через asyncio.Event.
    // В serverless нет фонового цикла — проверка просто выполняется
    // синхронно в рамках этого HTTP-запроса от Telegram.
    await runCheckOnce();
    const fresh = await getState();
    await setState({ nextCheckAt: Date.now() + fresh.interval * fresh.backoffMultiplier * 1000 });
  }

  res.status(200).send('OK');
}
