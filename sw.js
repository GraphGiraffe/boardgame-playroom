'use strict';
if(typeof importScripts==='function')importScripts('./platform/web/push-worker.js');
// API 4 shell cache: replace UI assets without deleting authoritative
// IndexedDB journals or client history. Older published releases remain immutable.
const CACHE='playroom-pwa-v0.21.1';
const UPDATE_INFO={"version":"0.21.1","releases":[{"version":"0.21.1","changes":["При запуске сетевой партии у гостя загружается нужная версия игры из каталога."]},{"version":"0.21.0","changes":["Обновлён интерфейс: главные разделы, лобби, карточки игроков и вложенные панели.","Наглядные правила игр, иллюстрации параметров и единое оформление настроек.","Доработаны игры и боты: командные Стихии, дополнительные жизни и сжатие поля, Лудо, ЗиЛ+ и подсчёт мест в UNO.","Улучшены Онлайн и «Рядом»: устройства одного аккаунта в общей партии, переподключение и уведомления.","Улучшены управление партиями, облачные сохранения и обновления с сохранением данных.","Добавлена обратная связь со скриншотами и диагностикой; ускорена загрузка аккаунта, исправлены ошибки интерфейса и обновления игр."]},{"version":"0.20.0","changes":["Сетевые аккаунты, друзья, личные и групповые чаты, приглашения и Web Push с переходом к нужному сообщению.","Онлайн-комнаты: добровольная передача хоста в лобби и партии, управление участниками, временные боты, автозапуск при выполнении условий и очистка закрытых комнат.","Облачные сохранения, синхронизация аккаунта и перенос сохранений с сохранением границ доступа к истории и игровым данным.","Улучшены масштабирование, прокрутка, шапка, карточки игр на iPhone и установка обновлений PWA."]},{"version":"0.19.11","changes":["Правила всех игр стали короче: шаги, списки, таблицы и иллюстрации реальных игровых элементов и кнопок.","Объёмные фишки в Лудо, Змеях и Стихиях; улучшены рамки тайлов, выделения, меч и выбранные пункты слайдеров.","PWA при обновлении учитывает только окна ХОД, а не другие приложения на том же домене.","В Змеях и лестницах поправка ±1 допускает движение на 0–7 клеток; описания эффектов сокращены.","Подготовлены правила Стихийной потасовки редакции 1, буклет A4 и лист памяток для печати."]},{"version":"0.19.10","changes":["Исправлена пропадающая кнопка установки PWA на GitHub Pages: приглашение Chrome сохраняется до входа по паролю.","Исправлен конфликт идентификатора PWA с другими приложениями на том же домене: у ХОД отдельный постоянный ID /playroom.","Добавлены стандартные некоммерческие лицензии и отдельные условия Стихийной потасовки; лицензии включены в архивы выпуска."]},{"version":"0.19.9","changes":["Установленная PWA открывается из локального кеша без ожидания сети.","На GitHub Pages приложение после первого входа сохраняется на устройстве в расшифрованном виде; новая версия расшифровывается один раз при обновлении.","Кнопка обновлений занимает место кнопки установки PWA, с теми же оформлением и анимацией.","Менеджер паков открывается без скачка содержимого при подсчёте объёма и получении каталога.","Сортировка и избранное сохраняют статистику без повторного подсчёта; запоздалые ответы закрытого окна игнорируются."]},{"version":"0.19.8","changes":["Обновления приложения и паков показываются в общем окне вместо уведомлений сверху. Изменения всех пропущенных версий перечислены по порядку.","Окно появляется в главном меню и не прерывает партию. После закрытия список доступен по кнопке обновлений.","Исправлен порядок игр при первом запуске: он совпадает с коллекцией, редактором и менеджером паков.","В менеджере паков убраны лишние пояснения сверху; объёмы данных сохранены."]},{"version":"0.19.7","changes":["Исправлена регистрация локальных действий обучения в сетевой игре; игровые команды отмечаются после успешного ACK.","Паки и локальные сохранения перенесены в IndexedDB с проверкой миграции и атомарными записями. Общий размер данных и размер каждого пака видны в менеджере паков.","Новые локальные истории сохраняют настройки, seed и принятые команды. Снимки и события восстанавливаются закреплённой версией пака. Старые форматы сохранений совместимы; сетевые архивы не изменены.","Выделение текста запрещено в интерфейсе, кроме полей ввода и редактируемых областей.","Снят предел коллекции 20 МиБ; ограничение импорта одного пака 4 МиБ сохранено. Настройки и обучение остаются в localStorage."]},{"version":"0.19.6","changes":["Срочное обучение UNO работает во время эффектов и вне своего хода; успешное объявление сохраняется в прогрессе.","Боты получают защитное окно; отложенный ответ не блокируется ожидающим обвинением. Кнопка обвинения видна, но неактивна до истечения защиты.","Сначала сравниваются major/minor/patch; суффикс приоритетен только при одинаковой основной версии.","GitHub Pages: постоянный вход по паролю, PWA и статические обновления паков."]},{"version":"0.19.5","changes":["Постоянное обучение по действиям для каждого пользователя и пака, список освоенного, подтверждаемый сброс и подсказки по текущей ситуации.","Три сложности ботов; исправления сетевого восстановления, анимаций и поведения игр, принятые в предварительных сборках ниже.","После успешного обновления автоматически удаляются старые версии, не используемые сохранёнными партиями. При недоступном архиве сети или активной комнате версии сохраняются. Кнопка паков пульсирует при доступных обновлениях в коллекции и «Моих партиях».","Повторное освоение уже сохранённой цели обучения не вызывает лишней записи в хранилище."]},{"version":"0.19.4","changes":["Текстовые показатели результатов поддерживают дробные значения и заданную точность отображения.","Полные правила читаются по разделам и абзацам; настройки и значения текущей партии вынесены в конец за разделитель. Общая справочная сноска удалена. Единое отображение в комнате, локальной партии и сетевом столе.","В настройках партии правила перенесены в шапку вместо справки комнаты; закрытие вложенной справки возвращает в настройки.","Закрытие комнаты крестиком или системным Назад сохраняет комнату и возвращает на исходный экран, в том числе в текущую партию."]},{"version":"0.19.3","changes":["Компактные контекстные кнопки (32 px) и передача хода (до 36 px без роста карточки). Отдельная кнопка при рассадке Лудо закреплена в оболочке экрана, независимо от содержимого пака.","Общий runtime фиксирует треки, зазоры и выравнивание структурных сеток поля; изменение жетонов или топологии больше не снимает блокировку. Перерасчёт требует `allowLayoutChange: true` либо изменения viewport/масштаба.","Дурак: колода и все шесть пар занимают постоянные места с начала партии; выкладка не меняет сетку. Общий контракт запрещает перекомпоновку без явного разрешения или изменения экрана.","Автопередача выключена по умолчанию; основной игрок сохраняет предпочтение между партиями, гости — только в том же лобби, независимо от смены места.","В хотсите автопередача настраивается отдельно для каждого игрока; ручная кнопка перенесена в свою карточку (при рассадке Лудо — в угол экрана), пульсирует после завершения хода.","Рамки переносимых объектов повторяют SVG-контур; обычные объекты сохраняют скругление источника, клетки остаются прямоугольными.","Общий drag/drop: фишки Лудо и Змей и лестниц, карты Дурака; расширенные зоны сброса UNO/Дурака и примагничивание Домино.","Актуализированы текущие версии и границы опубликованного выпуска в документации."]},{"version":"0.19.2","changes":[]},{"version":"0.19.1","changes":[]},{"version":"0.19.0","changes":[]},{"version":"0.17.6","changes":["В «Морском бое» счётчик побед стоит в строке имени, а флот остаётся строкой ниже. Коллекция 0.6.5 убирает подсветку размера корабля после расстановки и из карточки соперника."]},{"version":"0.17.5","changes":["Морской бой сохраняет вручную выбранное поле при ходе другого игрока; зритель может включить автопоказ поля цели. Для выстрела действует минимальная пауза 750 мс, независимо от скорости анимаций. Перетаскиваемые корабли центрируются под пальцем; недопустимая позиция видна сразу.","Коллекция 0.6.3 содержит исправления Лудо 0.1.12 и Морского боя 0.1.6."]},{"version":"0.17.4","changes":["Главное меню сообщает о новых версиях установленных паков: закрываемое уведомление показывает число обновлений, а непросмотренные обновления отмечаются на кнопке паков при возврате в меню. После открытия списка паков тот же выпуск повторно не напоминается.","В результатах первый игрок получает тот же жетон, что в игре; с медалью жетон находится под ней, а в командной игре сохраняет цвет команды.","В результатах командной игры цветной жетон команды того же размера, что медаль места, слегка выглядывает из-под неё. Обычные результаты сохраняют один жетон места.","Круглые фишки, счётчики и медали рисуются одним SVG-диском с общей боковой гранью; у жетона первого игрока сохранён принятый шрифт, а цифра на маленьком жетоне опущена по центру лицевой части.","Строки результатов содержат аватар, тип игрока, имя и те же счётчики, что карточка во время партии; значки наград расположены веером.","Коллекция 0.6.2 добавляет библиотеку игровых ассетов и обновляет фишки Лудо, «Змей и лестниц», шашки и счётчик «Крестиков-ноликов»."]},{"version":"0.17.3","changes":["Лобби Лудо в командном режиме показывает жетоны обеих команд на местах игроков; в партии и лобби жетоны стали меньше, а командные жетоны без номера не имеют точки в центре. У первого игрока на командном диске остаётся единица.","Коллекция паков 0.6.1 обновляет Лудо до 0.1.10: крупные центрированные SVG-звёзды, стартовые SVG-треугольники и фишки по центрам кругов базы."]},{"version":"0.17.2","changes":["Жетон первого игрока получил светло-бежевую круглую фишку с контурной единицей по центру; одна форма используется в комнате и игровых карточках."]},{"version":"0.17.1","changes":["Счётчик главного меню различает показанные и скрытые игры; при фильтрации показывает число подходящих игр, а в режиме редактирования — общее число."]},{"version":"0.17.0","changes":["Защищённый каталог R2 позволяет обновить коллекцию или один пак без Pages deployment оболочки. Чистый профиль устанавливает игры из каталога; сохранения остаются привязаны к точной версии.","Главное меню получило режим перемещения игр между избранными, обычными и скрытыми; версия оболочки видна в нижнем блоке на телефоне.","Жетон первого игрока использует символ из настроек правил. Итоги игр хранят показатели и общие места при равенстве; короткий сигнал и подсветка сообщают о переходе хода.","Коллекция 0.6.0 добавляет итоговые показатели игр и публикуется отдельно от оболочки в защищённом каталоге R2."]},{"version":"0.16.3","changes":["История отмечает только действительно догруженные после переподключения ходы на слайдере.","Общие жетоны первого игрока и команд показываются на аватарах; таблица Ятзи сохраняет жест и прокрутку.","Игровые реплики показываются на карточках игроков; подготовка флота и анимация закрытия карт улучшены.","Коллекция 0.5.4: в Лудо видны все фишки на общей клетке, выделены безопасные звёзды и не повторяется бросок соперника при смене хода."]},{"version":"0.16.2","changes":["Во всех игровых сценах долгий тап не выделяет текст и обозначения поля. Поля ввода остаются доступными для редактирования.","Коллекция 0.5.2 обновляет Лудо до 0.1.6: синие и жёлтые фишки, базы и дорожки соответствуют цветам игроков.","В истории показаны значения кубиков Лудо и Ятзи без доступных действий. Четыре индикатора флота соперника в Морском бое помещаются в один ряд на телефоне.","Пексесо 0.1.4 закрывает несовпавшую пару перед началом следующего хода.","В «Рыбе» подсветка запроса сохраняет заданную длительность, чтобы действие было видно при обычной скорости анимации."]},{"version":"0.16.1","changes":["Управление паками сохраняет положение списка при изменениях. Версии с сохранёнными партиями доступны для удаления с двойным подтверждением; можно удалить все старые версии или все паки. Связанные локальные и сетевые истории очищаются вместе с удалёнными версиями.","В «Моих партиях» появилась полная очистка локальных и сетевых сохранений с подтверждением.","Коллекция 0.5.1 обновляет Лудо до 0.1.5: выход с базы одним нажатием, раздельные старт и вход в дом, безопасные клетки со звёздами.","Акулина: публичная анимация закрытого обмена без значения карты, очки по порядку выхода. Пексесо: ошибки бота и передача хода без кнопки. Ятзи: стабильная высота строк и положение таблицы при действиях."]},{"version":"0.16.0","changes":["Стабильный выпуск с коллекцией 0.5.0 из 12 игр. Закрытые передачи Акулины видят только участники; публичный сброс пары сохранён.","PWA предлагает постоянную кнопку обновления и активирует новый shell после проверки всех открытых окон, сохраняя партии и offline-данные.","Флот Морского боя показан отдельными счётчиками по длине с красным нулём; оба поля центрируются в портрете и коротком landscape. Зоны действий всех игр проверены на стабильность при появлении кнопок.","Лудо завершает ход сразу после гарантированного выхода без шестёрки. В Ятзи можно освободить удержанный кубик до третьего броска; размер области управления не меняется. Аватары игровых паков используют общую светлую палитру."]},{"version":"0.15.0","changes":["Кубок занимает место лобби после завершения партии, включая ранние ходы её истории; новая партия возвращает лобби.","Общая кнопка добавления игрока в лобби и панели партии.","Прокрутка многострочной руки определяет контейнер отдельно для каждой оси, включая внешнюю панель игрока, недоступные элементы и чужой ход.","Паковые версии и форматы сетевых команд/сохранений не изменены. [Контракты и проверка](https://github.com/GraphGiraffe/boardgame-playroom/blob/637f7c34f9ba5635249329d3e617dde3bb762d9e/docs/RC17-TOOLBAR-AND-SCROLL.md).","Общий экран удаления локальных и сетевых партий с одинаковыми кнопками отмены/подтверждения.","Руку можно листать за любой элемент, включая недоступный для хода и во время чужой очереди; скролл не совершает действие.","Общий объект справа больше не сдвигает список соперников вниз в горизонтальном режиме.","Общий круглый счётчик фигур `pieces`; компактные карточки шашек без текстовых подписей стороны и количества.","Контракты и проверка: [RC16-INTERFACE](https://github.com/GraphGiraffe/boardgame-playroom/blob/637f7c34f9ba5635249329d3e617dde3bb762d9e/docs/RC16-INTERFACE.md). Stable и деплой отдельно.","Независимые ситуации UNO и таймеры каждого игрока; чужой ход больше не закрывает возможность обвинения.","Повтор сетевой команды только после ошибки доставки, один автоматический повтор с прежним ID, без двойного хода.","Центрированный переключатель «Локальная / Сетевая», значок игрока с плюсом, прокрутка справа от перетаскиваемых мест.","Видимая кнопка «Остановить и сохранить» у хоста; остановка ожидает сохранения принятого хода и сохраняет комнату.","Семь костей домино помещаются без горизонтального скролла; общий кубик снизу в портрете и справа в альбомной ориентации.","В архиве выделены все люди, игравшие с этого устройства. PWA проверяет целостность полного обновления и ждёт закрытия открытых вкладок.","Контракты, проверка и границы: [RC15-INTERACTIONS](https://github.com/GraphGiraffe/boardgame-playroom/blob/637f7c34f9ba5635249329d3e617dde3bb762d9e/docs/RC15-INTERACTIONS.md).","Общие окна с отдельной прокруткой, непрозрачной шапкой и анимациями под затемнением; лобби сохраняет фокус и положение прокрутки.","Сетевой ввод восстанавливается после закрытия окна и позднего ACK. Общие настройки и карточки продолжения; собственный ник в архиве выделен по сохранённой идентичности.","Остановка хостом сохраняет незавершённую партию и возвращает всех в лобби без разрыва RTC. Завершённые результаты каждый закрывает самостоятельно.","Компактные руки в истории, общий кубик Змей; независимые штрафы UNO по цели.","Звуковой handle 0 допустим; первый запуск ожидает Wasm, закрытие окна отменяет подготовку. Проверяемая упаковка приватного Pages ZIP с сохранением защиты.","Контракты и проверка: [RC14-INTERACTIONS](https://github.com/GraphGiraffe/boardgame-playroom/blob/637f7c34f9ba5635249329d3e617dde3bb762d9e/docs/RC14-INTERACTIONS.md).","Закрытие и восстановление лобби при продолжении Offline.","Возврат из меню в сетевую игру без разрыва RTC, отдельный полный выход.","Относительная рассадка и общие значки игровых статусов.","Проверки и ограничения: [RC13-NAVIGATION](https://github.com/GraphGiraffe/boardgame-playroom/blob/637f7c34f9ba5635249329d3e617dde3bb762d9e/docs/RC13-NAVIGATION.md)."]},{"version":"0.13.0","changes":["Приложение, движок и игровые паки разделены по ответственности и репозиториям.","Установка и обновление офлайн-паков через интерфейс, проверка API и сохранение прежних версий.","Партии и повторы привязаны к версии пака; старые сохранения прототипа используют 0.1.0.","Общие анимации и подсказки перенесены в core; специальные правила и раскладки принадлежат пакам.","Отдельные сборки: базовое приложение без игр и удобный HTML с пятью начальными паками.","Добавлен план документации и гайдлайнов авторов игр. Сетевой мультиплеер остаётся в плане."]}]};
const ASSET_SIZES=null; // Exact uncompressed payload sizes supplied by the builder.
const INTEGRITY=null; // Replaced by the PWA builder with public asset hashes.
const CORE=[
  './platform/web/account-profile-store.js',
  './app/diagnostics-ui.js',
  './platform/web/bug-report-attachments.js','./app/bug-report-ui.js',
  './platform/web/push-worker.js','./platform/web/push-device.js','./app/push-ui.js',
  './application/cloud-signaling.js','./application/connection-attempt.js','./application/online-connection.js','./application/transfer-peer.js','./app/network-social.js','./app/network-presence.js','./app/cloud-network.js','./app/lobby-network.js','./application/community-service.js','./app/group-ui.js','./platform/web/community-order-store.js','./app/community-order-ui.js','./app/community-ui.js','./platform/web/chat-notification-store.js','./app/ui-feedback.js','./app/chat-notifications.js','./application/quick-reactions.js','./app/quick-reactions.js','./app/quick-reactions.css','./application/room-chat.js','./app/chat-components.js','./app/conversation-search-ui.js','./app/game-chat-panel.js','./app/game-menu.js','./app/game-menu-021.css','./app/game-frame-021.css','./app/host-offer-021.css','./app/room-chat-ui.js','./app/chat-ui.js','./app/friend-profile-ui.js','./app/friend-card.js','./app/social.css','./app/group-021.css','./application/social-service.js','./platform/web/supabase-social.js','./app/social-ui.js','./app/account.css','./app/network-config.js','./application/account-service.js','./platform/web/supabase-auth.js','./app/account-ui.js',
  './app/first-turn-guide.css','./app/element-sizes.css','./core/mini-split-deck.js','./presentation/scene-contract.js','./core/size-tokens.js','./presentation/plan-player.js','./presentation/public-sequence.js','./platform/web/element-sizes.js','./platform/web/layout-guides.js','./application/player-settings.js','./platform/web/player-settings-store.js','./application/tutorial-controller.js','./platform/web/guide-preferences.js','./app/first-turn-guide.js','./app/tutorial-settings.js','./platform/web/action-reveal.js','./presentation/event-plan.js','./app/status-meter.js','./app/status-meter.css','./app/update-dialog.js',
  './platform/web/data-storage.js','./platform/web/storage-usage.js','./platform/web/pack-storage.js',
  './platform/web/interface-scale.js','./app/interface-scale.css','./app/mobile-surfaces.css','./app/conversation-021.css','./app/hub-shell-021.css','./app/catalog-filters-021.css','./app/result-021.css','./app/lobby-021.css','./app/context-choices-021.css','./app/room-context-021.css','./app/invite-021.css','./app/packs-021.css','./app/connection-021.css','./app/room-rules-021.css','./app/settings-021.css',
  './app/hub-presenter.js','./app/hub-action.js',
  './application/pack-update-cleanup.js',
  './core/messages.js','./core/character-styles.js','./core/avatars.js','./app/avatar-picker.js',
  './','./index.html','./manifest.webmanifest','./icons/playroom.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/badge-96.png','./installed-packs.js',
  './app/styles.css','./app/design-system.css','./app/game-interactions.css','./app/saved-games.css','./app/saved-021.css','./app/pack-manager.css','./app/lobby.css','./app/shared-views.css',
  './app/appearance.css','./app/appearance-models.js','./app/appearance-web.js','./app/appearance-ui.js',
  './core/ui.css','./core/input.css','./core/motion.css','./core/tooltips.css',
  './core/model-values.js','./core/events.js','./core/bot-difficulty.js','./core/model-runtime.js','./core/model-registration.js',
  './core/history.js','./core/session-codec.js',
  './core/random.js','./core/engine.js','./presentation/scheduler.js','./core/game-flow.js','./core/hand-overflow.js','./core/audio.js','./core/session.js','./core/protocol.js','./application/session-access.js','./core/command-processor.js','./core/authority.js','./core/component-assets.js','./core/game-components.js','./core/game-components.css','./core/standard-sounds.js','./core/token-layout.js','./core/ui.js','./core/player-target.js','./core/tag-registry.js','./core/tags.js','./platform/web/pack-loader.js','./core/packs.js','./core/input.js','./core/motion.js','./core/tooltips.js',
  './app/appearance-startup.js','./app/version.js','./app/views.js','./platform/web/request-deadline.js','./app/remote-catalog.js','./app/pack-manager.js','./application/library.js','./app/library.js','./application/rooms.js','./platform/web/identity-store.js','./app/multiplayer.js','./application/host-recovery.js','./platform/web/session-store.js','./app/network-client-history.js','./app/pairing.js','./app/acoustic-pairing.js' ,'./app/vendor/ggwave.js','./application/pwa-update-coordinator.js','./app/pwa.js','./app/qr.js','./app/vendor/qrcode.js','./app/vendor/LICENSE.qrcode','./app/vendor/jsqr.js','./app/vendor/LICENSE.jsqr','./app/qr-scanner.js','./application/client-connection-service.js','./app/session-client.js','./application/history-controller.js','./application/game-screen-controller.js','./platform/web/dom.js','./app/game-screen.js','./app/rulebook-view.js','./app/lobby-view.js','./app/game-feedback.js','./app/shared-views.js','./application/history-sync-service.js','./application/host-session-service.js','./app/pairing-presenter.js','./app/network-invitations.js','./app/nearby-view.js','./app/nearby-021.css','./app/network-ui.js','./app/app.js',
  './application/recovery-coordinator.js','./app/transports/webrtc.js','./app/transports/local.js'
];

