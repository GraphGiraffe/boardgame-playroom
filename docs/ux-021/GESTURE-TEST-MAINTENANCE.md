# Обслуживание существующих gesture fixtures

Исправлены два ожидания CoreInput: `tests/drag-app.test.cjs` helper touchDrag и `tests/lobby-layout-browser.test.cjs` nativeDominoDrag теперь после touch hold выполняют14px намеренного движения до ожидания ghost. Mouse hold и quick vertical gesture сохранены. Legal targets, exact-one-commit, magnetic snap, hand-scroll/no-action и retained scene/chat assertions не ослаблены.

Domino case ещё использовал удалённый resume-banner и legacy localStorage как текущий state. Его isolated fixture переведён на stable HTTP origin, local profile, Saved→actions→Continue и canonical current saveLibrary. Обучение отключено для всех hotseat viewers, как в существующих UNO input fixtures. Safe provider установлен; runtime не изменён. Второй top-level Shared-drag case не менялся и не запускался.

Строка492 lobby-layout относится к `.order-drag-preview`/PlayroomOrderUI и переносу участников/жетона первого игрока, а не CoreInput карт. Там stationary hold по-прежнему является контрактом; helper/case не изменён и не перезапускался.

Выбранные команды после --list:
- `case/drag-app --name 'Domino selection and drag gestures through the real application'`:11/11 exit0.
- `case/lobby-layout-browser --name 'game overlays 0.21: room context, native menu focus and resized RTC chat preserve the scene'`:Chromium1/1 и WebKit1/1 exit0, errors=[],nativeSupabaseRequests=0.

Этот RTC case выявил отдельную фактическую регрессию root outside-handler: native notification tap снаружи немодального dock закрывал dock и поглощал click, поэтому Group не открывалась. A/B в том же case с временным inert существующего dock доказал причину: Group и весь exact native dock/editor/draft/selection return прошли. Обход удалён. Root исправил typed outside policy: explicit controls/navigation не закрывают контекст dock; blank outside сохраняет dismiss semantics. Final обе engine проходят без inert обхода и без изменений Group fixture/API. В каждом из5 actual page contexts зафиксирован SHA bindPanelGesture.toString(); оба engine загрузили один helper hash.

Evidence: `tmp_files/ux-021/gesture-test-maintenance/domino.log`, `overlays-{chromium,webkit}-final.log`, `overlays-final/*-report.json`, `outside-inert-ab-report.json`, `final-manifest.json`. Agent изменил только tests и этот документ, не собирал/не публиковал продукт. Root-owned outside runtime change требует собственной итоговой сборки/публикации root.
