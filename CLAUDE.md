# My Happy Kids — гид для AI-ассистентов

Telegram Mini App для ежедневной мотивации детей: админ (родитель) ведёт задачи и награды на день, ребёнок отмечает выполнение, награда раскрывается только админу по паролю.

> Этот документ — карта проекта и собранные «грабли». Читать перед любыми изменениями.

## Стек и роли файлов

| Файл | Назначение |
|---|---|
| `server.js` | Express + сессии + REST API + автозапуск туннеля + старт бота. Точка входа. |
| `bot.js` | Telegraf: Menu Button (`setChatMenuButton`), `/start`, `/open`. |
| `tunnel.js` | Цепочка из двух провайдеров: **cloudflared** → **pinggy.io** (SSH). Каждый следующий пробуется только если предыдущий упал или `pingUrl()` вернул 502/503. |
| `db.js` | better-sqlite3: схема (`users`, `kids`, `tasks`, `rewards`, `invites`, `memberships`, `task_templates`, `reward_templates`) + лёгкие миграции через `ensureColumn`. Сидинга нет — аккаунты создаются автоматически при первом TG-логине. |
| `public/index.html`, `public/app.js`, `public/style.css` | Vanilla-JS SPA (никаких сборщиков). |
| `public/i18n.js` | Словари переводов RU/EN + `t(key)`, `getLang()`, `setLang(lang)`. Загружается **до** `app.js`. |
| `tools/cloudflared.exe` | Бинарь quick tunnel (Windows AMD64). В `.gitignore`. |
| `.env` | `TELEGRAM_TOKEN`, опционально `WEBAPP_URL`, `SESSION_SECRET`, `PORT`, `NO_TUNNEL`. **Не править через AI** — реальный токен. |

## Команды

- `npm start` — сервер + туннель + бот в одном процессе.
- `NO_TUNNEL=1 npm start` — только локально (`http://localhost:3000`).
- `WEBAPP_URL=https://... npm start` — использовать фиксированный URL (named tunnel и т.п.), автотуннель не стартует.

## Claude Skills

Скилы лежат в `.claude/skills/`. **Вызывать через `skill invoke <name>`** по ключевым словам пользователя.

| Скил | Файл | Триггеры | Что делает |
|---|---|---|---|
| `run-app` | `.claude/skills/run-app/SKILL.md` | «запусти», «запусти приложение», «открой через туннель», «проверь» | Убивает порт 3000 → `npm start` в фоне → ждёт URL туннеля → smoke-test `/api/has-kids` |
| `commit` | `.claude/skills/commit/SKILL.md` | «закоммить», «сделай коммит», «сохрани изменения» | `git diff` → генерирует сообщение → спрашивает подтверждение → `git add -A && git commit` |
| `push` | `.claude/skills/push/SKILL.md` | «запушь», «отправь на GitHub», «push» | Проверяет незакоммиченные изменения → `git push origin master` |

## Архитектура запуска

1. `server.js` биндит `PORT` (по умолчанию 3000).
2. Если `WEBAPP_URL` не задан и `NO_TUNNEL !== '1'` — запускает цепочку: сначала **cloudflared** (до 30 сек), при ошибке — **pinggy.io** (`ssh -p 443 -R 0:localhost:PORT a.pinggy.io`, до 30 сек + HTTP-проверка через `pingUrl`). URL первого успешного кладётся в `process.env.WEBAPP_URL`.
3. Стартует бот. Бот читает `WEBAPP_URL` **динамически** на каждое сообщение (`getWebAppUrl()`), чтобы новый URL после рестарта подхватился без рестарта обработчиков. Бот также поддерживает invite-deeplink: `/start inv_<token>` отдаёт inline-кнопку «Принять приглашение», которая открывает Mini App с `?invite=<token>` в URL.
4. При старте бот переустанавливает Menu Button через `setChatMenuButton` с URL + cache-buster `?v=Date.now()`. Имя бота кэшируется в `bot.js::_botUsername` и используется сервером для генерации `t.me/<bot>?start=inv_...` invite-ссылок (`buildInviteUrl`).

## Авторизация и multi-tenancy

Архитектура **многопользовательская**: каждый Telegram-юзер при первом входе через Mini App получает свой собственный «тенант» (свою семью с детьми/задачами/наградами/валидаторами).

### Таблица `users`

