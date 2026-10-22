# ХОД · 0.18

Настольные игры в браузере: локально с ботами, передача устройства и сетевая комната WebRTC. Приложение **0.18.5** и независимая коллекция **0.7.1** включают 12 игр. [Сайт](https://playroom-hod-test.pages.dev) · [релиз приложения](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.1) · [коллекция](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.7.1).

## Начать играть

- `playroom-all-games.html` — автономный файл со всеми играми.
- `playroom.html` — оболочка для выбранных паков.
- `playroom-pwa.zip` — PWA для HTTPS/localhost, production получает игры из защищённого каталога.
- `.playroom-pack.json` — установка через «Паки игр». Это исполняемый код: используйте доверенные источники.

Настройте места/ботов/правила в локальной или сетевой комнате. Приглашение и ответ передаются QR, текстом, системным «Поделиться» или звуком. Стол видит публичные данные и разрешённые публичные действия. После полного закрытия RTC может понадобиться новое приглашение; внешняя сигнализация не входит в приложение.

«Мои партии» хранит сохранения и историю. Скрытие локальной партии убирает только её карточку с главной. Возврат в меню сохраняет припаркованную комнату. Не очищайте данные сайта ради обновления: они привязаны к origin/браузеру.

## Что нового

0.18.5: фильтры библиотеки скрыты по умолчанию и раскрываются кнопкой после «Все»/«Избранное»; выбранные значения сохраняются при сворачивании.

0.18.1: компактные блоки правил со слайдерами, короткие подписи, отдельное завершение партии, ∞ в конце лимитов. «Прямо»/«Веером» и рассадка выбираются слайдерами; справки «?» стоят у названий. Колоды Рыбы — 36/52, Акулины — 35/51 в игре.

API 3 и независимые слои, единая фиксированная сцена и компоненты, темы/скины, масштаб 50–150% с безопасным пределом, дискретные громкость/анимация. ЗиЛ+, шесть игроков в Змеях/Ятзи, подтверждение Ятзи, точный выбор фишки Лудо, компактные руки и таблица сетов Рыбы, случайные персонажи Пексесо. [Механики](docs/MECHANICS.md).

Старые API 1/2 не исполняются. Полное обновление подтверждается явно с возможностью экспорта; старые архивы не конвертируются молча. [Совместимость](docs/DEVELOPER-DATA.md).

## Разработка

Python 3.9+, Node.js 22+, npm и Chromium. Репозиторий коллекции разместите рядом либо укажите свой --packs-dir.

```sh
bash scripts/codex/setup.sh --packs-dir ../playroom-paks/packs
node scripts/codex/test.cjs core,input,games,ui,storage,network,pairing
bash scripts/codex/serve.sh
```

Выбирайте адресные блоки для обычных правок; [TESTING](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/TESTING.md). Сервер 127.0.0.1:4173; сначала проверьте занятость порта. [Cloud](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/CODEX-CLOUD.md).

[Индекс разработчика](docs/DEVELOPER-INDEX.md) · [архитектура](docs/DEVELOPER-ARCHITECTURE.md) · [SDK](docs/SDK-0.18.md) · [UI API](docs/GAME-ELEMENTS-API.md) · [roadmap](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/ROADMAP.md) · [релиз и evidence](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/RELEASE-0.18.md) · [CONTRIBUTING](CONTRIBUTING.md).

Паук и Косынка, стандартные/простые персонажи и новые стили карт включены; Тысяча и следующие наборы остаются в плане; [спецификация подготовки](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/NEXT-PATCHES.md).
