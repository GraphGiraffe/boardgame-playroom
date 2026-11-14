# A11 · Подключение и восстановление

Дата: 2026-11-02. Источники: owner-decisions-7 `connection=0`, connected prototype, `fidelity/reference-connection-{390,844}.png`, `UX-STRUCTURAL-REVIEW-02.md`.

## Общая композиция

`ConnectionProgress.markup()` создаёт один fullscreen «Подключение» для `enterRoom` и cloud adapter. Внутри один основной live status: задача/конкретный наблюдаемый этап, общий indeterminate meter без процентов и закрытые по умолчанию подробности методов. Отдельная старая строка «Подключение…» перед presenter удалена. Методы действительно проверяемых каналов видны в главном тексте; Direct/STUN/TURN и их состояния доступны в details.

Успех показывает галочку, фактически переданный выбранный метод и известный UDP/TCP/TLS. Неопределённый маршрут так и подписан, не объявляется TURN. Только завершённое соединение имеет конечное значение1/1; до этого `aria-valuenow` отсутствует. После ошибки/паузы meter скрыт, вторичные строки перестают обещать продолжающуюся проверку. Ошибка даёт подписанные Повторить / Отменить; отмена Share и другие посторонние функции не затрагивались.

Подробности патчат исходный DOM и сохраняют open/focus при обновлениях. Один target принадлежит одной попытке; presenter не подбирает чужой/suspended placeholder глобальным query. Явный paint поддерживает новую nearby поверхность того же контроллера; отменённый presenter не может забрать target следующей попытки. Для ручного «Рядом» остаётся компактное представление и Direct-only методы, без изменения offline wire.

Публичные ошибки выводятся по известному code, протокол — по whitelist. SDP, credentials, адреса, произвольный error.message и raw publicDetail в DOM не попадают.

## Владение и отмена

`enterRoom` изменён только отдельными hunks. Сохранены ticket/identity/frame guards ведущего. Resolver получает `isCurrent()`; перед connect повторяется проверка активности. `stillOwned()` отличает живой suspended родитель от уничтоженного/сменившего identity. Если ответ вернулся под дочерним окном, connect/навигация/закрытие дочернего окна не выполняются: собственный родитель получает paused+Retry без перевода фокуса. Cancelled под suspended также не оставляет бесконечного ожидания. Уничтоженная wrong-password ветка ничего не восстанавливает. Catch меняет только свой frame.

Cloud adapter переиспользует только активный canonical connecting screen. Для самостоятельного открытия у него собственный retry hook и account generation validity; соседний чужой progress не мешает открыть правильную поверхность. Footer Cancel и Back используют общий modal stack и исходные callbacks.

`application/connection-attempt.js`, ICE, signaling, wire и тайминги в этом изменении не менялись. Исходный sleep500 после успешного admission и cancellation check сохранены.

Файлы: `app/connection-progress.js`, `app/cloud-network.js` showProgress adapter, только `enterRoom()` в `app/lobby-network.js`, scoped `app/connection-021.css`, одна регистрация asset index/SW. Новый selected browser case зарегистрирован одной строкой в `tests/blocks.cjs`. `tests/cloud-room-entry-browser.test.cjs` принадлежит ведущему и здесь не редактировался.

## Выбранные проверки

- `node scripts/codex/test.cjs case/web-push --name 'ICE progress sends one sanitized batch'` — **1/1 PASS**, exit0. Сохранены единый sanitized trace batch, выдержка500 и отмена во время неё.
- `PLAYROOM_CAPTURE_DIR=.../connection-021 node scripts/codex/test.cjs case/connection-progress-browser` — Chromium **1/1 PASS**, exit0.
- Тот же browser case с `PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit PLAYROOM_CONNECTION_ENGINE=webkit` — WebKit **1/1 PASS**, exit0.

Browser case использует исходное приложение, реальные `ConnectionProgress`/`ConnectionAttempt` и общий modal registry; transport/credential/selected-method порты контролируются fixture. Пять групп проверок:

1. Один stage, наблюдаемые методы, unknown meter без числового процента,360×740/390×844/844×390 без overflow, кнопки44px, reduced motion без анимации meter.
2. Details/native keyboard focus сохраняются; terminal failure останавливает checking labels, скрывает meter, показывает Retry; PRIVATE error text не попадает в DOM.
3. Cancel возвращает тот же connected foreign parent, затем прежний settings input с исходным фокусом.
4. Paused renderer обновляет собственный inert parent, не закрывает и не фокусирует child, сохраняет его draft/selection; Back открывает Retry.
5. Галочка и TURN/TLS, фактическое ожидание connected promise (threshold>=450ms при исходном sleep500), защита следующего target от retired/disconnected presenter.

В обоих engine pageerrors[], nativeSupabaseRequests0, denied fetches0; unexpected Supabase fetch блокируется fixture до сети. Trace/credentials порты локальные, облачная диагностика не отправлялась. Это **3 выбранных запуска**, не весь browser suite и не подтверждение реального ICE/STUN/TURN, внешнего реле или физического iPhone/Pixel. Реальный held-admission→child→resolve→BackRetry сценарий отдельно принадлежит A10 тестам ведущего; presentation fixture не выдаётся за admission proof.

Артефакты: `tmp_files/ux-021/connection-021/{chromium,webkit}-connection-report.json`, `*-connection-checking-{360,390,844}.png`, `*-connection-error-{390,844}.png`, `*-connection-paused-390.png`, `*-connection-success-{390,844}.png`. Error screenshot также показывает реальный keyboard focus в раскрытых подробностях.

Функциональный scope зелёный. После освобождения слота дизайнер независимо сверил семь checking/error/paused/success кадров обоих движков и принял показанную композицию. Общий header/safe-area используется без локальных компенсаций; это не приёмка реальной внешней сети.
