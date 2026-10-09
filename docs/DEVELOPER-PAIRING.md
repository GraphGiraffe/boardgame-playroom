# Сопряжение устройств: WebRTC SDP, PR2/PR3, QR, звук и IP (RC6)

[← Индекс](DEVELOPER-INDEX.md) · [Сеть и reconnect](DEVELOPER-MULTIPLAYER.md) · [Архитектура](DEVELOPER-ARCHITECTURE.md) · [UI](DEVELOPER-UI.md) · [Тесты](DEVELOPER-WORKFLOW.md)

**Ключевая граница:** pairing — это доставка двух сообщений `Offer/Answer` для установления **WebRTC DataChannel**. После этого все команды, состояния лобби и ходы идут по RPC внутри WebRTC, **не** по QR/динамику. RC6 **не вводит PR4**: возвращение участника удостоверяется отдельным RPC `resume` и приватным токеном **после** соединения ([подробно](DEVELOPER-MULTIPLAYER.md)).

## 1. Сигнальный объект до упаковки

Источник — `app/transports/webrtc.js:serializeDescription`, интерфейс:

```json
{
  "v": 1,
  "type": "offer",
  "sdp": "v=0\r\n...a=ice-ufrag:...\r\n...",
  "pairingId": "UUID_OF_THIS_WEBRTC_PAIRING"
}
```

`type` = `offer`/`answer`. `pairingId` генерируется хостом при `createHostPeer`, копируется клиентом в Answer; `acceptAnswer` отклоняет ответ от другого приглашения. `pairingId` не является `roomId`, `profileId`, `sessionId` или секретом возврата.

`W.createHostPeer` создаёт `RTCPeerConnection({iceServers:[]})` и ordered DataChannel; ждёт ICE gathering до 8 секунд. `W.createClientPeer` принимает Offer, выполняет `setRemoteDescription`/`createAnswer`/`setLocalDescription`; после возвращённого Answer хост тоже делает `setRemoteDescription`. Реальный RTC устанавливает DTLS между двумя устройствами по доступным сетевым интерфейсам.

## 2. PR2 — полный совместимый формат

`app/pairing.js` экспортирует `PlayroomPairing`:

- `TOKEN_PREFIX='PR2.'`;
- `encode({v:2,kind:'offer'|'answer',signal})` → JSON → UTF-8 → Base64URL без padding → `PR2.<payload>`;
- `decode(token)` → тот же JSON;
- `fromSignal(kind,signal,{legacy:true})` явно выбирает PR2; автоматически используется fallback, если компактный PR3 не удаётся создать (нет допустимого IPv4/поддерживаемого ICE/DTLS).
- PR2 хранит **полную строку SDP**, включая все кандидаты, поэтому QR/текст заметно длиннее, но для сложной топологии это честный запасной вариант.

PR2 не содержит прав игрока или состояния партии. Старые QR/ссылки остаются распознаваемыми.

## 3. PR3 — бинарный компактный формат, тот же для всех каналов

`PlayroomPairing.fromSignal('offer'|'answer',signal,{address,port})` пробует `PlayroomAcousticPairing.pack`; при успехе возвращает `PR3.<base64url>`. Сам `base64url` без текстового префикса — **точно те же байты/символы, которые кодирует ggwave в звуковую волну**. QR, `web+playroom:`, HTTPS-ссылка, Share и текст передают PR3 **без изменения содержимого**.

`app/acoustic-pairing.js` использует binary-frame версии 1. Все смещения — **в байтах от нуля**:

| Смещение | Размер | Содержимое |
| ---: | ---: | --- |
| 0–1 | 2 | Магия ASCII `PR` (`0x50 0x52`) |
| 2 | 1 | Binary version = `1` |
| 3 | 1 | `1=offer`, `2=answer` |
| 4 | 1 | исходный pairingId был UUID с дефисами (`0`/`1`) |
| 5–8 | 4 | единственный IPv4 адрес кандидата (4 octets) |
| 9–10 | 2 | UDP port (big-endian) |
| 11–14 | 4 | ICE priority (big-endian uint32) |
| 15 | 1 | длина `ice-ufrag` |
| 16 | 1 | длина `ice-pwd` |
| 17–32 | 16 | pairingId (UUID binary) |
| 33–64 | 32 | DTLS SHA-256 fingerprint |
| 65+ | переменно | сначала ASCII `ice-ufrag`, потом ASCII `ice-pwd` |

