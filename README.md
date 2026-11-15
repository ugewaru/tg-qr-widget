# Telegram iOS QR Widget (@heleNyssss × kick.com/helin139ban) — GitHub Pages

Готовый статический комплект виджета для **GitHub Pages** (`https://<твой-ник>.github.io/<репозиторий>/`).
Показывает анимированный iOS QR-код и тег `@heleNyssss` строго по центру экрана с минимальной задержкой после команд `!qr`, `!qr 1`..`!qr 60`, `!qr off` и нажатий в док-панели.

## Как запустить за 2 минуты

1. Создай **Public** репозиторий на GitHub (например, `tg-qr-widget`).
2. Загрузи в корень репозитория **все** файлы из этой папки `github-pages/`, обязательно включая:
   - `.nojekyll`
   - `.github/workflows/update-tg.yml`
   - `index.html`
   - `panel/index.html`
   - `assets/` (`qr-aura.webm`, `avatar.jpg`)
   - `data/tg.json`
   - `scripts/update-tg-feed.mjs`
3. В репозитории открой **Settings → Pages → Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `/ (root)` → **Save**.

## Ссылки для OBS Studio

- **Основной виджет по командам чата Kick (`!qr`, `!qr 1`..`!qr 60`, `!qr off`)**:
  `https://<твой-ник>.github.io/<репозиторий>/?forceMotion=1`
- **Точно по центру кадра по X и Y**:
  `https://<твой-ник>.github.io/<репозиторий>/?forceMotion=1&pos=center`
- **Показ сразу при старте (для проверки)**:
  `https://<твой-ник>.github.io/<репозиторий>/?forceMotion=1&show=1`
- **Док-панель управления внутри OBS**:
  `https://<твой-ник>.github.io/<репозиторий>/panel/`

> Аватарка `@heleNyssss` автоматически обновляется бесплатным GitHub Action (`.github/workflows/update-tg.yml`), а команды панели доходят до оверлея через instant BroadcastChannel + WebSocket-ретранслятор (можно отключить параметром `&relay=0`).
