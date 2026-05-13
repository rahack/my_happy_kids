# My Happy Kids — гид для AI-ассистентов

Telegram Mini App для ежедневной мотивации детей: админ (родитель) ведёт задачи и награды на день, ребёнок отмечает выполнение, награда раскрывается только админу по паролю.

> Этот документ — карта проекта и собранные «грабли». Читать перед любыми изменениями.

## Стек и роли файлов

| Файл | Назначение |
|---|---|
| `server.js` | Express + сессии + REST API + автозапуск туннеля + старт бота. Точка входа. |
| `bot.js` | Telegraf: Menu Button (`setChatMenuButton`), `/start`, `/open`. |
| `tunnel.js` | Спавнит `tools/cloudflared.exe`, парсит stdout, отдаёт `*.trycloudflare.com` URL. |
| `db.js` | better-sqlite3: схема, сидинг админа `admin/admin`. |
| `public/index.html`, `public/app.js`, `public/style.css` | Vanilla-JS SPA (никаких сборщиков). |
| `tools/cloudflared.exe` | Бинарь quick tunnel (Windows AMD64). В `.gitignore`. |
| `data.db` | SQLite файл, создаётся при старте. В `.gitignore`. |
| `.env` | `TELEGRAM_TOKEN`, опционально `WEBAPP_URL`, `SESSION_SECRET`, `PORT`, `NO_TUNNEL`. **Не править через AI** — реальный токен. |

## Команды

- `npm start` — сервер + туннель + бот в одном процессе.
- `NO_TUNNEL=1 npm start` — только локально (`http://localhost:3000`).
- `WEBAPP_URL=https://... npm start` — использовать фиксированный URL (named tunnel и т.п.), автотуннель не стартует.

## Архитектура запуска

1. `server.js` биндит `PORT` (по умолчанию 3000).
2. Если `WEBAPP_URL` не задан и `NO_TUNNEL !== '1'` — спавнит `cloudflared`, ждёт URL из stdout (до 30 сек), кладёт в `process.env.WEBAPP_URL`.
3. Стартует бот. Бот читает `WEBAPP_URL` **динамически** на каждое сообщение (`getWebAppUrl()`), чтобы новый URL после рестарта подхватился без рестарта обработчиков.
4. При старте бот переустанавливает Menu Button через `setChatMenuButton` с URL + cache-buster `?v=Date.now()`.

## Авторизация и режимы

- Один админ (`admin.id = 1`, bcrypt-хэш). Дефолтные креды `admin/admin`. Меняется через `POST /api/change-password`.
- Сессия — `express-session`, cookie 7 дней.
- Все API кроме `/api/login` и `/api/me` защищены `requireAuth`.
- **UI-режимы** (`localStorage.mode`): `view` (по умолчанию) и `admin`. Это **только клиентский флаг** — сервер не различает. View-режим скрывает админские контролы (добавление детей/задач, удаление, настройки), но человек с сессией может переключить обратно. Это compromise: главная цель — чтобы ребёнок ничего случайно не нажал, а не enterprise-grade ACL.
- **Галочки задач может ставить и ребёнок в view-режиме** (на сегодняшнем дне). Родитель проверяет реальное выполнение задания вживую, поэтому ребёнок-«самозванец» легко выявляется. Награда всё равно требует ввода пароля админа.
- Переключение `view → admin` требует пароля (модалка `renderModeAuthModal`). Выход `admin → view` без пароля.

## Просмотр по дням (календарь)

- `state.selectedDate` + `state.selectedDay = { date, tasks, reward }` — фронт оперирует выбранным днём, а не «сегодня». Сегодня используется только как опорная точка для классификации (`dayTypeOf`).
- `GET /api/kids/:id/day/:date` — задачи и награда за произвольную дату; вызывается при клике по полосе календаря.
- `GET /api/kids/:id` дополнительно возвращает `calendar: [{date, total, done, has_reward, claimed}]` — маркеры точек на полосе.
- Полоса — горизонтальная (`renderCalendarStrip`), окно 14 дней вокруг `selectedDate`. `state.calendarAnchor` сбрасывается при выборе даты, чтобы выбранный день оказывался в центре. После рендера `scrollIntoView` доводит выбранную ячейку до середины видимой области.

### Типы дней

`dayTypeOf(date, todayDate)` → `'past' | 'today' | 'future'`. UX отличается:

| | past | today | future |
|---|---|---|---|
| Чекбокс задачи | заморожен (✓ / ○) | активен | 🔒 |
| Добавление/удаление задач | — | admin | admin |
| Award (view) | claimed → 🏆 + название; иначе 🎁 + название + «Не получена» | основной флоу с паролем | 🎁 «Сюрприз!» (название скрыто) если назначена |
| Award (admin) | как в view | название видно всегда; кнопка «Вручить» убрана | название видно; есть форма «Изменить награду» |

Прошлое всегда read-only (включая admin) — «архив».

## Логика отображения награды (renderRewardSection)

Главные инварианты:

- **Название награды видно только в момент вручения** (view-режим). Цепочка: 100% → «Открыть награду» → пароль (`/api/verify-admin`) → «Сюрприз готов!» + «Вручить награду» → клик по «Вручить» → `claimed=1`, теперь видно 🏆 + название.
- В admin-режиме название видно всегда (планирование). Кнопка «Вручить» в admin-режиме **отсутствует** — вручение происходит в view-режиме, чтобы ребёнок увидел сюрприз.
- `state.rewardUnlocked` сбрасывается при `openKid()`, `selectDate()`, и в `reloadKid()` если `!allDone` — пароль не «прилипает» после снятия галочки.
- Сервер в `POST /api/tasks/:id/toggle` автоматически сбрасывает `claimed=0` если после переключения задачи не все выполнены — то есть инвариант **`claimed=1` ⇒ все задачи дня выполнены** держится на бэке, а не только визуально.
- `POST /api/kids/:id/reward` (upsert) сбрасывает `claimed=0` при изменении названия — переименование = новая награда.
- В admin-режиме поле «Изменить награду» без префила (чтобы не светить текущее название тому, кто заглядывает через плечо).

