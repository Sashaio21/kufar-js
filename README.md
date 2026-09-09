# kufar-monitor-js

JS/Vercel-версия мониторинга новых объявлений на re.kufar.by с уведомлениями
в Telegram. Портирована с Python-версии (Selenium + aiogram + aiohttp,
работающей как один постоянный процесс в docker-compose).

## Чем архитектура отличается от Python-версии

Vercel — serverless-платформа: функции не работают вечно, у них нет своего
диска между вызовами и нет постоянного event loop. Поэтому:

| Python-версия                          | JS/Vercel-версия                                   |
|-----------------------------------------|-----------------------------------------------------|
| `while True` с паузой между проверками  | `Vercel Cron` дёргает `/api/cron` по расписанию      |
| Selenium + Chrome                       | `puppeteer-core` + `@sparticuz/chromium`             |
| long-polling бота (`aiogram`)           | Telegram **webhook** → `/api/telegram`               |
| `seen_ads.json` на диске                | Vercel KV / Upstash Redis (set `kufar:seen`)         |
| состояние (интервал, бэкофф) в памяти   | то же самое, но в KV (`kufar:state`)                 |
| aiohttp health-check сервер             | не нужен — Vercel сам управляет функциями            |

Логика парсинга (даты, цены, детект блокировки/капчи, экспоненциальный
бэкофф, стратегии `__NEXT_DATA__` / сырые ссылки) перенесена как есть.

## ⚠️ Важные ограничения, которые нужно понимать до деплоя

1. **Частота проверок и тариф Vercel.** Cron-задачи на бесплатном Hobby-плане
   можно запускать не чаще **раза в сутки**. Чтобы проверять сайт каждые
   несколько минут (как `CHECK_INTERVAL_SECONDS=300` по умолчанию), нужен
   план **Pro** (там cron может запускаться каждую минуту). На Hobby либо
   меняйте расписание в `vercel.json` на `0 * * * *`/раз в день, либо
   переходите на Pro.
2. **Лимит времени выполнения функции.** Открыть headless Chrome, дождаться
   отрисовки объявлений и распарсить страницу может занять больше 10 секунд
   (дефолт Hobby). В `vercel.json` уже стоит `maxDuration: 60` — на Hobby
   максимум обычно 60 сек, на Pro можно поднять до 300 сек, если сайт
   грузится медленно или капча требует больше времени.
3. **Антибот-защита сайта.** Оригинальный бот специально маскировал
   `navigator.webdriver`, менял User-Agent и т.п. — значит, сайт что-то
   такое проверяет. `@sparticuz/chromium` — это тот же Chromium, тот же
   набор трюков перенесён, но serverless-IP Vercel (в отличие от вашего
   VPS) может попадать под более агрессивные лимиты/банwillBlock у kufar.
   Если увидите частые алерты "проблема с доступом" — это ожидаемо и
   потребует более длинных пауз (`CHECK_INTERVAL_SECONDS`) либо вообще
   не решается на serverless-платформе без прокси.
4. **`/check` и `/interval` теперь синхронные HTTP-запросы**, а не команды
   фоновому процессу — `/check` в Telegram буквально запускает Chrome прямо
   во время обработки вебхука, так что ответ от бота может прийти не
   мгновенно.

Если что-то из этого не подходит (особенно пп. 1–3), возможно, для такого
бота обычный VPS с docker-compose (как было изначально) — более надёжный
вариант, чем serverless. Но раз задача была именно "на Vercel" — вот рабочая
реализация с учётом этих ограничений.

## Структура проекта

```
api/
  cron.js       — вызывается по расписанию (Vercel Cron), запускает проверку
  telegram.js   — webhook для Telegram-бота (/status, /interval, /check, /help)
lib/
  config.js     — переменные окружения
  parse.js      — парсинг дат/цен, детект блокировки (regex как в Python)
  htmlParse.js  — извлечение объявлений из HTML (__NEXT_DATA__ / сырые ссылки)
  scraper.js    — puppeteer-core + @sparticuz/chromium
  state.js      — состояние и seen-ads в Vercel KV
  telegram.js   — отправка сообщений через Telegram Bot API
  checker.js    — основная логика проверки + бэкофф при блокировках
vercel.json     — расписание cron + лимиты функций
```

## Деплой

1. **Создай бота** у `@BotFather`, получи `TELEGRAM_TOKEN`.
   Узнай свой `chat_id` у `@userinfobot`.

2. **Задеплой проект на Vercel** (через `vercel` CLI или импорт репозитория
   на vercel.com).

3. **Подключи хранилище**: в проекте на vercel.com → вкладка **Storage** →
   создай **Vercel KV** (или маркетплейс-интеграцию Upstash for Redis) и
   подключи её к проекту. Переменные `KV_REST_API_URL` / `KV_REST_API_TOKEN`
   подставятся автоматически — вручную задавать не нужно.

4. **Задай переменные окружения** в Project Settings → Environment
   Variables (см. `.env.example`): как минимум `TELEGRAM_TOKEN`,
   `TELEGRAM_CHAT_ID`. Остальные — по желанию, есть дефолты.
   Рекомендуется также задать `CRON_SECRET` (любая случайная строка) —
   Vercel сам подставит её в заголовок при вызове `/api/cron`, это защитит
   эндпоинт от посторонних вызовов.

5. **Подключи Telegram webhook** к задеплоенному урлу (замени токен и домен):

   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=https://<твой-проект>.vercel.app/api/telegram"
   ```

   Проверить, что вебхук встал:

   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_TOKEN>/getWebhookInfo"
   ```

6. Готово. Cron будет дёргать `/api/cron` по расписанию из `vercel.json`,
   а сам чекер решает (по `nextCheckAt` в KV), пора ли реально запускать
   проверку — это и заменяет паузу `CHECK_INTERVAL_SECONDS` из Python-версии.

## Локальная разработка

```bash
npm install
vercel dev
```

Учти: локально `@sparticuz/chromium` рассчитан на Amazon Linux/Lambda-среду
Vercel и на macOS/Windows/обычном Linux может не запуститься "из коробки".
Для локальной отладки скрапера проще временно поставить обычный
`puppeteer` (со своим Chromium) в `lib/scraper.js`, а на проде оставить
`puppeteer-core` + `@sparticuz/chromium`.

## Ручной запуск проверки без Telegram

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<твой-проект>.vercel.app/api/cron
```
