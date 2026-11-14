# A12 Nearby implementation

Local source work, 2026-11-02. Selected reference: `nearby1`, two-phone wizard from owner decisions 7. No production deployment or cloud mutation.

## Structure and real operations

The full-screen **Рядом** surface has Show/Receive directions, the current two-phone step, and exactly one of QR, Sound or Code. The host first shows its invitation, the second phone receives it and shows the actual generated answer, and the first phone receives that answer. Reading the first QR does not claim connection success. The answer screen waits for the real handshake; existing connection progress shows actual ICE observations and the selected route.

The ordinary view holds one operation. Address/interface selection, PR2/PR3 choice, sound protocol and permission to invite remain available in a collapsed connection settings section. Manual text and the selected route survive method changes. Portrait uses the selected stacked arrangement; landscape uses instructions/methods left and a complete QR right, with a compact footer.

`app/nearby-view.js` owns this presentation and tab navigation. `app/network-ui.js` still owns the existing Pairing/WebRTC/admission ports; `app/pairing-presenter.js` still creates real codes/QR/audio operations. Online invites/join in `lobby-network.js` are a separate surface. The existing delegated invitation RPC remains authoritative; its answer submit button lives in the footer and is resolved from its owning surface.

## Lifetime boundaries

- Back/disposal or a new attempt closes an unadmitted peer and stops audio work; method/direction changes and suspension stop listening/transmission. The QR file result and acoustic listener callbacks validate the current surface/method/revision. A listener that starts after cancellation is immediately stopped.
- Peer creation validates its attempt and original active surface before assigning shared state. A late failure from a cancelled client attempt cannot close, toast over or replace a newer receive screen.
- Candidate discovery, token formats, actual selected addresses, shared authority, private projections and admission are preserved. No fake offer, fabricated connection success or automatic consent was introduced.

## Selected evidence

- `node scripts/codex/test.cjs case/pairing-methods-browser`: **10/10 Chromium and 10/10 WebKit** on final source. Existing controlled-IO browser cases cover one visible method, text preservation, sound output independent of microphone permission, sound stop on switching, late QR after Back, late peer rejection after Back/new attempt, PR2/PR3, address recovery and narrow-screen overflow. These fixtures are not real WebRTC evidence.
- The existing actual two-client acceptance flow was adapted only to the current Nearby controls and public manual-join entry. **Chromium and WebKit: 13 checkpoints, errors []**. It exchanges real signals, joins the actual room, then verifies self-profile/native focus, rules, handoff, active-only Stop, connected stack and unread chat underlay, draft/selection/rotation, live reply/reaction and handoff back. Actual sources/reports/screens are in workspace `tmp_files/ux-021/nearby-rtc` and `nearby-webkit`.
- Additional Chromium delegated-invitation flow: **14 checkpoints, errors []**. A third actual peer receives the delegated offer, returns its generated answer through the existing participant’s footer form, joins and leaves through the real room context menu; the original two clients then complete all prior checks. Evidence: workspace `tmp_files/ux-021/nearby-delegated-rtc/report.json`.
- Reviewed actual 390×844 and 844×390 screenshots: invitation QR is complete, method tabs/instructions and current action are visible. Answer and receive-code states were also reviewed. Screenshots are functional visual evidence for these states, not acceptance of every 0.21 screen.

Physical camera capture, acoustic transfer between phones, NAT/router combinations and actual iOS/Pixel hardware remain device checks. Local WebKit establishes this runtime; it does not substitute for a physical iPhone.

## Общие панели дополнительных параметров

2 ноября: выбор адреса/параметров звука в `pairing-presenter.js` больше не открывает
собственный native dialog поверх общего стека. Используются ModalController,
контекстная panel, общие заголовок, ручка и закрытие. Исходный мастер и точный select
сохраняются подключёнными; отмена возвращает его значение и фокус. Удаление
сохранённого адреса использует прежнее хранилище и обновляет только принадлежащий
источнику выбор. Активная поверхность и наличие исходного select проверяются
перед действием; снятая панель не может закрыть или изменить новую.

Варианты захватываются вместе с конкретными option-узлами и значениями. Если
фоновое обновление заменило option, старый числовой индекс не выбирает другого
кандидата: выбор закрывается с просьбой открыть актуальные параметры.

Адресный существующий файл:
`node scripts/codex/test.cjs case/pairing-methods-browser --name 'nearby choice 0.21:'`.
Chromium1/1 и WebKit1/1 PASS. Две ориентации, реальные общие DOM/stack механизмы,
выбор All→существующий PR2, отмена, stale option, удаление адреса и поздний обработчик
после замены поверхности. Первый замер попал в штатную анимацию появления;
окончательный тест ждёт её завершения, границы viewport не ослаблялись.

Артефакты `tmp_files/ux-021/nearby-choice-021/`. Это controlled presenter fixture
с подменённым RTC-портом, не настоящий обмен телефонами или проверка TURN/SW.
Предыдущие отдельные реальные RTC-свидетельства сохраняют свой исходный scope.
Native конфигурация SDP, QR/звук/сигнализация и правила соединения не менялись.
