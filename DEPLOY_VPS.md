# Деплой Happy Kids на VPS с duckdns

Предполагаем: Ubuntu 22.04/24.04, root или sudo, чистый сервер. Telegram Mini App требует HTTPS — будем выдавать сертификат через Let's Encrypt автоматически (Caddy).

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

# Обновления и базовые пакеты
apt update && apt upgrade -y
apt install -y curl git ufw build-essential python3

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
git clone <URL-вашего-репозитория> happy-kids
cd happy-kids
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

## 6. HTTPS через Caddy (автоматический сертификат)

Caddy сам получит сертификат от Let's Encrypt по вашему домену.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Caddyfile:

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddy
happy.duckdns.org {
    reverse_proxy 127.0.0.1:3000
    encode gzip
}
```

Применить:

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

Откройте `https://happy.duckdns.org` в браузере — должна открыться форма логина приложения (даже если Node-приложение ещё не запущено через systemd, оно ведь у нас не запущено фоном; запустим следующим шагом). Сертификат Caddy получит автоматически за 10–30 секунд при первом обращении.

## 7. systemd-сервис для приложения

```bash
sudo nano /etc/systemd/system/happy-kids.service
```

```ini
[Unit]
Description=Happy Kids Telegram Mini App
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/happy-kids
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
sudo systemctl enable --now happy-kids
sudo systemctl status happy-kids
journalctl -u happy-kids -f         # смотреть логи в реальном времени
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
3. На форме логина — выбор роли:
   - **«Родитель 🔓»** → `admin` / `admin` → сразу зайдите в «Настройки» и смените пароль.
   - **«Валидатор ✅»** → `validator` / `12345` (захардкожен в `server.js`; чтобы поменять — правьте `VALIDATOR_USER` / `VALIDATOR_PASS` в коде и делайте `sudo systemctl restart happy-kids`).

Если кнопка показывает старый URL — закройте/откройте чат с ботом, или через меню Mini App → Reload Page (Telegram кеширует агрессивно).

## 9. Обновление кода

```bash
ssh deploy@<IP>
cd ~/happy-kids
git pull
npm install --omit=dev       # если поменялись зависимости
sudo systemctl restart happy-kids
journalctl -u happy-kids -n 50
```

## 10. Бэкап и обслуживание

- БД лежит в `~/happy-kids/data.db` + WAL-файлы. Простейший бэкап (раз в сутки):
  ```bash
  mkdir -p ~/backups
  (crontab -l 2>/dev/null; echo "0 3 * * * cp ~/happy-kids/data.db ~/backups/data-\$(date +\%F).db") | crontab -
  ```
- Логи: `journalctl -u happy-kids --since "1 hour ago"`.
- Сертификат Caddy продляет сам, ничего делать не нужно.
- Файрволл: `sudo ufw status` (должны быть SSH/80/443 — больше ничего).

## Частые проблемы

| Симптом | Где смотреть |
|---|---|
| `502 Bad Gateway` от Caddy | приложение упало → `journalctl -u happy-kids -n 100` |
| `bot.launch failed` / `401 Unauthorized` | неправильный `TELEGRAM_TOKEN` в `.env` |
| Caddy не получает сертификат | домен не резолвится в IP сервера → `dig +short happy.duckdns.org`; либо закрыт порт 80/443 |
| Mini App открывается на старом URL | не сбросился Menu Button — рестартните `sudo systemctl restart happy-kids` (он переустановит кнопку с актуальным URL) или попросите Telegram-клиент перечитать (Reload Page) |
| `better-sqlite3` упал на `npm install` | нет `build-essential` или `python3`; либо несовместимая версия Node — используйте Node 18+ LTS |
