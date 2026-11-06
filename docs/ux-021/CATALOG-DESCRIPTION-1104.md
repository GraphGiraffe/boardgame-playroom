# Описания каталога: две строки и более тихий цвет

4 ноября2026. Исправлен общий стиль описаний; исключения по game ID не добавлялись. Обычная квадратная карточка ограничена двумя строками. Размер12→10.5px при root16px (rem, пользовательский масштаб сохраняется). Цвет —94%muted+6%paper. В списке сохраняется собственный размер11px и свободный перенос, компактные карточки по-прежнему без описания.

Промежуточный11pxвариант оставлял часть описания Mage Brawl за пределами двух строк при360px; он не опубликован. Итоговый10.5px помещает полный текст в две строки на360/390/430 в Chromium/WebKit. Просмотрен Chromium-снимок390px: «Выберите стихию. Раскройте / планы одновременно.». Никакое новое описание и копия данных игры не создавались.

Существующий `case/rc2-hub-browser --name 'catalog text reflow keeps full titles and readable artwork at enlarged root text'`: по1/1PASS в обоих движках, normal/1.25/2×root font, list/2/3, mobile/desktop. Тексты и арт проходят прежние проверки вместимости; тест не ослаблялся и не изменялся. Логи: tmp_files/ux-021/catalog-description-{chromium,webkit}-final-1104.log; JSON/снимки: catalog-text-reflow-1103/description-1104/. Это CSS root scaling, не физический OS font или iPhone.

Опубликовано разрешённое временное превью: HTML `7a71b00c3372c39719ce8fd189564770b26ec2f5f700bda54153a23b415e8f83`, cache `playroom-pwa-v0.21.0-preview.1-2e174f90aee7b8a9`. Из runtime230 изменён только app/hub-shell-021.css; все15pack-объектов прежние. Build8SHA/CRC3ZIP/sourceZIP253файла, public4/4 и live PWA/offline6состояний PASS; JS errors/failures пусты. Source drift0 после публикации. Детали — tmp_files/ux-021/catalog-description-1104/{artifact-audit,final-manifest,source-state,public-check}.json.

[Превью](https://seth.tail6aebd4.ts.net/). Общая цель0.21 и ограничения [полного отчёта](FULL-REPORT-1104.md) этим CSS-исправлением не закрыты.