`HEADER=65`. `pack` проверяет fingerprint (`sha-256`), ICE credentials и выбранный IPv4/порт, затем Base64URL; максимум 140 ASCII-символов **без `PR3.`** (то есть до 144 вместе с префиксом). `unpack` валидирует размеры, magic/version/kind, восстанавливает минимальный SDP с ICE credentials, fingerprint, `a=setup`, `sctp-port:5000` и **одним** `a=candidate:... typ host`. Для этого формата кодирования нужны IPv4, UDP, component 1, host candidate.

**Ограничение:** PR3 хранит только один IPv4 UDP host-кандидат, а не всё исходное SDP. Он не предназначен для полноценной передачи всех маршрутов relay/srflx/TCP/IPv6/mDNS. При невозможности компактного кодирования `fromSignal` возвращает PR2. Указание правильного IP вручную может позволить создать PR3, но **не гарантирует**, что UDP-маршрут реально достижим при VPN/firewall/NAT.

## 4. Три формы ссылки и доставка токена

Один `token` (PR2/PR3) представляется разными оболочками:

```text
PR3.<base64url>                      # bare pairing token
PLAYROOM_PAIR:PR3.<base64url>        # маркер в тексте Share
web+playroom:pair/PR3.<base64url>    # локальный custom protocol
https://.../?pair=PR3.<base64url>    # HTTPS PWA / ссылка
```

Методы `app/pairing.js`: `protocolUrl`, `shareText`, `extract`, `decode`. `app/pwa.js:pairingUrl` выдаёт `?pair=` при HTTP(S), а для `file:/content:` использует `web+playroom:`. `PWA.subscribePair` уведомляет `network-ui.js:handleIncomingPair`; сервис-воркер (`sw.js:pairingTokenFromUrl/handoffPairing`) может передать пришедший токен уже открытому окну PWA через `postMessage`.

`signalFromInput(value,expected)` в `network-ui.js` понимает URL/маркер/голый PR2/PR3, проверяет `expected='offer'|'answer'`, извлекает `signal`; если токена нет, допускает сырой сериализованный WebRTC сигнал как fallback.

## 5. Встроенный QR: генерация

`app/qr.js` — `PlayroomQR.render(element,value,{level:'L',cellSize:4,margin:4})`. QR создаёт **вендоренный** `app/vendor/qrcode.js` (MIT) через `qrcode(0,level)` → `addData(value,'Byte')` → `createSvgTag`, результат записывается в `#net-host-token-qr` или `#net-client-token-qr`. В RC6 внешний CDN **не нужен**.

`network-ui.js:updatePairingToken(role)` берёт актуальный `W.offer`/`W.answer` и выбранный IP/port, вызывает `Pairing.fromSignal` и синхронно обновляет текстовое поле и QR. При смене сетевого адреса не должно оставаться старого QR с другим SDP.

**UI:** кнопка «Скопировать ссылку» вызывает `navigator.clipboard.writeText`, но в `content://` браузер может запретить clipboard. Это диагностированный fallback, а не сбой протокола.

## 6. Встроенный QR: чтение фото (главная функция RC6)

`network-ui.js:scanControls(role)` вставляет две кнопки в диалог хоста и гостя:
- `input type=file accept=image/* capture=environment` — системная камера (после фотографирования возвращает файл);
- `input type=file accept=image/*` — галерея;
- `document change` → `readPairingQR(file,role)`.

`app/qr-scanner.js` экспортирует `PlayroomQRScanner`:

