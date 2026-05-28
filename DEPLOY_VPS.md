# Деплой Happy Kids на VPS с duckdns

Предполагаем: Ubuntu 22.04/24.04, root или sudo, чистый сервер.

## 0. Что понадобится

- VPS с публичным IP (любой провайдер: Hetzner, Timeweb, DigitalOcean, Beget).
- Открытые порты **80** и **443** (HTTP + HTTPS) — потребуются для выпуска сертификата и работы Mini App.
- Аккаунт на [duckdns.org](https://www.duckdns.org/), создан поддомен, есть **token** (длинная строка в личном кабинете).
- Telegram Bot Token (тот же, что в локальном `.env`).

В инструкции я буду использовать имена-плейсхолдеры:
- `happy.duckdns.org` → ваш поддомен
- `dd-xxxx-yyyy-zzz` → токен duckdns
- `123:ABC...` → токен бота
- `deploy` → юзер для приложения (не root)

## 1. Базовая настройка сервера

```bash
ssh root@<IP>

# Обновления системы
apt update && apt upgrade -y
# Устновка базовых пакетов
# curl - Утилита для HTTP/HTTPS запросов.
# git - Система контроля версий.
# ca-certificates - Корневые SSL сертификаты.
# ufw - Простой firewall для Ubuntu
# build-essential - Набор инструментов для компиляции программ.
# python3 -Python 3.
apt install -y curl git ca-certificates ufw build-essential python3

# Юзер под приложение
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

# Файрволл: разрешаем SSH + 80 + 443
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## 2. duckdns: указать IP и автообновление

Сначала ткнём IP вручную (от имени `deploy`):

```bash
su - deploy
curl "https://www.duckdns.org/update?domains=happy&token=dd-xxxx-yyyy-zzz&ip="
# Ответ: OK
```

`ip=` пустым — duckdns подставит ваш текущий публичный IP сам. Проверьте резолв: `dig +short happy.duckdns.org` → должен показать IP сервера.

Чтобы IP не «отвалился» при смене провайдером — добавим cron, обновляющий запись каждые 5 минут:

```bash
mkdir -p ~/duckdns
cat > ~/duckdns/update.sh <<'EOF'
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=happy&token=dd-xxxx-yyyy-zzz&ip=" \
  | curl -k -o ~/duckdns/duck.log -K -
EOF
chmod 700 ~/duckdns/update.sh

(crontab -l 2>/dev/null; echo "*/5 * * * * ~/duckdns/update.sh >/dev/null 2>&1") | crontab -
```

## 3. Установка Node.js

LTS-версия через NodeSource:

```bash
sudo bash -c 'curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -'
sudo apt install -y nodejs
node -v   # должно быть >= 18
```

## 4. Получить код и поставить зависимости

```bash
cd ~
git clone <URL-вашего-репозитория> my-happy-kids
cd my-happy-kids
npm install --omit=dev
```

`better-sqlite3` собирается из исходников — на этом шаге увидите gcc-вывод. Если падает «python not found» / «make not found» — вернитесь к шагу 1 и доустановите `build-essential python3`.

> `tools/cloudflared.exe` — это Windows-бинарь, на сервере он не нужен и не используется. Туннель мы заменим на свой домен.

## 5. `.env` для продакшена

```bash
nano .env
```

```env
TELEGRAM_TOKEN=123:ABC...
SESSION_SECRET=сюда-длинную-случайную-строку-например-32-байта
PORT=3000
WEBAPP_URL=https://happy.duckdns.org
NO_TUNNEL=1
```

Ключевое:
- **`WEBAPP_URL`** — фиксированный публичный URL. С ним `server.js` не пытается запускать `cloudflared`.
- **`NO_TUNNEL=1`** — на всякий случай явно отключает автотуннель.
- **`SESSION_SECRET`** — сгенерировать: `openssl rand -hex 32`.
- **`PORT=3000`** — сервер слушает локально на 3000, наружу его проксирует Caddy.

Проверим, что приложение поднимается:

```bash
node server.js
# Ожидаем: [server] running at http://localhost:3000
# [tunnel] using WEBAPP_URL from env: https://happy.duckdns.org
# [bot] menu button set → https://happy.duckdns.org?v=...
# [bot] @your_bot ready
```

Если ок — `Ctrl+C` и идём дальше.

## 6. nginx как реверс-прокси

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/lang-webapp
```

Подставь свой домен вместо `bot.example.com`:

```nginx
server {
    listen 80;
    server_name bot.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lang-webapp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 7. systemd-сервис для приложения

```bash
sudo nano /etc/systemd/system/my-happy-kids.service
```

```ini
[Unit]
Description=Happy Kids Telegram Mini App
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/my-happy-kids
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
# .env читается приложением через dotenv — отдельно прописывать переменные не нужно
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now my-happy-kids
sudo systemctl status my-happy-kids
journalctl -u my-happy-kids -f         # смотреть логи в реальном времени
```

Ожидаемые строки в логах:
```
[server] running at http://localhost:3000
[tunnel] using WEBAPP_URL from env: https://happy.duckdns.org
[bot] menu button set → https://happy.duckdns.org?v=...
[bot] @your_bot ready
```

## 8. Проверка в Telegram

1. В Telegram открыть чат с ботом.
2. Слева от поля ввода появится кнопка-меню — нажать → Mini App откроется на `happy.duckdns.org`.
3. На форме логина:
   - **Родитель:** нажать **«Войти через Telegram»** — сервер автоматически создаст под этого Telegram-юзера аккаунт-«семью». В Settings внутри Mini App рекомендуем сразу задать PIN-код родителя (4+ цифр) — он будет нужен для переключения из «Просмотра» в «Родителя».
   - **Валидатор:** заводится администратором в его настройках (раздел «Валидаторы» — логин/пароль). После этого валидатор заходит обычной формой логин/пароль.
   - **Гостевой валидатор:** Родитель может сгенерировать invite-ссылку в «Настройках» (вида `https://t.me/<bot>?start=inv_<token>`) и поделиться. Принявший становится валидатором в семье через `memberships`. Гостем может быть только пользователь, у которого есть собственный TG-аккаунт в системе (т.е. кто хоть раз входил через Telegram сам).

Если кнопка показывает старый URL — закройте/откройте чат с ботом, или через меню Mini App → Reload Page (Telegram кеширует агрессивно).

> ⚠️ **Апгрейд со старой схемы.** Если на сервере уже лежит `data.db` от версии до коммита «Add validators to app» (там single-row таблица `admin`), он несовместим с новой схемой (`users` + `owner_id`). Перед `systemctl restart` либо удалите старый `data.db` (потеря данных), либо подготовьте миграционный скрипт вручную (вставить admin'а в `users`, проставить `owner_id = users.id` на kids/tasks/rewards). Авто-миграции на этот переход нет.

## 9. Обновление кода

```bash
ssh deploy@<IP>
cd ~/my-happy-kids
git pull
npm install --omit=dev       # если поменялись зависимости
sudo systemctl restart my-happy-kids
journalctl -u my-happy-kids -n 50
```

## 10. Бэкап и обслуживание

- БД лежит в `~/my-happy-kids/data.db` + WAL-файлы. Простейший бэкап (раз в сутки):
  ```bash
  mkdir -p ~/backups
  (crontab -l 2>/dev/null; echo "0 3 * * * cp ~/my-happy-kids/data.db ~/backups/data-\$(date +\%F).db") | crontab -
  ```
- Логи: `journalctl -u my-happy-kids --since "1 hour ago"`.
- Файрволл: `sudo ufw status` (должны быть SSH/80/443 — больше ничего).

## Частые проблемы

| Симптом | Где смотреть |
|---|---|
| `502 Bad Gateway` от Caddy | приложение упало → `journalctl -u my-happy-kids -n 100` |
| `bot.launch failed` / `401 Unauthorized` | неправильный `TELEGRAM_TOKEN` в `.env` |
| Caddy не получает сертификат | домен не резолвится в IP сервера → `dig +short happy.duckdns.org`; либо закрыт порт 80/443 |
| Mini App открывается на старом URL | не сбросился Menu Button — рестартните `sudo systemctl restart my-happy-kids` (он переустановит кнопку с актуальным URL) или попросите Telegram-клиент перечитать (Reload Page) |
| `better-sqlite3` упал на `npm install` | нет `build-essential` или `python3`; либо несовместимая версия Node — используйте Node 18+ LTS |
