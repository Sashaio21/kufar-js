import { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } from './config.js';

const API_BASE = TELEGRAM_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_TOKEN}` : null;

export async function sendMessage(text, chatId = TELEGRAM_CHAT_ID) {
  if (!API_BASE) {
    console.error('TELEGRAM_TOKEN не задан, сообщение не отправлено:', text);
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      console.error('Ошибка Telegram API:', await res.text());
    }
  } catch (e) {
    console.error('Не удалось отправить сообщение в Telegram:', e);
  }
}