1. `readImage` валидирует image MIME, размер `0 < size <= 20 MiB`, читает через `createImageBitmap` или `Image`/`blob:` URL.
2. `scan` создаёт Canvas, масштабирует изображение до 1800 px по длинной стороне, при необходимости делает второй проход до 3000 px; ограничивает площадь оригинала 36 MP.
3. По возможности `BarcodeDetector({formats:['qr_code']}).detect(canvas)`. Если он отсутствует, не работает или не прочёл код — локальный `app/vendor/jsqr.js` (Apache-2.0) сканирует `ImageData` с `inversionAttempts:'attemptBoth'`.
4. `parsePayload` извлекает токен через `PlayroomPairing.extract` и валидирует PR2/PR3 через `decode`.
5. Хост ожидает **`answer`** и вызывает `acceptAnswerSignal`; гость ожидает **`offer`** и вызывает `createClientAnswer`. Неверный тип или чужой QR отклоняется с ошибкой, можно повторить фото.

**Не требуется** распознавание QR приложением камеры производителя, `getUserMedia` или микрофон. Физически проверено пользователем чтение фотографии из Android `content://` на отдельной автономной тестовой HTML-странице, но поддержку нужно проверять на новых устройствах/браузерах. Не отправлять изображение в интернет.

## 7. Акустический канал ggwave

`app/vendor/ggwave.js` содержит JS+WASM; `app/acoustic-pairing.js` реализует `play(base64url,{protocol:'fastest'|'fast'|'normal'})` и `listen(onPacket)`. Звук передаёт только компактный пакет SDP; **сами игровые данные никогда не идут по звуку**. При расшифровке `unpack` принимает того же `PR3` payload, что QR и текст.

- `fastest` по умолчанию; `fast`/`normal` доступны вручную. AudioContext воспроизводит waveform через динамик.
- `listen` использует `navigator.mediaDevices.getUserMedia({audio:...})`, `ScriptProcessorNode`, PCM decode; микрофон останавливается при закрытии диалога.
- `microphoneIssue` явно объясняет отказ в `content://`, небезопасный origin или отсутствие API. `NotAllowedError/Permission denied` и отсутствие/занятость микрофона дают диагностические сообщения.
- Хост может выбрать **только отправить Offer звуком** (не вызывая микрофон), а получить Answer по QR/Share/вводу.
- Для двустороннего звука требуются разрешение микрофона и подходящий браузерный контекст; рекомендуется HTTPS PWA. Для обычного QR-фото этого условия нет.

Расширенные ограничения: [ACOUSTIC-PAIRING](ACOUSTIC-PAIRING.md).

## 8. Выбор IP и ICE-кандидатов

`PlayroomAcousticPairing.allCandidates(signal)` парсит `a=candidate` из SDP (host/srflx/prflx/relay, IPv4/IPv6/mDNS, UDP/TCP) для показа пользователю. `probeAddresses` делает **дополнительную** RTCPeerConnection-проверку без STUN и по возможности `getStats()`; адреса источника `probe/stats` **не доказывают**, что этот маршрут уже присутствует с пригодным портом в текущем Offer.

В `network-ui.js` `soundCandidates` объединяет `active`/`scannedCandidates`/`savedIpEntries`; варианты подписываются `источник/IP/порт/тип`. Приоритет `192.168.x.x`, затем частные сети; окончательный выбор пользователя. `playroom.acoustic-known-addresses.v1` содержит только **добровольно** сохранённые адреса и не считается сетью устройства.

- Исключены неопределённые адреса `0.0.0.0`, `::` и полностью нулевая IPv6.
- `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` — TEST-NET, **не** LAN; нельзя выбирать для компактного подключения.
- Если браузер скрывает реальный IP за mDNS или VPN, пользователь может задать настоящий локальный IPv4; `pack` возьмёт порт текущего ICE-кандидата и явно заданный IP.
- `RTCPeerConnection({iceServers:[]})` не предоставляет STUN/TURN relay для произвольных WAN/NAT. VPN может блокировать локальный UDP даже при правильном IP.
- Ограничения приватности Chrome/Android/`content://` могут дать неполный список; не обещать полный перечень физических интерфейсов.

## 9. Компактный интерфейс pairing после RC7 (PR #28)

