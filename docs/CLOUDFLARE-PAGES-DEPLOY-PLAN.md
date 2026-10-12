# DEPLOY-01 · защищённая публикация Pages

Реализация для кандидата 0.16: `.github/workflows/pages-deploy.yml`, `scripts/pages-deploy.py`, `scripts/pages-smoke.cjs` и `scripts/pages-wrapper-check.cjs`. Проверка живого проекта и реальная публикация фиксируются отдельно от локальных тестов. Pages раздаёт HTTPS-приложение и не служит WebRTC signalling/TURN.

## Конфигурация

Используется существующий Pages-проект, прежний hostname и scope. Новый проект при обновлении не создаётся: сохранения привязаны к origin. Прямая Git-интеграция Cloudflare не нужна; публикацию запускает GitHub Actions вручную. Перед переключением проверенного production или rollback pipeline выключает автоматические production/preview Git-сборки через Pages API и проверяет результат. Это исключает повторную публикацию незащищённого корня репозитория параллельным Git build.

В GitHub → Settings → Secrets and variables → Actions:

| Тип | Имя | Значение |
| --- | --- | --- |
| Secret | CLOUDFLARE_API_TOKEN | Cloudflare API token: Account → Cloudflare Pages → Edit, только нужный аккаунт |
| Secret | PAGES_PRIVATE_WRAPPER_B64 | Base64 ZIP ровно из `_worker.js`, `_routes.json`, `manifest.webmanifest` существующей доверенной защиты |
| Secret | PAGES_SMOKE_PASSWORD | Текущий пароль входа на сайт для браузерной проверки |
| Secret | CF_ACCESS_CLIENT_ID | Client ID сервисного токена, если preview/deployment URLs защищены Cloudflare Access |
| Secret | CF_ACCESS_CLIENT_SECRET | Client Secret того же токена; политика Access приложения: Service Auth → Include → Service Token |
| Variable | CLOUDFLARE_ACCOUNT_ID | Account ID существующего Pages-проекта |
| Variable | CLOUDFLARE_PAGES_PROJECT | Имя проекта |
| Variable | CLOUDFLARE_PRODUCTION_BRANCH | Точное значение Production branch в Cloudflare; не угадывать по ветке GitHub |
| Variable | CLOUDFLARE_PAGES_ORIGIN | Полный прежний HTTPS origin без завершающего `/` |

Worker, пароль, cookie, токен и закрытый ZIP не публикуются в Git или Release. Публичные assets содержат только обычную PWA. Все credentials передаются через окружение; отчёт содержит лишь release/SHA, origin и deployment ID.

Cloudflare Access и пароль приватного Worker проверяются отдельно. Сервисный токен разрешает CI пройти внешний Access; проверки неверного пароля и ресурсов без cookie приложения сохраняются. В Secrets нужны только значения `cfast_…` и `….access`, без имён HTTP-заголовков и двоеточий. При строгой авторизации сервисного токена Access не выдаёт cookie, а Chromium не добавляет заголовки контекста к первому запросу `sw.js`. Поэтому браузерная проверка использует локальный мост только для точного HTTPS host:port: он добавляет сервисный токен к запросам браузера и отдельно проверяет TLS-сертификат Cloudflare. Между Chromium и локальным мостом действует временный сертификат, разрешённый только по его SPKI; ключ и сертификат удаляются после проверки. Другие CONNECT-адреса и Host отклоняются. API-запросы также проверяют origin и не следуют за редиректами. Offline проверяется штатным отключением сети браузера без подмены ответов. Существующие политики Access не отключаются.

## Запуск

Workflow должен находиться на default branch для ручного запуска через Actions. До его появления там Ready PR выполняет только `preflight` существующего сайта: чтение Pages API и проверки доступа/offline, без загрузки файлов и переключения production. PR из fork не получает эту задачу.

Actions → **Protected Pages publication** → Run workflow:

- `preflight`: проверить настройки и существующий защищённый сайт без публикации.
- `deploy`, `release=v0.16.0-rc.1` (либо другой уже опубликованный tag): скачать `playroom-pwa.zip` и `SHA256SUMS`, проверить контрольную сумму, пути, наличие пяти паков, integrity и отсутствие дубликатов. Перед загрузкой проверить обёртку: неверный пароль, поддельная/просроченная cookie, чужой Origin, допустимый Origin:null и авторизованный доступ.
- `rollback`, `deployment=<ID>`: сначала проверить защиту существующего успешного production deployment, затем вернуть его и проверить основной origin. Preview и неуспешные deployments отклоняются.

Публикация загружает preview, проверяет вход/защиту ресурсов, соответствие байтов ZIP и offline-запуск. Только после этого загружает production в тот же проект. Смена production другим процессом за время preview прерывает операцию. Провал проверки после production-загрузки вызывает возврат к прежнему успешному deployment; отказ самого Cloudflare rollback завершает workflow ошибкой, а не ложным успехом. Параллельные публикации этого workflow сериализованы.

Успешный запуск сохраняет `pages-deployment-report`. Перед обновлением проверить текущий production deployment: первый пустой проект этим workflow не инициализируется, поскольку для него нет точки отката.

## Кеш и ручная приёмка

Проверка нового браузерного профиля не заменяет проверку установленной PWA. На прежнем origin после обновления закрыть все старые вкладки/PWA, открыть приложение снова и проверить существующие сохранения на двух устройствах. Service Worker сначала проверяет новый shell, затем ждёт закрытия старых клиентов; старый активный клиент не подменяется посреди партии.

Rollback меняет серверный deployment. Уже установленная PWA применяет обратное обновление по тому же циклу; мгновенного удаления скачанного кеша нет. Истечение серверной cookie тоже не отзывает уже скачанные offline-копии. Это отдельная политика, не свойство password Worker.

До переноса нового Pages workflow на default branch используйте существующий **Release candidate build**: выберите ветку кандидата и operation `preflight`, `deploy` или `rollback`. Он вызывает тот же Pages workflow с того же SHA через workflow_call; `build` по-прежнему выполняет полную сборку RC. Автоматической публикации по push нет.

Перед обычным deploy проверяется защита предыдущего production: открытый ошибочный Git build не допускается как автоматическая точка отката. Если текущий production открыт из-за ошибочной Git-сборки, у `deploy` можно явно указать ID прежнего успешного защищённого production deployment в поле `deployment`. Workflow проверит на нём пароль, вход, целостность онлайн-ресурсов и запрет анонимного доступа, затем использует его как точку отката. Для такого переходного fallback допускается старая неисправность offline-кеша; новый preview и новый production по-прежнему должны пройти полную проверку, включая offline. При сбое публикации workflow откатывается к указанному защищённому deployment и проверяет его онлайн. Этот режим нужен только для восстановления после уже открытой Git-сборки; без явного ID требования к полной проверке предыдущего production не меняются.

Каждый запуск `deploy` создаёт один изолированный `verify-*` preview и проверяет его перед переключением production. Отдельный запуск `preview` нужен только для диагностики. При успешном переходе workflow отключает автоматические Git-сборки Cloudflare для production и preview; дальнейшие push в ветки не создают дополнительные Pages deployment.
