# UNO: белая рамка внутри карты

Владелец уточнил, что речь именно о белой рамке внутри карты. Обнаружено точное расхождение миграции HTML→SVG: прежний canonical `.uno-art-face` имеет border-box72×103 и border5px. SVG использовал rect x5/y5 с stroke10, рисуемым по центру контура: фактическая белая полоса стала10 units. Это удвоение, а не особенность браузера или interaction outline.

Canonical `shared/asset-packs/uno-deck/renderer.js` теперь рисует x2.5/y2.5,width67,height98,rx9.5,stroke5. Результат: белая полоса5, внешние границы0..72×0..103, внешний radius12 и внутренний7, как у прежнего CSS. Main/compact исправлены одним producer. Внешние физические card-rim/card-outline и interaction CSS не изменены.

Новые immutable версии: UNO0.6.8-preview.3; asset uno-deck0.1.1-preview.2. compatibility manifest.js создан штатным canonical compatibility_manifest. Host shared resources синхронизированы build.sync_shared_assets(source_root), dev companion подготовлен из15canonical packs; финальная сборка/публикация не выполнялись.

Существующий shared component/domain-foundation case: RED10!==5 →GREEN1/1, main+compact, bounds/radius и canonical host pin checks. Существующий focused UNO browsercase: Chrome1/1 и WebKit1/1 exit0 с реальным видимым normalized SVG, полоса5, положительные screen bounds, native input/drop assertions, errors=[],native0. Normalizer преобразует вложенный SVG в g и снимает viewBox, поэтому сравниваются реальные координаты печатного rect; source unit сохраняет точный artboard. Визуально просмотрена actual hand capture `tmp_files/ux-021/local-mobile-hand/chromium-catalog-print-band.png`.

Evidence: `tmp_files/ux-021/uno-print-border/geometry-{red,green}.log`, `{chromium,webkit}-final.log`, копии browser reports и final-manifest.json. Физическую сверку на телефоне выполнит владелец после общей публикации root.