В `app/network-ui.js` все три экрана используют одинаковую сетку из методов **Поделиться → Звук → QR → Текст**: приглашение хоста (`host-offer`), принятие приглашения (`client-join`), ответ гостя (`client-answer`). Доступные способы показаны сначала и раскрыты, недоступные помещаются в отдельный закрытый список «Недоступные способы». Свёрнутые методы остаются доступными для настройки, но нельзя выдавать недоступную функцию за работающую кнопку.

- `pairingMethods()` и `methodAvailability()` определяют порядок и доступность. `syncPairingAvailability()` меняет её после выбора IP/PR3 без повторного создания PeerConnection. Исходный `RTC Offer/Answer`, `pairingId` и существующие `data-net-*`/`net-*-token` идентификаторы не меняются.
- `Поделиться` у отправителя доступно при `navigator.share`, а у получателя как автоматический импорт — при защищённой установленной PWA. Открытие HTTPS-ссылки в браузере остаётся возможным независимо от статуса Share Target.
- `Звук`: отправка требует динамика/ggwave и **реального** компактного PR3; приём — `getUserMedia`/микрофона, безопасного контекста и звукового модуля. Хост имеет три отдельные кнопки: передать+слушать, передать, слушать. Вложенные «Настройки звука и сети» по умолчанию свернуты: выбор IP, ручной IPv4 с сохранением `💾` рядом, UDP-порт, протокол и повторный поиск. При вводе ручного IP блок не переносится между списками прямо в событии `focusout`, чтобы не потерять click на `💾`.
- `QR` на хосте начинается с **QR Offer**, затем кнопки камеры и галереи для получения Answer. На клиенте при входе доступны камера/галерея для Offer; на экране ответа показывается QR Answer. Для длинного PR2 QR остаётся увеличенным. Асинхронные генерации QR применяются только если их запрос всё ещё последний: нельзя показывать QR со старым IP.
- `Текст` — самостоятельный блок, а не «fallback»: ссылка/копирование на исходящих экранах, поле с ручным входящим Offer/Answer на нужном экране.
- `pairingHeader()` добавляет доступную с клавиатуры справку `?` прямо в модальное окно, **не уничтожая соединение и поля ввода**. В ней отдельные разделы по всем методам, причинам недоступности, IP/PR2/PR3, микрофону/content://. Короткая заметка о HTTPS/PWA — внизу. Основные действия лишены длинных объяснений.

**Тесты:** `tests/pairing-methods-browser.test.cjs` проверяет порядок/доступность, свёрнутую справку, ручной IP с сохранением, QR выше кнопок и компоновку при 320 px через Chromium без сетевого сервера. Реальный двухбраузерный pairing дополнительно проверяют `network-main-app`, `network-reconnect-browser`, `qr-pairing-browser`; для ручного IP эти E2E явно раскрывают вложенные настройки.

## 10. Примеры задач и тестов

| Изменение | Где и что проверить |
| --- | --- |
| QR не рисуется без сети | `app/qr.js`, `app/vendor/qrcode.js`, `index.html` и offline PWA |
| Фото читает не тот тип | `app/qr-scanner.js` / `readPairingQR(role)`, `tests/qr-pairing-browser.test.cjs` |
| PR2 вместо PR3 | `Pairing.fromSignal` → `Acoustic.pack`, IP/ICE priority/port, `tests/pairing.test.cjs` |
| Нет connection после обмена QR | `createHostPeer/createClientPeer`, `pairingId`, `waitIce/waitOpen`, `tests/acoustic-webrtc-browser.test.cjs` |
| Ошибка микрофона | `microphoneIssue`, HTTPS/PWA, `tests/acoustic-pairing.test.cjs` |
| Возвращающийся игрок получает неверную руку | Не QR: `RoomService.resume`, `hostPeerServing`, `SessionAuthority.connect(viewer)` — [сеть](DEVELOPER-MULTIPLAYER.md) |

Для полного цикла (два браузера, фотографии QR, возврат в UNO) см. [DEVELOPER-WORKFLOW](DEVELOPER-WORKFLOW.md) и [QR-PAIRING-AND-RESUME](QR-PAIRING-AND-RESUME.md).
