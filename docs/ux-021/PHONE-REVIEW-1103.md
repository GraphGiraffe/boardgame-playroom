# Проверка на телефоне, 3 ноября 2026

## Исправления

- Первый вход: «Войти в облако» отдельной подписанной кнопкой у «Играть без облака», без иконки у края заголовка. Обновление статуса аккаунта не удаляет подпись. Возврат сохраняет введённое имя; локальное продолжение сохраняет профиль.
- Push: запись000329 показала pwa-required в HTML-only Funnel. Правильное пояснение и отдельная повторная проверка не запрашивают permission и не подписывают без явного нажатия. Пользователь отдельно разрешил публикацию полной PWA.
- Перестановка: нативное касание с1px смещения до удержания воспроизвело потерю ghost. Причина — общий lostpointercapture отменял перенос при законной передаче захвата с SVG/PATH кнопке. Исправлена проверка владельца захвата; отмена pointercancel сохранена. Обычная прокрутка не блокируется.

## Доказательства

- Onboarding: Chromium/WebKit по6 снимков исходников; Chromium6 снимков точного HTML до drag-only изменения; живое PWA onboarding6 снимков. Возврат сохраняет имя, submit сохраняет профиль.
- Push: existing opt-in case по1/1 Chromium/WebKit: отсутствующий worker, явный повтор, готовность worker, отдельный явный тап; реальных подписок/отправок нет. `tmp_files/ux-021/notifications-enable/`.
- Общение: existing community-actions case по1/1 Chromium/WebKit. Chromium native CDP tiny jitter→hold→move/drop→persist/refresh, shorttap до удержания→чат→Back, обычный swipe→scrollend→следующее нажатие. WebKit controlled pointer/мышь и native tap; физический iPhone drag не заявлен. `tmp_files/ux-021/community-native-touch/` хранит RED/GREEN и capture trace.
- Финальный canonical build exit0;8SHA/3ZIP CRC корректны.230 runtime files побайтно совпадают с source ZIP; исходники зафиксированы в source-state.json.

## Точная сборка и публикация

`tmp_files/ux-021/phone-review-1103/final/`: приложение0.21.0-preview.1, коллекция0.8.9-preview.3. PWA собрана с15 предустановленными играми (без --remote-catalog), чтобы сохранить точный companion.

- Standalone HTML SHA256 `11d181742471cdac0050f1e5ce5ee583ada98ecb43ae218af7dc1130615be739`.
- PWA index SHA256 `f6d9a11fab9feec85911230644a070bc9c59bac2fd7e004e3c6a343a5dd24319`.
- PWA sw SHA256 `cd18de9c8b08ebcbf7f3542f0507903c2c1cba70970fd7b74cc3dcb6095d8046`.

По явному разрешению владельца полная PWA размещена в корне существующего Funnel на443 и8443; /hod-021.html обновлён на финальный standalone. Публичные root/sw.js/platform/web/push-worker.js совпадают с локальными байтами; /index.html штатно перенаправляет на /. Проверка выполнена curl --noproxy с явным публичным IP185.40.234.37, не MagicDNS.

Реальная Push-подписка/VAPID/backend и доставка телефону требуют отдельной проверки пользователем; наличие worker не доказывает доставку. Production SQL, GitHub/Cloudflare release и рассылки не выполнялись. Общая цель0.21 остаётся активной.

Живой Chromium на полном PWA (прокси отключён только в процессе браузера): worker дождался statechange до activated, scope корневой, PushManager доступен,15игр; pwa-ready2кадра, errors/failures/nativeSupabase0. Первый пробный assertion прочёл временное activating сразу после navigator.serviceWorker.ready; финальная проверка ждёт фактическую активацию, без задержки по догадке. Отчёт live-pwa-activated/chromium-report.json.

## Офлайн после полной публикации

На той же опубликованной PWA Chromium: после terminal activated включён native context offline, страница перезагружена из кеша,15игр и профиль сохранены, создана локальная партия Домино. Вкладка закрыта и новая открыта в том же контексте без сети: каталог/профиль доступны, партия есть в «Моих партиях».6кадров, failures/errors/nativeSupabase0. Отчёт `tmp_files/ux-021/phone-review-1103/live-pwa-offline-context/chromium-report.json`. Первая попытка дошла до офлайн-игры, но browser.newPage закрывал вместе с вкладкой собственный context; финальный driver использует явный browser.newContext, без изменения приложения. Это браузерный офлайн на Chromium, не физическая Home Screen/iPhone проверка. Код/сборка не менялись.
