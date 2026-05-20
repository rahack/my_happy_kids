# Skill: run-app

Запускает сервер `my_happy_kids` локально с туннелем (cloudflared → pinggy).
Используй этот скил когда пользователь просит «запусти», «проверь», «запусти приложение», «открой через туннель».

## Разрешения

```yaml
tools:
  exec: allow
```

## Шаги

### 1. Убить старый процесс на порту 3000

```powershell
$pid3000 = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($pid3000) { taskkill /F /PID $pid3000 /T; Start-Sleep 2 }
```

Если порт свободен — просто пропустить.

### 2. Запустить сервер в фоне

```bash
npm start
```

Запускать с `run_in_background: true` и сохранить `shell_id`.

### 3. Дождаться URL туннеля

Читать вывод (`get_output`) каждые 3–5 секунд.

Признак успешного старта cloudflared:
```
Tunnel URL: https://....trycloudflare.com
```
или pinggy:
```
Tunnel URL: https://....a.pinggy.io
```

Ждать не более 60 секунд суммарно. Если туннель не поднялся — сообщить об ошибке и показать хвост лога.

### 4. Smoke-test

После получения URL выполнить:
```bash
curl -s <URL>/api/has-kids
```
Ожидаемый ответ: `{"has":false}` или `{"has":true}` — любой JSON без HTML.
Если ответ содержит HTML или curl упал — сообщить пользователю.

### 5. Отчёт

Сообщить пользователю:
- Публичный URL туннеля
- Результат smoke-test (`/api/has-kids`)
- Можно открывать в Telegram

## Особенности Windows

- `data.db` блокируется пока процесс жив — не удалять до остановки.
- Туннель живёт пока жив процесс. После `kill_shell` URL перестанет работать.
- curl в MINGW может ломать кириллицу в теле запроса — для smoke-test это не важно (только читаем).
- Логи npm/node могут содержать `>>>` (pinggy) — это нормально, не признак ошибки.