function pairingTokenFromUrl(href){
  let url;try{url=new URL(href,self.location.href);}catch(_){return null;}
  const values=[url.searchParams.get('pair'),url.searchParams.get('protocol'),url.searchParams.get('text'),url.searchParams.get('url')];
  for(const raw of values){
    if(!raw)continue;let value=raw;try{value=decodeURIComponent(raw);}catch(_){}
    const match=String(value).match(/(?:PLAYROOM_PAIR:|web\+playroom:pair\/)?((?:PR2|PR3)\.[A-Za-z0-9_-]+)/);
    if(match)return match[1];
  }
  return null;
}
async function handoffPairing(token){
  const list=await self.clients.matchAll({type:'window',includeUncontrolled:false});
  if(!list.length)return false;
  for(const client of list)client.postMessage({kind:'playroom-pair-token',token});
  try{await list[0].focus();}catch(_){}
  return true;
}

// includeUncontrolled also returns other applications on the same origin.
// A waiting worker must check older builds, but only inside this app's scope.
async function applicationClients(){
  const scope=new URL('./',self.location.href);
  return (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>{
    const url=new URL(client.url);
    return url.origin===scope.origin&&url.pathname.startsWith(scope.pathname);
  });
}

async function validAsset(path,response){
  if(!response.ok||response.redirected)return false;
  const type=response.headers.get('content-type')||'';
  if(/\.(js|css)$/.test(path)&&type.includes('text/html'))return false;
  if(INTEGRITY?.[path]){
    const hash=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
    return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')===INTEGRITY[path];
  }
  return true;
}
const UPDATE_STATE='./__playroom-update-state__';
const SHELL=CORE.filter(path=>path!=='./');
let downloadFlight=null,downloadState=null;
let finishActivation;const activationFinished=new Promise(resolve=>{finishActivation=resolve;});
const updateFailure=(code,status=0)=>Object.assign(Error(code),{updateCode:code,status});
const stateCopy=()=>downloadState?{...downloadState}:null;
async function updateStatus(){
 if(downloadState)return stateCopy();
 const cache=await caches.open(CACHE),response=await cache.match?.(UPDATE_STATE);
 let saved;try{saved=await response?.json();}catch{}
 downloadState=saved&&saved.build===CACHE?{...saved,phase:saved.phase==='downloading'?'paused':saved.phase}:{phase:'available',received:0,savedBytes:0,completed:0,totalFiles:SHELL.length,total:SHELL.reduce((sum,path)=>sum+(ASSET_SIZES?.[path]||0),0)};
 return stateCopy();
}
async function broadcastUpdate(force=false){
 if(!downloadState)return;
 const data={kind:'playroom-update-progress',version:UPDATE_INFO.version,download:stateCopy()};
 for(const client of await applicationClients())try{client.postMessage(data);}catch{}
}
function networkFailure(error){return updateFailure(error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':self.navigator?.onLine===false?'offline':'network');}
async function downloadShell(){
 if(downloadFlight)return downloadFlight;
 const run=async()=>{
  let cache;try{cache=await caches.open(CACHE);}catch(error){downloadState={phase:'paused',received:0,total:0,completed:0,error:{code:error.name==='QuotaExceededError'?'quota':'storage'}};await broadcastUpdate();throw error;}
  const controller=typeof AbortController==='function'?new AbortController():null;let idleTimer=null,timedOut=false;
  const activity=()=>{if(controller&&typeof setTimeout==='function'){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{timedOut=true;controller.abort();},90000);}};
  const state=downloadState={phase:'downloading',stage:'preparing',received:0,downloadedBytes:0,savedBytes:0,reusedBytes:0,reusedFiles:0,completed:0,totalFiles:SHELL.length,total:0,totalSize:SHELL.reduce((sum,path)=>sum+(ASSET_SIZES?.[path]||0),0)};
  let queue=Promise.resolve(),lastReport=0,reportTimer=null;
  const persist=()=>{const value={...state,received:state.downloadedBytes,build:CACHE};queue=queue.catch(()=>{}).then(()=>cache.put(UPDATE_STATE,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})));return queue;};
  const report=async force=>{if(downloadState!==state)return;
   if(force||Date.now()-lastReport>=150||typeof setTimeout!=='function'){if(reportTimer!==null){clearTimeout(reportTimer);reportTimer=null;}lastReport=Date.now();await broadcastUpdate();}
   else if(reportTimer===null)reportTimer=setTimeout(()=>{reportTimer=null;if(downloadState===state&&state.phase==='downloading'){lastReport=Date.now();void broadcastUpdate().catch(()=>{});}},150-(Date.now()-lastReport));
  };
  const count=async response=>{let length=0;try{const reader=response.clone().body?.getReader();if(!reader){length=(await response.clone().arrayBuffer()).byteLength;state.received+=length;return length;}for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;state.received+=part.value.byteLength;activity();if(state.phase==='downloading')await report(false);}return length;}catch(error){throw networkFailure(error);}};
  const verified=async(source,path)=>{try{const value=await source.match?.(path);return value&&await validAsset(path,value)?value:null;}catch{return null;}};
  const workers=async(items,visit)=>{let cursor=0,failure;await Promise.allSettled(Array.from({length:4},async()=>{try{while(cursor<items.length&&state.phase==='downloading')await visit(items[cursor++]);}catch(error){failure??=error;state.phase='paused';controller?.abort();}}));if(failure)throw failure;};
  try{
   activity();await report(true);
   // Every candidate is complete and isolated. Other versions only supply bytes
   // whose SHA256 matches this candidate; no sequential patch installation.
   let keys=[];try{keys=typeof caches.keys==='function'?await caches.keys():[];}catch{}
   const sources=(await Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('playroom-pwa-')).map(key=>caches.open(key).catch(()=>null)))).filter(Boolean);
   const missing=[];
   await workers(SHELL,async path=>{
    let value=await verified(cache,path),copied=false;
    if(!value&&INTEGRITY?.[path])for(const source of sources){value=await verified(source,path);if(value){copied=true;break;}}
    if(value){
     if(copied)await cache.put(path,value.clone());
     const length=ASSET_SIZES?.[path]??(await value.arrayBuffer()).byteLength;
     state.savedBytes+=length;state.reusedBytes+=length;state.reusedFiles++;state.completed++;activity();await persist();await report(false);
    }else missing.push(path);
   });
   state.stage='downloading';state.total=missing.reduce((sum,path)=>sum+(ASSET_SIZES?.[path]||0),0);await persist();await report(true);
   await workers(missing,async path=>{
    let response;try{response=await fetch(path==='./index.html'?'./':path,{cache:'reload',...(controller?{signal:controller.signal}:{})});}catch(error){throw networkFailure(error);}
    if(!response.ok)throw updateFailure('http',response.status);
    if(response.redirected||/\.(?:js|css)$/.test(path)&&(response.headers.get('content-type')||'').includes('text/html'))throw updateFailure('response');
    const [length,valid]=await Promise.all([count(response),validAsset(path,response).catch(error=>{throw networkFailure(error);})]);if(!valid)throw updateFailure('integrity');
    if(state.phase!=='downloading')return;
    await cache.put(path,response);state.savedBytes+=length;state.downloadedBytes+=length;state.completed++;activity();await persist();await report(false);
   });
   state.phase='ready';state.received=state.downloadedBytes;state.total=state.downloadedBytes;await persist();await report(true);return stateCopy();
  }catch(error){
   state.phase='paused';controller?.abort();state.received=state.downloadedBytes;state.error={code:timedOut?'timeout':error.updateCode|| (error.name==='QuotaExceededError'?'quota':'storage'),status:error.status||0};
   try{await persist();}catch{}await report(true);throw error;
  }finally{if(idleTimer!==null)clearTimeout(idleTimer);if(reportTimer!==null)clearTimeout(reportTimer);}
 };
 downloadFlight=run();try{return await downloadFlight;}finally{downloadFlight=null;}
}
async function verifiedUpdate(){
 const state=await updateStatus();if(state.phase!=='ready')return false;
 const cache=await caches.open(CACHE);
 for(const path of SHELL){const response=await cache.match?.(path);if(!response||!await validAsset(path,response))return false;}
 return true;
}
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  // A candidate announces availability before fetching its application payload.
  // Fresh installations still prepare the offline shell as before.
  if(!self.registration?.active)await downloadShell();
  for(const client of await applicationClients())try{client.postMessage({kind:'playroom-update-ready',version:UPDATE_INFO.version});}catch{}
 })());
});
self.addEventListener('message',event=>{
 const kind=event.data?.kind;
 if(!['playroom-update-info','playroom-download-update','playroom-activate-update'].includes(kind))return;
 event.waitUntil((async()=>{
  const reply=result=>{try{event.ports?.[0]?.postMessage(result);}catch{}};
  if(kind==='playroom-update-info'){reply({...UPDATE_INFO,cache:CACHE,downloadProtocol:1,download:await updateStatus()});return;}
  if(kind==='playroom-download-update'){
   try{reply({ok:true,download:await downloadShell()});}catch{reply({ok:false,download:stateCopy()});}return;
  }
  if(!await verifiedUpdate()){
   if(event.data.manual){downloadState={...await updateStatus(),phase:'paused',error:{code:'incomplete'}};try{await(await caches.open(CACHE)).put(UPDATE_STATE,new Response(JSON.stringify({...downloadState,build:CACHE})));}catch{}await broadcastUpdate();reply({ok:false,reason:'Обновление загружено не полностью. Продолжите загрузку.'});return;}
   // Compatibility for an already running older app during its first transition.
   try{await downloadShell();}catch{reply({ok:false,reason:'Загрузка прервана. Повторите обновление.'});return;}
  }
    const clients=await applicationClients();
    const checks=await Promise.all(clients.map(client=>new Promise(resolve=>{
      const channel=new MessageChannel();let done=false;
      const finish=ok=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();resolve({id:client.id,ok});};
      const timer=setTimeout(()=>finish(false),3000);
      channel.port1.onmessage=message=>finish(message.data?.kind==='playroom-update-idle');
      try{client.postMessage({kind:'playroom-update-check'},[channel.port2]);}catch(_){finish(false);}
    })));
    const current=await applicationClients();
    if(current.some(client=>!checks.some(check=>check.id===client.id&&check.ok))){
      for(const client of current)client.postMessage({kind:'playroom-update-release'});
      reply({ok:false,reason:'Закройте другие окна ХОД или завершите в них игру и повторите обновление.'});return;
    }
    const approved=new Set(current.map(client=>client.id));
    reply({ok:true});await self.skipWaiting();
    // Old clients normally reload on controllerchange. Some mobile windows miss
    // it: after activation, navigate only still-existing, previously idle documents.
    // Keep this MESSAGE event alive; a delay inside ACTIVATE would delay activation.
    if(self.registration&&typeof setTimeout==='function'&&await activationFinished){
      await new Promise(resolve=>setTimeout(resolve,1200));
      await Promise.allSettled((await applicationClients()).filter(client=>approved.has(client.id)&&typeof client.navigate==='function').map(client=>client.navigate(client.url)));
    }
 })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE&&key.startsWith('playroom-pwa-'))await caches.delete(key);await self.clients.claim();})().then(()=>finishActivation(true),error=>{finishActivation(false);throw error;})));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/packs/'))return;
  if(event.request.mode==='navigate'){
    const pairToken=pairingTokenFromUrl(event.request.url);
    event.respondWith((async()=>{
      if(pairToken&&await handoffPairing(pairToken)){
        return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ХОД</title><body style="font-family:system-ui;padding:2rem">Приглашение передано в открытый ХОД. Это окно можно закрыть.</body>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
      const local=await (await caches.open(CACHE)).match('./index.html');if(local)return local;
      try{const response=await fetch(event.request);if(await validAsset('./index.html',response)){const cache=await caches.open(CACHE);await cache.put('./index.html',response.clone());return response;}
        if(response.redirected||!response.ok)return response;
        return await (await caches.open(CACHE)).match('./index.html')||response;}
      catch(_){return await (await caches.open(CACHE)).match('./index.html')||Response.error();}
    })());
    return;
  }
  event.respondWith((async()=>{const cache=await caches.open(CACHE),cached=await cache.match(event.request);if(cached)return cached;try{const response=await fetch(event.request);if(await validAsset('./'+url.pathname.slice(new URL('./',self.location.href).pathname.length),response)){await cache.put(event.request,response.clone());return response;}return Response.error();}catch(_){return Response.error();}})());
});
