# Общий стек панелей — реализация и выбранные проверки

Дата: 2026-11-02. Это узкое evidence, не приёмка всего 0.21 и не проверка физических телефонов.

## Реализация

- SharedViews использует общий `PlayroomDOM.ModalController`: reset/replace/push, owner-scoped frame, непрерывная identity сессии, очередь обновления собственного suspended окна. Закрытие чужого активного окна невозможно; уничтожение renderer освобождает свои зависимые поверхности.
- `GameScreen.bindSurfaceDismiss` даёт короткой панели реальную ручку 44px (видимая полоса 38×4), tap/Enter/потягивание вниз от 64px. Короткое движение и pointercancel не закрывают панель. Все события привязаны к действующему frame; dispose снимает обработчики. Кнопка «Закрыть» остаётся существующей командой владельца.
- Обычная panel в обеих ориентациях прикреплена к низу окна: ширина 100%, верхние радиусы 24px, max-height 100dvh−40px, прокручиваемое содержимое, безопасные отступы, заголовок 18px, действия 44px. Узкие legacy large-frame правила больше не меняют typed поверхности.
- `confirmDialog` теперь panel общего стека. Promise<boolean> и data-confirm-cancel/accept сохранены. Cancel/Close/Escape/удаление родителя/reset дают false; Accept допускается только для действующего frame, родителя, аккаунта и room/participant identity. Фокус восстанавливает registry. Нативный отдельный dialog удалён.
- GameChatPanel сохраняет исходную DOM под root panel: suspended/inert/aria-hidden вместо удаления, без изменения размеров и истории. Клавиатура и изменение размера не управляют suspended чатом. Порядок слоёв: чат90, root100, меню110, предложение передачи хоста130.

## Выполненные проверки

`/tmp/hod-panel-registry-ui.cjs` с исходным приложением, Playwright Chromium и WebKit, viewport390×844 и844×390: **4/4 PASS**, pageerrors[]. WebKit использует установленный `PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit`.

Проверены геометрия panel/scrollbody/header/handle/close, сохранность исходного connected/inert родителя и фонового DOM, короткое движение, pointercancel, Enter, длинное движение с ровно одним закрытием, focus/selection/value/scroll исходного input после Back, невозможность stale handle/token восстановить удалённое окно. Для подтверждений проверены Cancel=false, Accept=true, Escape=false, invalid parent=false и безопасность detached Accept.

Артефакты: `tmp_files/ux-021/panel-stack/{chromium,webkit}-{390,844}.png`, `{engine}-confirm-{390,844}.png`, `{engine}-report.json`.

`node scripts/codex/test.cjs case/game-screen`: **23/23 PASS**, skipped0, exit0. Журнал: `dist/test-results/case-game-screen-core.log`.

## Реальный RTC — обнаруженные регрессии

Существующий `/tmp/hod-final-ui-rtc.cjs` расширен проверками собственной participant panel→редактор имени→Save, исходной DOM кнопки/фокуса, а также чата→participant panel→Back с draft/selection/scroll/scene identity.

До полного прохода выявлены destructive background refresh: LobbyView modal-restored выбирал suspended lobby; исправлен active-root lookup. Дополнительно `network-ui.handleHostRoomState` по наличию любого lobby вызывал renderLobby/reset во время сохранения имени. Трасса: [lobby suspended, participant suspended, editor active]→[новый lobby active], уничтожив родителя. Network migration выполнена code_critic: background refresh теперь использует active lobby. Дополнительно исправлен SharedViews dispatch: намеренно отсоединённый menu action сохраняет обработку команды после закрытия menu layer, прочие отсоединённые targets игнорируются.

После исправлений тот же сценарий выполнен до конца: **13 checkpoint PASS, pageerrors[]**, actual Chromium WebRTC между двумя локальными browser contexts. Проверены:

- Присоединение зрителя; собственная participant panel→редактор→Save возвращает тот же action DOM и нативный фокус.
- Изменение реальных правил, reader/Back/Save и доставка domain value второму клиенту при сохранении room/channel identity.
- Передача хоста зрителю, только owner видит Stop; обратная передача во время партии и реальная остановка обоим клиентам в лобби.
- Shared rulebook→настройки приложения→Back возвращает тот же connected reader, scroll и scene. Вход в настройки здесь через `AppBridge.showSettings()` — проверка controller integration, не пользовательского discoverability.
- Сброс настроек через новый общий confirm/Back сохраняет исходные scene, room и connection.
- Черновик gamechat переживает поворот844×390, сжатие390×430 и close/reopen. Сжатие viewport не выдаётся за физическую клавиатуру.
- Participant panel над gamechat оставляет исходные dock/editor/scene connected, dock inert/aria-hidden. Реальное входящее сообщение от второго клиента доставляется в suspended DOM, `ChatActivity.visible()===false`, actual server room-chat-summary сохраняет unread≥1. Back восстанавливает тот же editor, draft, selection2..8, scroll и scene. Вход в participant panel здесь через `FriendProfileUI.showParticipant(target)` — controller integration.
- Реальные сообщение, reply и attached reaction доставлены по RTC.

Артефакты: `tmp_files/ux-021/final-ui-rtc/report.json` (13 checkpoint), `chat-participant-underlay.png`, `chat-landscape-draft.png`, `chat-keyboard-size.png`, `reply-reaction-live.png`, offer banner/panel PNG. Это не доказательство native Push, TURN в интернете, физических iPhone/Pixel или полной визуальной fidelity всех экранов.
