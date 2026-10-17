# 0.18.0-rc.14 — руки слева и фон поля

Мини-руки в карточках игроков выровнены слева: открытые и закрытые карты, включая домино. Размеры и перекрытие сохранены. Крестики-нолики 0.2.0-rc.6 используют стандартную поверхность игры вместо белой поверхности панели.

Проверено: case/rc2-presentation-browser — 31/31. Коллекция 0.7.0-rc.10, изолированный канал 0.18-rc.10. Только preview, production не переключается.

## Публикация

Preview: https://eddd5400.playroom-hod-test.pages.dev

- App SHA: `2b8703358e0814e47d8bab4fe41adf3e691754f2`; packs SHA: `ddc831579bfd6a6d97c258d0c808011522410843`.
- GitHub releases: `v0.18.0-rc.14` / `v0.7.0-rc.10`; скачанные assets прошли SHA256 и ZIP CRC.
- Каталог `0.18-rc.10`: workflow `39029097734`.
- Preview workflow `39029201346`, deployment `eddd5400-c0c3-449e-ab29-d56e33d41966`: `preview-verified`, `productionUnchanged=true`; protected/offline smoke прошёл.
- Проверка исходников: 31/31 браузерных сценария; снимки `tmp_files/rc2-presentation/rc10-domino-backs-light.png` и `tmp_files/rc14-tictactoe-light.png`. Светлая поверхность ячейки: `rgb(233, 237, 221)`, общий token `--color-surface-game`.
- Полный веб-аудит RC12: workflow `39028027828` завершился успешно. В RC14 проверены изменённые компоненты и публикационный smoke; полный веб-аудит RC14 повторно не запускался.
