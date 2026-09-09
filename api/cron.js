import { CRON_SECRET } from '../lib/config.js';
import { runCheckIfDue } from '../lib/checker.js';

export default async function handler(req, res) {
  // Vercel Cron сам подставляет заголовок Authorization: Bearer <CRON_SECRET>,
  // если переменная окружения CRON_SECRET задана в настройках проекта.
  // Это защищает эндпоинт от вызова кем угодно из интернета.
  if (CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${CRON_SECRET}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }

  try {
    const result = await runCheckIfDue();
    res.status(200).json(result);
  } catch (e) {
    console.error('Ошибка в /api/cron:', e);
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