## Схема БД (SQLite, `data.db`)

- `admin (id=1 CHECK, username, password_hash)` — single-row.
- `kids (id, name, age, gender, photo TEXT?, created_at)` — `photo` хранит base64 data URL (JPEG, на клиенте даунскейл до 256px, q=0.85).
- `tasks (id, kid_id FK ON DELETE CASCADE, date TEXT 'YYYY-MM-DD', title, completed 0|1, completed_at)`
- `rewards (id, kid_id FK ON DELETE CASCADE, date TEXT, title, claimed 0|1, claimed_at)` — `UNIQUE(kid_id, date)`

### Лёгкие миграции

В `db.js` есть `ensureColumn(table, column, definition)` — проверяет `PRAGMA table_info` и делает `ALTER TABLE ADD COLUMN` только если колонки нет. Пример (уже применено): `ensureColumn('kids', 'photo', 'TEXT')`.

Это позволяет добавлять nullable-колонки без потери данных. Для несовместимых изменений (rename, NOT NULL без default, изменение типа) — либо ручной SQL, либо пересоздание `data.db`.

### Размер payload

`express.json({ limit: '2mb' })` — поднято с дефолтных 100kb из-за base64-фото в `POST /api/kids` и `PUT /api/kids/:id`.

## Windows-grabли

- **Старый процесс держит порт 3000.** `kill_shell` / Ctrl-C в фоновых терминалах не всегда убивает дерево npm→node. Признак: новый `npm start` пишет «running at» но `/api/...` отдают старый код или 404 на новые endpoints. Диагностика:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -State Listen | Select OwningProcess
  ```
  Лечится:
  ```cmd
  taskkill /F /PID <pid> /T
  ```

- **`data.db` блокируется** пока процесс жив — `rm` падает с EBUSY. Сначала убить процесс, дождаться `sleep 2`, потом удалять.

- **curl в MINGW/Git Bash ломает кириллицу** (cp1251 → битые байты в БД). Для запросов с не-ASCII контентом используй Node:
  ```js
  await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify({title: 'Мороженое'})
  });
  ```
  Из браузера и Telegram-клиента UTF-8 уходит корректно — это только проблема Windows-консоли.

- Терминал может показывать `���������` даже когда в БД лежит корректный UTF-8. Проверяй через `node`-скрипт или браузер, не доверяй cmd/bash output.

## Telegram Mini App — грабли

- **Кеш Mini App агрессивный.** После любого изменения фронта или ребилда:
  - На сервере: `Cache-Control: no-store, must-revalidate` (уже стоит в `server.js`).
  - В URL Menu Button: cache-buster `?v=<timestamp>` (уже добавляется в `bot.js`).
  - На клиенте: закрыть/открыть чат с ботом, или в меню Mini App → Reload Page, или Settings → Advanced → Clear Cache.

- **Quick tunnel URL меняется** при каждом рестарте. Менюшка обновляется автоматически. Юзеру нужно обновить чат с ботом в Telegram.

- **`bot.launch()` промис в Telegraf 4.x резолвится только при остановке**, не при старте. Лог `[bot] @x ready` — это `bot.telegram.getMe()` параллельно. `bot.launch().then(...)` для подтверждения старта **не использовать**.

- **Menu Button (слева от поля ввода)** и **reply keyboard (внизу)** — два разных механизма. Reply keyboard «прилипает» к чату; убирать явно: `Markup.removeKeyboard()` при ответе.

- **Тёмная тема Telegram**: `--tg-theme-text-color` становится светлым, а наши hardcoded `background: #fafafa` остаются светлыми → белый текст на белом фоне. Лочим `color: #1c1c1e` на элементах `.task`, `.reward`, `.history-day`. Не убирай эти `color: ...` без необходимости.

- Mini App требует HTTPS. Локально работает только через туннель или браузер на `localhost`.

## Тестирование и smoke-test

```bash
# Локальный smoke-test (Linux/macOS или bash без не-ASCII контента):
curl -c c.txt -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' http://localhost:3000/api/login
curl -b c.txt http://localhost:3000/api/me
curl -b c.txt http://localhost:3000/api/kids
```

Полный E2E лучше прогонять через UI в обычном браузере на `http://localhost:3000` (туннель не обязателен). Telegram-клиент тестировать **последним** — кеш съест мозги.

## Соглашения по коду

- Без сборщиков и фреймворков на фронте: hyperscript-like `h(tag, attrs, ...children)` + ручной `render()` после изменения `state`.
- Не добавляй React/Vue/Webpack без явной просьбы.
- Маленькие изменения — точечные правки `edit`, не переписывай файлы целиком.
- Не валидируем Telegram `initData` (вход по логин/пароль, как было в ТЗ). Если расширять до многопользовательской модели — добавить HMAC-проверку `initData`.
- В CSS поддерживаем переменные темы Telegram (`--tg-theme-*`) с fallback'ами.

## Что точно не делать

- Не править `.env` — реальный `TELEGRAM_TOKEN`.
- Не пушить `data.db`, `tools/cloudflared.exe`, `cookies.txt` (в `.gitignore`).
- Не вешать тяжёлые зависимости ради удобства — это прототип.
- Не выпиливать `Cache-Control: no-store` и cache-buster без явной причины — без них Telegram будет показывать вчерашний фронт.
