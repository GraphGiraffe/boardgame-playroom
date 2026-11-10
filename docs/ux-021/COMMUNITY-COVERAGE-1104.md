# Дополнительная приёмка Общения — 4 ноября 2026

Статус: четыре дополнительных существующих сценария пройдены на текущем source в Chromium и WebKit. Runtime, паки и опубликованное превью не менялись. Полная GOAL0.21 не закрыта.

## Что проверено после исправления владения root

| Выбранный случай `case/community-actions-browser --name …` | Результат обоих движков |
|---|---|
| `community quick actions preserve scroll, read a bounded cursor and enter lobby without invitations` | По1/1 PASS: действия списка, поиск/вкладки, bounded read cursor, сохранение прокрутки, переход в лобби без отправки приглашений. |
| `group members distinguish self and group forms preserve context, selections and partial invitation retries` | По1/1 PASS: собственный участник отличается от других, формы/выбор сохраняют контекст, повтор частично неудачных приглашений. |
| `community notification routing: only presented list anchors replace banners and never mark messages read` | По1/1 PASS после исправления старого селектора вкладки: маршрутизация показываемого уведомления, banner/toast enter/exit, passive poll без повторного входа, reduced/normal/system/user motion, отсутствие seen ACK от одного показа. |
| `friend search ownership: retained login, explicit retry and retired responses cannot affect another window or account` | По1/1 PASS: возврат из входа, явный retry, сохранение нового запроса, отказ от устаревших ответов/ошибок и поздних действий после смены окна/аккаунта. |

Ранее отдельно пройденный пятый случай passive root repaint/account privacy не повторялся: [COMMUNITY-RETAINED-HOST-1104.md](COMMUNITY-RETAINED-HOST-1104.md). Итого эти пять именованных случаев файла имеют адресные свидетельства для текущего неизменённого runtime. Это не полная приёмка всех требований Общения, чатов, RTC, серверной доставки или реальных приглашений.

Все операции выполнялись через изолированные service/Auth/RPC fixtures, без реальных сообщений, заявок, приглашений и Push. Notification reports обоих движков:6press и6motion records, errors[],nativeSupabaseRequests0. Один показ bubble/banner не вызывает read-messages/group-seen/room-chat-seen. Это не доказательство физической слышимости или доставки события сервером.

## Исправление теста и точность свидетельств

Первоначальные запуски уведомлений в обоих движках завершились FAIL на старом `[data-settings-tab=accessibility]`, остальные три выбранных случая прошли. Настройки звука и движения по решению владельца уже объединены во вкладку «Эффекты». Исправлен только селектор на `[data-settings-tab=effects]`; проверки эффектов, preference/reset, маршрутизации и прочтения сохранены. Повторён только этот упавший случай; оба повторных запуска PASS. Исходные неудачные `3.log` не удалены и не засчитаны как успех.

В `final-results.json` отделены исходный exit и окончательный результат/журнал. Копия полного исполненного файла и его SHA сохранены в evidence. Это source UI проверки; они не переименованы в independent final-artifact/device run. В `source-archive-test.json` отдельно указан факт наличия/соответствия теста в более раннем архиве исходников; новый тестовый снимок предоставлен отдельно. Изменение одного тестового селектора не требует повторного билда runtime, PWA smoke или уже успешных игровых проверок.

Текущий опубликованный HTML по-прежнему `a7eb2bba41840ae83671052f2b20b8afc7db007c70b2ff9e61b953913eac1181`, cache `playroom-pwa-v0.21.0-preview.1-44581c31451e4cc8`, collection0.8.9-preview.7. Source drift проверенных runtime/locales/packSources отсутствует; полный новый test file закреплён отдельно. Никаких повторных публикаций/SQL/служб или сетевых настроек в этой итерации не было.

[Evidence](../../../tmp_files/ux-021/community-followup-1104/): final-results.json, executed-community-actions-browser.test.cjs, source-drift.json, source-archive-test.json, chromium/webkit 1.log–4.log, 3-effects.log и notification-motion reports. Source test SHA — в final-results.json.

Приёмка расширяет A18/A19/A20 и A32/A34 только в перечисленном scope. Полные A21–A24, физические устройства/слышимость/системный Push, внешние сети/серверы и независимая usability не закрываются этим набором. Остаточная игровая задержка и полный переход сцен к точечным зависимостям остаются отдельной работой0.21.