Заменяет старую single-row `admin`. Поля: `id`, `username UNIQUE`, `password_hash`, `role IN ('admin','validator')`, `parent_id` (для валидаторов — id родителя; для админов NULL), `tg_user_id UNIQUE` (числовой Telegram id строкой; ставится при первом TG-логине), `admin_pin_hash` (bcrypt, отдельный от пароля; гейтит view→admin переключение), `family_name TEXT NULL` (отображаемое имя семьи для switcher'а у гостей).

- **Admin** — primary-роль `admin`, `parent_id IS NULL`. Создаётся автоматически в `/api/tg-auth` при первом входе с initData (username вида `tg_<tg_id>`, пароль рандомный 24 байта — пользователь его никогда не вводит, всегда логинится через Telegram). Может задать `family_name` через `POST /api/family-name` — отображается в switcher'е у гостей.
- **Validator** — primary-роль `validator`, `parent_id` указывает на админа-владельца. Создаётся админом через `POST /api/validators` (логин/пароль задаёт админ); может быть удалён или сменить пароль через тот же CRUD. **Не имеет TG-привязки** — заходит исключительно по логин/паролю.

  Страница «Валидаторы» в Настройках объединяет два источника через `GET /api/members`: локальные validator-записи (`type:'local'`) + TG-гости по invite (`type:'tg_member'`). Для TG-гостей кнопка «Удалить» вызывает `DELETE /api/members/:id` (удаляет строку из `memberships`; аккаунт не трогает). Для локальных — прежний `DELETE /api/validators/:id`.

### Telegram initData

`server.js::verifyTelegramInitData(initData, botToken)` — HMAC-SHA256 проверка по схеме [Telegram WebApp validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). Возвращает распарсенный `user`-объект или `null`. Эндпоинт `POST /api/tg-auth {initData}`:

- Если `tg_user_id` уже привязан к юзеру → логин (если в текущей сессии другой юзер — `{ ok:false, action:'conflict' }`, не перебивает).
- Если есть активная сессия и TG не привязан → биндит `tg_user_id` к текущему юзеру (`action:'bound'`).
- Иначе → автосоздаёт нового админа (`action:'registered'`) и логинит.

Фронт зовёт `/api/tg-auth` после `tg.ready()` если `tg.initData` непуст. После явного логаута флаг `sessionStorage.tg_skip=1` подавляет автологин до закрытия Mini App (или явного клика «Войти через Telegram»).

### Сессия

```js
req.session = {
  userId, username, role,        // primary identity (юзер из БД)
  parentId,                      // primary parent (для валидатора)
  contextParentId, contextRole   // АКТИВНЫЙ контекст: чьи данные видим/редактируем
}
```

`contextParentId` — id админа, чьи данные сейчас в работе. `contextRole` — роль текущего пользователя в этом контексте. Для админа в своей семье: `contextParentId = userId`, `contextRole = 'admin'`. Для админа, гостящего по invite в чужой семье: `contextParentId = parent.id`, `contextRole = 'validator'`. Хелпер `ownerOf(req)` = `req.session.contextParentId` — **именно по нему фильтруются ВСЕ запросы к данным** (`kids.owner_id`, `tasks.owner_id`, `rewards.owner_id`).

Middleware `requireAdmin` / `requireValidator` гейтят на `contextRole`, **не** на primary `role`. То есть юзер с primary-role `admin` в чужом контексте имеет валидаторские права, не админские.

### Memberships и invites (multi-family)

- `invites (id, token UNIQUE, parent_id, created_at)` — admin генерит permanent multi-use инвайт через `POST /api/invites` (URL вида `https://t.me/<bot>?start=inv_<token>`); удаляет через `DELETE /api/invites/:id`. Multi-use = один токен может redeem'ить много юзеров.
- `memberships (id, user_id, parent_id, role='validator', UNIQUE(user_id,parent_id))` — кросс-семейные членства. Только юзеры с primary-role `admin` (т.е. TG-зарегистрированные) могут иметь members в других семьях. Legacy validator (логин/пароль, без TG) залочен на свою одну семью.
- `POST /api/invites/redeem {token}` — текущий юзер становится валидатором в семье `invite.parent_id`. Идемпотентный (повторный redeem — no-op).
- `GET /api/my-families` — все контексты, в которых текущий юзер может работать. `POST /api/switch-context {parent_id}` — переключает `session.contextParentId` + `contextRole`.

### UI-режимы и переключение

`localStorage.mode`: `'view' | 'admin' | 'validator'` — клиентский флаг. Сервер не различает UI-моды; гейтинг — только по `contextRole`.

- **`view → admin`** — модалка с **PIN-кодом** родителя (`/api/verify-pin`). PIN — отдельная сущность от пароля аккаунта. Если PIN не установлен (`!state.user.has_pin`) — переключение в admin-mode мгновенное, без модалки. PIN ставится/меняется через `POST /api/admin-pin {pin, oldPin?}`, удаляется через `DELETE /api/admin-pin {pin}`. Минимум 4 цифры.
- **`view → validator`** — модалка с логин+паролем валидатора (`/api/verify-validator`). Валидатор должен принадлежать текущему контексту (`parent_id = contextParentId`).
- **Выход в `view`** — без модалки. Просто `setMode('view')`.
- **Modal toggle viewing rules.** В validator-UI-mode кнопка переключения режима скрыта вообще (нет осмысленного fallback'а — для validator-only сессии нет «своих» детей; есть только Logout). Admin-сессия в view-режиме видит «Родитель 🔓» (PIN) + «Валидатор ✅» (логин/пароль валидатора в семье текущего контекста).
- **Login форма теперь ОДНА** (без выбора роли). Роль определяется сервером по `username`. Сверху кнопка «Войти через Telegram» (если `tg.initData` есть) — для админов; внизу логин/пароль — в первую очередь для валидаторов.

### Семейный switcher

В шапке списка детей — `<select class="family-select">` (`renderFamilySwitcher`), показывается только если `state.user.can_switch_context && families.length >= 2`. Выбор → `POST /api/switch-context {parent_id}` → `loadKids()` или `loadPendingTasks()` в зависимости от роли в новом контексте. Метка опции: своя семья → `Моя семья`; чужая → `family_name || parent_username` + ` (Валидатор)`. Каждые 15 сек `startFamilyNamePolling()` тихо обновляет текст опций без полного ре-рендера (если `family_name` изменился у кого-то из семей).

### Что осталось без изменений

- Сессия — `express-session`, cookie 7 дней. `/api/login`, `/api/tg-auth`, `/api/me`, `/api/has-kids` — публичные.
- Галочки задач в view-mode по-прежнему может ставить ребёнок (см. ниже про pending). Это поведение не изменилось.

## Pending tasks (галочки на проверке)

- Колонка `tasks.pending` (0/1, миграция через `ensureColumn`). Состояние задачи теперь — комбинация `(completed, pending)`:
  - `(0, 0)` — open (не отмечено)
  - `(0, 1)` — pending (галочка поставлена, ждёт валидатора)
  - `(1, 0)` — approved (валидатор подтвердил)
  - `(1, 1)` — невозможно по инвариантам.
- `POST /api/tasks/:id/toggle` (любая авторизованная роль) — машина состояний: `open → pending`, `pending → open`, `approved → open`. **Нельзя** напрямую сделать задачу approved через toggle — нужно проходить через `pending` и approve валидатора. Это касается и админа: даже когда admin кликает галочку, она идёт в pending. Принцип: «все галочки проверяет валидатор».
- `POST /api/tasks/:id/approve` (`requireAuth`) — `pending → approved`, `completed_at = now()`.
- `POST /api/tasks/:id/reject` (`requireAuth`) — `pending → open`.
- Хотя approve/reject разрешены любой авторизованной роли, UI делает это только из validator-режима (gated паролем). Это compromise: не хранить «validator-unlocked» флаг в сессии.
- `GET /api/pending-tasks` — общий список `pending`-заданий с join'ом по `kids` (имя + фото + `kid_age` + `kid_gender`). UI группирует по `kid_id` и показывает аватар, имя, возраст/пол ребёнка над его задачами.
- **Прогресс и награда считаются только по approved.** `today_done = SUM(completed)`, `pending` не учитывается. Pending-задача в UI показывает чекбокс отмеченным (UX) + бейдж «На проверке».

## Логин

- `renderLogin()` — **одна** форма (без выбора роли). Поля `Логин` + `Пароль`. Сверху, если `tg.initData` непуст, — большая кнопка «Войти через Telegram» (запускает `tryTelegramAuth()` → `/api/tg-auth`). Роль определяет сервер по логину.
- При первом TG-логине новый админ создаётся автоматически (`action:'registered'`). Если уже есть привязка → `action:'login'`. Если в текущей сессии другой юзер → `action:'conflict'` (фронт показывает форму вручную).
- После явного `Logout` вызывается `suppressTgAutoLogin()` (`sessionStorage.tg_skip=1`) — иначе `bootToLogin()` мгновенно перелогинит обратно через TG. Кнопка «Войти через Telegram» в форме чистит этот флаг (`clearTgSuppression`), позволяя вернуться без перезапуска Mini App.
- `bootToLogin()` всё ещё дёргает `GET /api/has-kids`, но теперь это используется только для UX-надписей (нет роль-чузера, который надо пропускать).

## Просмотр по дням (календарь)

- `state.selectedDate` + `state.selectedDay = { date, tasks, reward }` — фронт оперирует выбранным днём, а не «сегодня». Сегодня используется только как опорная точка для классификации (`dayTypeOf`).
- `GET /api/kids/:id/day/:date` — задачи и награда за произвольную дату; вызывается при клике по полосе календаря.
- `GET /api/kids/:id` дополнительно возвращает `calendar: [{date, total, done, has_reward, claimed}]` — маркеры точек на полосе.
- Полоса — горизонтальная (`renderCalendarStrip`), окно 14 дней вокруг `selectedDate`. `state.calendarAnchor` сбрасывается при выборе даты, чтобы выбранный день оказывался в центре. Скролл до выбранной ячейки происходит через `requestAnimationFrame` только при смене даты (`state._calendarNeedsScroll = true` в `openKid()` и `selectDate()`), а не при каждом poll-рендере — иначе `reloadKid()` сбивал бы позицию скролла пользователя.
- **Шапка календаря** (`.cal-header`): слева — полная дата выбранного дня (`14 мая 2026 г., четверг`), справа — текущее время `ЧЧ:ММ:СС`, тикает раз в секунду через единственный глобальный `setInterval` (`startClockTicker`, идемпотентен). Время апдейтится через `document.querySelector('.cal-clock')` — пережёвывает любой re-render без утечки таймеров. Над прогресс-баром `section-title` с датой убран (дата живёт только в шапке календаря).

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

- `users (id, username UNIQUE, password_hash, role IN ('admin','validator'), parent_id → users.id ON DELETE CASCADE NULL, tg_user_id UNIQUE NULL, admin_pin_hash NULL, created_at)` — заменила старый `admin` сингл-роу. Админы: `parent_id IS NULL`. Валидаторы: `parent_id` ссылается на админа.
- `kids (id, owner_id → users.id ON DELETE CASCADE, name, age, gender, photo TEXT?, created_at)` — `photo` хранит base64 data URL (JPEG, на клиенте даунскейл до 256px, q=0.85). Индекс `idx_kids_owner` на `owner_id`.
- `tasks (id, owner_id, kid_id FK ON DELETE CASCADE, date TEXT 'YYYY-MM-DD', title, completed 0|1, pending 0|1, completed_at)` — индекс `idx_tasks_owner`.
- `rewards (id, owner_id, kid_id FK ON DELETE CASCADE, date TEXT, title, claimed 0|1, claimed_at)` — `UNIQUE(kid_id, date)`, индекс `idx_rewards_owner`.
- `invites (id, token UNIQUE, parent_id → users.id ON DELETE CASCADE, created_at)` — permanent multi-use инвайты. Хранят только токен; URL генерится на лету (`buildInviteUrl`).
- `memberships (id, user_id, parent_id, role='validator', created_at, UNIQUE(user_id, parent_id))` — кросс-семейные validator-членства для admin-юзеров.
- `task_templates (id, owner_id → users.id, title, created_at)` — предопределённые шаблоны заданий; индекс `idx_task_templates_owner`.
- `reward_templates (id, owner_id → users.id, title, created_at)` — предопределённые шаблоны наград; индекс `idx_reward_templates_owner`.

`owner_id` на каждой data-таблице — это id админа-владельца. Все запросы фильтруются через `ownerOf(req) = req.session.contextParentId`. Хелперы-гарды: `kidGuard(id, ownerId)`, `taskGuard(id, ownerId)`, `rewardGuard(id, ownerId)` — возвращают строку или null. FK с `ON DELETE CASCADE` обрабатывают каскадное удаление tasks/rewards при удалении kid'а (без ручных DELETE-цепочек).

### Лёгкие миграции

В `db.js` есть `ensureColumn(table, column, definition)` — проверяет `PRAGMA table_info` и делает `ALTER TABLE ADD COLUMN` только если колонки нет. Это позволяет добавлять nullable-колонки без потери данных.

Активные миграции: `ensureColumn('users', 'admin_pin_hash', 'TEXT')`, `ensureColumn('users', 'family_name', 'TEXT')`.

⚠️ **Старые `data.db` (до коммита «Add validators to app») несовместимы.** Схема переехала с `admin`-таблицы на `users`-таблицу + `owner_id` на data-таблицах — автомиграции нет. Пересоздать `data.db` после деплоя обновления (или написать ручной миграционный скрипт, если есть боевые данные).

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

- **Нативные диалоги (`alert`/`confirm`/`prompt`) ломают клавиатуру.** После вызова любого нативного диалога в Telegram Mini App последующие поля ввода перестают принимать фокус до перезапуска страницы (баг на уровне Telegram WebView). **Не использовать** `window.confirm()` для подтверждений. Вместо этого — inline двухшаговые кнопки (показать «Подтвердить», дождаться второго клика, скрыть).

## Тестирование и smoke-test

⚠️ Дефолтных кредов больше нет (`admin/admin` и `validator/12345` удалены). Чтобы получить аккаунт для smoke-теста:

1. Открыть Mini App в Telegram → авторегистрация админа через `/api/tg-auth`. Дальше cookie сессии можно скопировать в браузер.
2. Или вручную в node-консоли вставить юзера в `users` (с bcrypt-хэшем) — например, для интеграционных тестов.
3. Валидатор: создаётся в admin-настройках через UI → потом логин/пароль работают через `/api/login`.

После того как юзер есть:

```bash
curl -c c.txt -X POST -H "Content-Type: application/json" \
  -d '{"username":"validator_login","password":"..."}' http://localhost:3000/api/login
curl -b c.txt http://localhost:3000/api/me
curl -b c.txt http://localhost:3000/api/kids
```

Полный E2E лучше прогонять через UI в обычном браузере на `http://localhost:3000` (туннель не обязателен), но без `tg.initData` кнопка «Войти через Telegram» не появится — для тестов TG-flow нужен Telegram-клиент. Telegram-клиент тестировать **последним** — кеш съест мозги.

## Мелочи UI

- **Кнопка «Добавить ребёнка» свёрнута в admin-режиме.** На странице списка детей форма не показывается сверху сразу, есть только центрированная кнопка `Добавить ребёнка` (`state.showAddKidForm`). По клику разворачивается полная форма с «Отмена» и «Добавить». Флаг сбрасывается при выходе из admin-режима (`setMode`).
- **Inline-редактирование профиля.** `state.editKidId` сбрасывается в `setMode` при выходе из admin-режима — иначе при переключении в view-режим оставалась бы открытая форма редактирования.
- **Mode toggle в shell'е страницы.** `renderModeToggle()`: в view-режиме admin-сессия видит обе кнопки — только иконки «🔓» и «✅» (без текста, `font-size:20px`). В admin UI-режиме — одна кнопка «Просмотр 👀». В validator UI-режиме переключатель **скрыт полностью** (некуда возвращаться — есть только Logout).
- **PIN ставится в Настройках** (admin-mode → Settings). До установки PIN'а переключение `view → admin` мгновенное (без модалки) — это сделано осознанно, чтобы свежий пользователь сразу мог работать. Как только PIN установлен — модалка с PIN-полем (`inputmode: 'numeric'`).
- **Family switcher** (`<select class="family-select">`) — рядом с заголовком «Дети» в шапке, показывается только при `can_switch_context`. Изменение → `POST /api/switch-context` → перезагрузка данных.
- **Страница Настроек** разбита на четыре вкладки: **Общее** / **PIN** / **Приглашения** / **Валидаторы**. Текущая вкладка хранится в `state.settingsTab` (default: `'general'`). CSS-классы: `.settings-tabs`, `.settings-tab`, `.settings-tab.active`. Клик на вкладку «Валидаторы» всегда делает свежий `loadValidators()` перед рендером — список не устаревает после того, как кто-то принял инвайт.
- **«Очистить базу данных»** — кнопка в вкладке **Общее** настроек (только admin). Вызывает `POST /api/clear-database`, который удаляет все данные семьи (дети каскадом → задачи/награды, шаблоны, валидаторы, инвайты, memberships), сбрасывает `family_name = NULL`, разрушает сессию. Клиент после ответа делает `window.location.reload()` → TG re-auth → экран setup-family (с `family_name=null`). Кнопка использует **двухшаговое inline-подтверждение** (кнопка «Подтвердить» появляется рядом, потом исчезает) вместо `window.confirm()` — нативные диалоги в Telegram Mini App вызывают баг заморозки клавиатуры: после `alert()/confirm()` поле ввода перестаёт принимать фокус до перезагрузки страницы.
- **Фоновый поллинг** (`startPolling` / `stopPolling`): автоматически запускается при переходе на страницу `kid` (вызывает `reloadKid()` каждые 5 сек) и на страницу `pending` (вызывает `loadPendingTasks()` + `render()`). Останавливается в `go()` при любой навигации. Пропускает тик, пока вкладка скрыта (`document.visibilityState === 'hidden'`) или пока сфокусирован `INPUT`/`TEXTAREA` (чтобы не сбивать ввод). Делает немедленный запрос при возврате на вкладку (`visibilitychange`, `once`). Флаг `_polling` защищает от параллельных запросов.
- **`reloadKid()`** — патчит только динамические части страницы (`#kid-dyn-inner` и `#kid-dyn-outer` через `replaceWith`), не трогая `.cal-strip` — позиция скролла пользователя сохраняется. Полный `render()` вызывается только как fallback, если DOM-структура сломана.
- **Boot flash fix**: `state.route` инициализируется как `null` (не `'login'`). `render()` делает ранний выход (`if (!state.route) return`), пока не вызван первый `go()`. Это устраняет мигание формы логина при TG-автологине: `setMode('view')` → `render()` внутри `routeForCurrentContext()` больше не рисует форму в момент ожидания данных.
- **Шаблоны заданий и наград** (`task_templates` / `reward_templates`): список заранее заготовленных названий, принадлежащих семье. Управляются в Настройках → вкладка «Дети» → подвкладки **Задания** / **Награды** (`state.kidsListTab`). Единый рендерер `renderTemplatesTab({ sectionTitle, addTitle, emptyMsg, addPlaceholder, templates, apiBase, loadFn, tplType })` с inline-редактированием (✏️/🗑) и оптимистичными перезагрузками. Шаблоны предзагружаются при открытии страницы ребёнка (`openKid()`) через `Promise.all([loadTaskTemplates(), loadRewardTemplates()])`.
- **`comboInput(placeholder, suggestions)`** — кастомный combo-box без зависимостей: `div.combo-wrapper` с `input` + `div.combo-dropdown`. На `focus` показывает все подсказки, при вводе фильтрует по подстроке (case-insensitive). Клик по пункту через `mousedown` (до `blur`) вставляет значение. `wrapper.value` — геттер/сеттер, прокси к `input.value`, — позволяет читать/писать значение не зная о внутренней структуре. Заменяет нативный `<datalist>` в полях добавления/редактирования задания и награды на странице ребёнка. Стили: `.combo-wrapper`, `.combo-dropdown`, `.combo-item` в `style.css`.

## Мультиязычность (i18n)

Все строки UI переведены на RU/EN. Логика живёт в `public/i18n.js` (загружается перед `app.js`).

### Ключевые функции

| Функция | Что делает |
|---|---|
| `t(key)` | Вернуть строку для текущего языка из `TRANSLATIONS`. Если ключ отсутствует — возвращает сам `key` (безопасный fallback). |
| `getLang()` | Текущий язык: `'ru'` или `'en'`. |
| `setLang(lang)` | Установить язык, сохранить в `localStorage.lang`. |
| `tGender(g)` | Обёртка в `app.js`: `g === 'м'` → `t('common.boy')`, иначе → `t('common.girl')`. Внутренние коды пола `'м'`/`'ж'` не менялись — только отображение через `t()`. |

### Определение языка при старте

IIFE `detectLang()` запускается в начале `app.js`, **до** `tg.ready()`:

```
localStorage.lang ('ru'|'en') → tg.initDataUnsafe.user.language_code → 'en' по умолчанию
```

- `localStorage.lang` — явный выбор пользователя, имеет наивысший приоритет.
- `language_code` из Telegram отражает язык **аккаунта** Telegram (Настройки → Язык), а не UI-язык приложения или системы устройства. Может удивить: у пользователя русскоязычный аккаунт, но английский интерфейс телефона — приложение запустится по-русски.
- Если `language_code` не начинается с `'ru'` — приложение остаётся на английском (дефолт `i18n.js`).

### Переключатель языка в UI

В «Настройках» → вкладка **Общее** рендерится `langCard` (строки 1695–1719 `app.js`): карточка с двумя кнопками **Русский** / **English** в стиле `.settings-tab`/`.settings-tab.active`. Клик → `setLang(...)` → `render()`. Сохраняется в `localStorage.lang`.

### Что не переводилось

- Внутренние коды пола `'м'`/`'ж'` — БД-идентификаторы, остались как есть.
- Серверные ошибки в JSON (`error: '...'`) возвращаются на английском; `app.js` мэппит часть из них в `t()`-строки через словарь `errorMsgs` (строка ~1558).

## Полный список API-эндпоинтов (`server.js`)

### Публичные (без requireAuth)
| Метод | Путь | Что делает |
|---|---|---|
| `POST` | `/api/login` | Логин по username/password → сессия |
| `POST` | `/api/tg-auth` | TG-авторизация по `initData`; создаёт нового админа если нет |
| `GET` | `/api/has-kids` | `{ has: bool }` — для UX на экране логина |
| `POST` | `/api/logout` | Удаляет сессию |
| `GET` | `/api/me` | `{ authenticated, username, role, tg_linked, has_pin, family_name, context, can_switch_context }` |

### requireAuth (любая авторизованная роль)
| Метод | Путь | Что делает |
|---|---|---|
| `POST` | `/api/family-name` | `{ name }` → устанавливает `users.family_name` |
| `POST` | `/api/verify-admin` | `{ password }` → проверяет пароль текущего юзера (для unlock reward) |
| `POST` | `/api/verify-validator` | `{ username, password }` → проверяет валидатора текущего контекста |
| `POST` | `/api/change-password` | `{ oldPassword, newPassword }` |
| `POST` | `/api/invites/redeem` | `{ token }` → вступить в семью по инвайту |
| `GET` | `/api/my-families` | Список контекстов для switcher'а |
| `POST` | `/api/switch-context` | `{ parent_id }` → переключить контекст сессии |
| `POST` | `/api/tasks/:id/toggle` | `open→pending`, `pending→open`, `approved→open` |
| `POST` | `/api/tasks/:id/approve` | `pending→approved`, ставит `completed_at` |
| `POST` | `/api/tasks/:id/reject` | `pending→open` |
| `GET` | `/api/pending-tasks` | Все pending задачи текущего контекста (с kid-инфо) |

### requireAdmin (contextRole = 'admin')
| Метод | Путь | Что делает |
|---|---|---|
| `POST` | `/api/admin-pin` | `{ pin, oldPin? }` → поставить/сменить PIN |
| `DELETE` | `/api/admin-pin` | `{ pin }` → удалить PIN |
| `POST` | `/api/verify-pin` | `{ pin }` → проверить PIN (view→admin) |
| `GET` | `/api/invites` | Список инвайтов семьи |
| `POST` | `/api/invites` | Создать инвайт → `{ id, token, url }` |
| `DELETE` | `/api/invites/:id` | Удалить инвайт |
| `GET` | `/api/validators` | Legacy-валидаторы (logин/пароль) |
| `POST` | `/api/validators` | `{ username, password }` → создать валидатора |
| `DELETE` | `/api/validators/:id` | Удалить валидатора |
| `POST` | `/api/validators/:id/password` | `{ password }` → сменить пароль валидатора |
| `GET` | `/api/members` | Объединённый список: `[{type:'local'|'tg_member', id, username, ...}]` |
| `DELETE` | `/api/members/:id` | Удалить TG-гостя (membership) |
| `GET` | `/api/kids` | Список детей семьи |
| `POST` | `/api/kids` | `{ name, age, gender, photo? }` → создать ребёнка |
| `PUT` | `/api/kids/:id` | `{ name, age, gender, photo? }` → обновить профиль |
| `DELETE` | `/api/kids/:id` | Удалить ребёнка (каскад tasks/rewards) |
| `GET` | `/api/kids/:id` | `{ kid, tasks, reward, calendar }` за сегодня |
| `GET` | `/api/kids/:id/day/:date` | `{ tasks, reward }` за произвольную дату `YYYY-MM-DD` |
| `POST` | `/api/kids/:id/tasks` | `{ title, date? }` → добавить задачу |
| `DELETE` | `/api/tasks/:id` | Удалить задачу |
| `GET` | `/api/task-templates` | Шаблоны заданий |
| `POST` | `/api/task-templates` | `{ title }` → создать шаблон |
| `PUT` | `/api/task-templates/:id` | `{ title }` → переименовать |
| `DELETE` | `/api/task-templates/:id` | Удалить шаблон |
| `GET` | `/api/reward-templates` | Шаблоны наград |
| `POST` | `/api/reward-templates` | `{ title }` → создать шаблон |
| `PUT` | `/api/reward-templates/:id` | `{ title }` → переименовать |
| `DELETE` | `/api/reward-templates/:id` | Удалить шаблон |
| `POST` | `/api/kids/:id/reward` | `{ title, date? }` → upsert награды; сбрасывает `claimed=0` при смене названия |
| `POST` | `/api/rewards/:id/claim` | → `claimed=1`, `claimed_at=now()` |
| `POST` | `/api/clear-database` | Полная очистка данных семьи + разрушает сессию |

### Хелперы в `server.js`
| Функция | Что делает |
|---|---|
| `requireAuth(req,res,next)` | Проверяет `req.session.userId` |
| `requireAdmin(req,res,next)` | Проверяет `req.session.contextRole === 'admin'` |
| `requireValidator(req,res,next)` | Проверяет `req.session.contextRole === 'validator'` |
| `ownerOf(req)` | `req.session.contextParentId` — id-владельца для фильтрации data |
| `loginSession(req, user)` | Пишет userId/username/role/parentId/contextParentId/contextRole в сессию |
| `genToken(bytes=18)` | Случайный hex-токен для инвайтов |
| `verifyTelegramInitData(initData, token)` | HMAC-SHA256 проверка; возвращает `user`-объект или `null` |
| `getKidProfile(kidId, ownerId)` | Полный профиль ребёнка с задачами+наградой+calendar (14 дней) |
| `kidGuard(kidId, ownerId)` | Возвращает kid-строку или `null` если чужой |
| `taskGuard(taskId, ownerId)` | Возвращает task-строку или `null` |
| `rewardGuard(rewardId, ownerId)` | Возвращает reward-строку или `null` |
| `findUserByUsername(username)` | SELECT из `users` |
| `buildInviteUrl(token)` | `https://t.me/<bot>?start=inv_<token>` |
| `today()` | `new Date().toISOString().slice(0,10)` → `YYYY-MM-DD` |

## `state` объект (public/app.js)

```js
const state = {
  route: null,                  // null | 'login'|'setup-family'|'kids'|'kid'|'settings'|'pending'
  user: null,                   // { username, role, tg_linked, has_pin, family_name, context, can_switch_context }
  kids: [],                     // массив { id, name, age, gender, photo, owner_id }
  currentKid: null,             // полный профиль открытого ребёнка (из getKidProfile)
  selectedDate: null,           // 'YYYY-MM-DD'
  selectedDay: null,            // { date, tasks, reward }
  pendingTasks: [],             // задачи на проверке (validator view)
  validators: [],               // legacy-валидаторы семьи
  taskTemplates: [],
  rewardTemplates: [],
  editingTemplateId: null,
  editingTemplateType: null,    // 'task' | 'reward'
  kidsListTab: 'kids',          // 'kids' | 'tasks' | 'rewards'
  settingsTab: 'general',       // 'general' | 'pin' | 'invites' | 'validators'
  invites: [],                  // список инвайтов (загружается при открытии вкладки)
  families: [],                 // контексты для family switcher
  error: null,
  mode: localStorage.mode,      // 'view' | 'admin' | 'validator'
  modeAuthTarget: 'admin',
  // Вспомогательные
  showAddKidForm: false,
  editKidId: null,
  calendarAnchor: null,         // дата левого края календаря (авто-центрирование)
  _calendarNeedsScroll: false,  // триггер scroll-to-selected
  rewardUnlocked: false,        // пароль к награде введён в этой сессии
  setupFamilyError: null,
  _polling: false,              // guard от параллельных poll-запросов
}
```

`state.user.context` = `{ parent_id, parent_username, parent_family_name, role, is_self }` — активный контекст из `/api/me`.

## Ключевые функции фронта (public/app.js)

### Навигация и жизненный цикл
| Функция | Что делает |
|---|---|
| `go(route, extra)` | Устанавливает `state.route`, `stopPolling()`, `render()` |
| `render()` | Главный диспетчер: по `state.route` рисует нужный экран |
| `setMode(m)` | Меняет `state.mode`, сбрасывает `editKidId`, `showAddKidForm` |
| `bootToLogin()` | `go('login')` |
| `refreshUser()` | `GET /api/me` → обновляет `state.user` и `state.families` |
| `routeForCurrentContext()` | По `context.role`: validator → `pending`, admin → `kids` |
| `enterAfterLogin()` | `refreshUser` → редим инвайт → `routeForCurrentContext` |
| `switchFamilyContext(parentId)` | `switch-context` → `refreshUser` → `routeForCurrentContext` |

### Данные
| Функция | Что делает |
|---|---|
| `api(path, options)` | fetch-обёртка: JSON body, авто-throw на !ok |
| `loadKids()` | `GET /api/kids` → `state.kids` |
| `loadTaskTemplates()` | `GET /api/task-templates` → `state.taskTemplates` |
| `loadRewardTemplates()` | `GET /api/reward-templates` → `state.rewardTemplates` |
| `loadPendingTasks()` | `GET /api/pending-tasks` → `state.pendingTasks` |
| `loadValidators()` | `GET /api/members` → `state.validators` |
| `loadInvites()` | `GET /api/invites` → `state.invites` |
| `openKid(id)` | `GET /api/kids/:id` → `state.currentKid`, сбрасывает calendar/reward |
| `loadSelectedDay()` | `GET /api/kids/:id/day/:date` → `state.selectedDay` |
| `selectDate(date)` | Меняет `state.selectedDate`, вызывает `loadSelectedDay` |
| `reloadKid()` | Тихий poll: обновляет только `#kid-dyn-inner` и `#kid-dyn-outer` |

### Рендер
| Функция | Что делает |
|---|---|
| `renderLogin()` | Форма логина + кнопка TG |
| `renderSetupFamily()` | Экран ввода имени семьи (первый запуск) |
| `renderKidsList()` | Список детей + вкладки kids/tasks/rewards |
| `renderKidRow(k)` | Строка-карточка ребёнка |
| `renderKid()` | Страница ребёнка: шапка + calendar + задачи + награда |
| `renderCalendarStrip(kid, todayDate)` | Горизонтальная полоса 14 дней |
| `renderRewardSection(kid, day, allDone, admin, dayType)` | Секция награды |
| `renderKidDynInner()` | Динамическая часть задач (для `reloadKid`) |
| `renderKidDynOuter()` | Динамическая часть вокруг задач |
| `renderPending()` | Страница валидатора (pending tasks) |
| `renderSettings()` | Страница настроек (4 вкладки) |
| `renderModeToggle()` | Кнопки 🔓/✅/«Просмотр» |
| `renderModeAuthModal()` | Модалка PIN или логин/пароль валидатора |
| `renderFamilySwitcher()` | `<select>` переключения контекста |
| `renderGeneralBlock()` | Вкладка «Общее» (язык, family name, clear-db) |
| `renderPinBlock()` | Вкладка «PIN» |
| `renderInvitesBlock()` | Вкладка «Приглашения» |
| `renderValidatorsListBlock()` | Вкладка «Валидаторы» |
| `renderTemplatesTab(opts)` | Универсальный рендер шаблонов (задания/награды) |
| `renderAvatar(k, size)` | img или placeholder-div с первой буквой имени |

### Утилиты
| Функция | Что делает |
|---|---|
| `h(tag, attrs, ...children)` | Hyperscript-like createElement |
| `todayStr()` | `YYYY-MM-DD` сегодня |
| `shiftDate(dateStr, days)` | Прибавить/убрать дни к дате |
| `dayTypeOf(dateStr, todayDateStr)` | `'past'|'today'|'future'` |
| `formatClock(d)` | `HH:MM:SS` |
| `startClockTicker()` | Глобальный тик часов (идемпотентен) |
| `startPolling(fn, ms)` / `stopPolling()` | Auto-refresh страниц |
| `startFamilyNamePolling()` / `stopFamilyNamePolling()` | Тихое обновление меток switcher |
| `comboInput(placeholder, suggestions)` | Кастомный combo-box; `.value` — прокси к input |
| `readPhotoAsDataURL(file, maxSize)` | Canvas-ресайз до 256px, base64 JPEG |
| `tryTelegramAuth()` | `POST /api/tg-auth` с `tgInitData` |
| `suppressTgAutoLogin()` | `sessionStorage.tg_skip=1` |
| `tgAutoLoginSuppressed()` | Проверка флага |
| `clearTgSuppression()` | Снять флаг |
| `showError(err)` | `state.error = err; render()` |
| `isAdmin()` / `isValidator()` | `state.mode === 'admin'/'validator'` |
| `sessionIsValidator()` | `state.user.role === 'validator'` (primary role) |
| `tGender(g)` | `'м'→t('common.boy')`, иначе `t('common.girl')` |
| `readInviteFromUrl()` | Читает `?invite=...` из `window.location` |

## Соглашения по коду

- Без сборщиков и фреймворков на фронте: hyperscript-like `h(tag, attrs, ...children)` + ручной `render()` после изменения `state`.
- Не добавляй React/Vue/Webpack без явной просьбы.
- Маленькие изменения — точечные правки `edit`, не переписывай файлы целиком.
- Telegram `initData` валидируется через HMAC (`verifyTelegramInitData`). Это база multi-tenancy — не выпиливай.
- В CSS поддерживаем переменные темы Telegram (`--tg-theme-*`) с fallback'ами.

## Что точно не делать

- Не править `.env` — реальный `TELEGRAM_TOKEN`.
- Не пушить `tools/cloudflared.exe`, `cookies.txt` (в `.gitignore`).
- Не вешать тяжёлые зависимости ради удобства — это прототип.
- Не выпиливать `Cache-Control: no-store` и cache-buster без явной причины — без них Telegram будет показывать вчерашний фронт.
