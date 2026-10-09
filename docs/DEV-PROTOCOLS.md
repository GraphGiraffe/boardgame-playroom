# Контракты RC6: JSON, PR3/PR2, RTC RPC, события и версионирование

[← Оглавление](DEVELOPMENT.md) · [WebRTC/QR](DEV-NETWORK.md) · [Identity](DEV-RECONNECT.md) · [Session/движок](DEV-GAMEPLAY.md) · [Storage](DEV-STORAGE-PACKS.md)

Форматы перечислены по **действующим serializer/parser**: [`app/pairing.js`](../app/pairing.js), [`app/acoustic-pairing.js`](../app/acoustic-pairing.js), [`app/transports/webrtc.js`](../app/transports/webrtc.js), [`app/multiplayer.js`](../app/multiplayer.js), [`core/protocol.js`](../core/protocol.js), [`core/authority.js`](../core/authority.js), [`core/session.js`](../core/session.js).

Примеры ниже показывают **структуру**, не действующие токены или секреты. Нельзя сохранять реальные private ICE credentials или `resumeToken` в документацию/логи.

## 1. Сырой сигнал WebRTC — формат `v:1`

`W.serializeDescription` сериализует локальный WebRTC SessionDescription:

```json
{
  "v": 1,
  "type": "offer",
  "sdp": "v=0\r\n...a=ice-ufrag:...\r\n...",
  "pairingId": "example-id"
}
```

`type` бывает `offer` или `answer`. `pairingId` — nonce **сопряжения двух SDP**, не id профиля/комнаты. `W.parseSignal(value,expected)` проверяет формат/type; хост в `acceptAnswer` сравнивает `pairingId` с текущим Offer. После применения описания браузер сам устанавливает ICE/DTLS/SCTP RTCDataChannel. `createHostPeer` по умолчанию создаёт упорядоченный DataChannel label `playroom`, `iceServers:[]`, ждёт конца ICE gathering.

## 2. Текстовый `PR3` и fallback `PR2`

Общая фабрика — `PlayroomPairing.fromSignal(kind,signal,{address,port,legacy})`:

**`PR3.<base64url>`:** короткое текстовое представление **того же бинарного frame**, который воспроизводит ggwave. Без текстового `PR3.` звуковой канал отправляет только Base64URL. В frame хранятся один IPv4 UDP host IP/порт/priority, ICE ufrag/pwd, SHA-256 DTLS fingerprint и идентификатор сопряжения. **Нет никнейма, `Profile.id`, `participantId`, `seatId`, `resumeToken`, карт или действий.** Служебный адрес TEST-NET нельзя использовать как валидную LAN-цель.

| Байтовый offset | Размер | Значение |
| --- | ---: | --- |
| 0–1 | 2 | ASCII `PR` (magic байты 80, 82) |
| 2 | 1 | Binary version = `1` (НЕ номер `PR3`) |
| 3 | 1 | `1=offer` / `2=answer` |
| 4 | 1 | Форма UUID с дефисами (0/1) |
| 5–8 | 4 | IPv4 октеты |
| 9–10 | 2 | UDP port, big-endian |
| 11–14 | 4 | ICE candidate priority, big-endian |
| 15, 16 | 1 + 1 | Длины ICE ufrag и ICE password |
| 17–32 | 16 | Pairing UUID/идентификатор (16 байт) |
| 33–64 | 32 | DTLS SHA-256 fingerprint |
| 65 … | N + M | ASCII ICE ufrag, затем ICE password |

`Acoustic.pack` требует подходящий `host`/`udp`/component 1 (либо явный допустимый ручной IPv4 с портом текущего сеанса), проверяет размеры и `MAX_AUDIO_TEXT=140`. `Acoustic.unpack` восстанавливает **совместимый SDP с фиксированной структурой datachannel**, `a=ice-ufrag`, `a=ice-pwd`, `a=fingerprint`, `a=sctp-port:5000` и одним `host` кандидатом. Это не «полный оригинальный SDP»; реконструкция сознательно ограничена этим типом ICE.

**`PR2.<base64url>`** — legacy/fallback: URL-safe Base64 от UTF-8 JSON-конверта `{v:2,kind:'offer'|'answer',signal:'<полный v1 WebRTC JSON>'}`. Используется для несовместимых условий компактного IPv4/SDP (например, только mDNS/IPv6 или нестандартный DTLS fingerprint). `PlayroomPairing.decode` принимает PR2 и PR3; `extract` достаёт оба типа из `PLAYROOM_PAIR:<token>`, `web+playroom:pair/<token>`, `?pair=<token>` и текста. Смена формата PR3 на PR4 **не нужна** для идентификации гостя: `resume` идёт отдельным RTC RPC.

## 3. QR, URL, системное Share

QR генератор получает `PWA.pairingUrl(token)`:

- `http(s)://<origin>/?pair=PR3.…` для серверной/PWA версии;
- `web+playroom:pair/PR3.…` для локального `file:/content:`, когда обычной HTTPS-ссылки нет;
- PR2 поддерживается в тех же оболочках.

`PlayroomQRScanner.scan(file)` получает **фотографию**, распознаёт текст QR и вызывает `PlayroomPairing.extract/decode`. Возвращает примерно `{v:3,kind,signal,compact:true,ip,port,token,width,height,method}` для PR3; PR2 не обязан иметь `compact/ip/port`. Нельзя считать QR payload сразу безопасным state — он проходит decode и проверку направления (Offer/Answer).

## 4. JSON поверх RTCDataChannel — handshake и RPC

`WebRTC.serve` и `WebRTC.client` обмениваются строками `JSON.stringify(message)` (никакой protobuf/сжатия игровых snapshot в этом протоколе):

```json
{"kind":"hello","version":1}
{"kind":"transport-ready","version":1}
{"kind":"request","requestId":1,"method":"snapshot"}
{"kind":"request","requestId":2,"method":"dispatch","value":{"type":"join","nickname":"Гость"}}
{"kind":"request","requestId":3,"method":"history","value":4}
{"kind":"response","requestId":2,"result":{"ok":true,"snapshot":{"kind":"lobby","room":{},"participantId":"guest-id"},"resumeToken":"<PRIVATE_HEX>"}}
{"kind":"snapshot","snapshot":{"kind":"snapshot","protocolVersion":1}}
```

**Уточнения:**
- `requestId` — integer и ключ только **текущего транспорта**. `client` разрешает обещание соответствующим `response`; при истечении тайм-аута удаляет pending запрос.
- `method` — `snapshot`, `dispatch`, `history`. Дополнительные команды лобби/игры помещаются в `value` метода `dispatch`; новый сетевой метод требует обновления обеих сторон.
- `RoomService.connection.snapshot()` до входа отдаёт `{kind:'room-preview',room:RoomService.preview(roomId)}` без участника; после входа — `{kind:'lobby',room:RoomService.snapshot(roomId),participantId}`.
- `dispatch({type:'join',nickname})` выдаёт приватный `resumeToken`, `dispatch({type:'resume',participantId,resumeToken})` после проверки выдаёт **новый** приватный токен и `resumed:true`. Они не входят в `room snapshot`.
- Прочие лобби RPC: `{type:'rename',nickname}`, `{type:'claim-seat',seatId}`, `{type:'spectator'}`, `{type:'ready',ready}`. `RoomService.connection` отвергает их до join/resume. Хостовые `kick`/`updateRules` доступны через хостовый доверенный объект, не RPC гостя.
- При ошибке `serve` отправляет `{kind:'response',requestId,error:'Запрос не выполнен.'}` без внутренних деталей. Для диагностики смотреть host и client debug.

## 5. Room/Participant/Seat — сериализуемая модель

`RoomService.create` заполняет room:

```json
{
  "id": "room-uuid",
  "code": "4567",
  "name": "Комната",
  "phase": "lobby",
  "revision": 1,
  "lobbyRevision": 1,
  "rulesRevision": 1,
  "ownerId": "host-profile-id",
  "hostMode": "player",
  "game": {"id": "uno", "name": "UNO", "version": "0.2.1"},
  "rules": {"preset": "standard", "presetLabel": "Название", "openHands": false, "options": {}, "display": []},
  "constraints": {"min": 2, "max": 4, "allowed": null},
  "participants": [
    {"id": "host-profile-id", "nickname": "Хост", "role": "player", "seatId": "seat-1", "ready": false, "connected": true, "isHost": true, "joinedAt": 0}
  ],
  "seats": [
    {"id": "seat-1", "index": 0, "color": {"value": "#587d5d", "label": "Зелёный"}, "participantId": "host-profile-id"}
  ],
  "createdAt": 0, "updatedAt": 0, "eventSequence": 0, "events": [], "countdownEndsAt": null
}
```

*Иллюстративная схема: реальные значения `game.version`/`preset`/`constraints`/timestamps зависят от конкретного пакета и выбранной комнаты; счётчик событий обновляется при `_emit`.* `phase` меняется `lobby → starting → playing` (код также проверяет `closed`). `room.events[]` — история **лобби**, **не** полный журнал игровой `TabletopSession`.

`Seat` связывается с `participantId`; `viewer` в игровой authority вычисляется при старте по `seats`, отсортированным по `index`. Секретные `resumeTokens` и `connectionLeases` находятся отдельно в приватных Map хоста.

## 6. Команда игры (`PlayroomProtocol v1`)

После старта `SessionClient.send(action)` создаёт:

```json
{
  "protocolVersion": 1,
  "sessionId": "session-id",
  "authorityEpoch": "epoch-id",
  "commandId": "command-uuid",
  "expectedRevision": 8,
  "action": {"type": "play", "card": "example-card-id"}
}
```

`action` — произвольный JSON-объект из допустимых ходов **конкретного пака**, приведён лишь пример. `PlayroomProtocol.validate` разрешает только перечисленные верхнеуровневые поля, ограничивает сериализованную команду **16 KiB**, проверяет IDs и revision. `SessionAuthority._dispatch`:
1. проверяет закрытое соединение, версию и схемы;
2. сравнивает `sessionId` и `authorityEpoch`;
3. определяет `actor` из **привязанного binding.viewer`, не из данных команды**;
4. до проверки ревизии ищет `receipts` по `viewer:commandId` для идемпотентного повтора в той же authority; проверяет canonical signature;
5. проверяет ожидаемую ревизию/легальность, применяет действие, возвращает ACK и новую `snapshot`.

Типичный ответ на игровую команду: `{ok:true,code:'OK',commandId,revision,snapshot}`; при ошибке: `{ok:false,code,message,commandId,revision,snapshot?}`. Возможные коды: `BAD_COMMAND`, `WRONG_SESSION`, `WRONG_EPOCH`, `READ_ONLY`, `STALE`, `ILLEGAL`, `ID_CONFLICT`, `CLOSED`, `BUSY`, `RECEIPT_LIMIT`. Ограничение receipts в authority по умолчанию `20000`.

### Проецированный `snapshot/history` игры

`SessionAuthority._snapshot(viewer,index)` выдаёт:

```json
{
  "protocolVersion": 1,
  "kind": "snapshot",
  "sessionId": "session-id",
  "authorityEpoch": "epoch-id",
  "revision": 8,
  "game": "uno",
  "packVersion": "0.2.1",
  "viewer": 1,
  "audience": "player",
  "state": {"version": 1, "game": "uno", "data": {}, "events": []},
  "actions": [],
  "events": [],
  "historyLength": 9,
  "cues": [],
  "effects": []
}
```

`kind='history'` для исторического кадра; `viewer=-1` и `audience='public'` для открытого стола. В `state` находятся только поля whitelist authority, причём `data` — уже результат `Core.project`. Для historical snapshot `actions=[]`, `cues/effects=[]`. `SessionClient.accept` отбрасывает устаревшие ревизии и несовместимые ``sessionId/epoch`.

## 7. Сохранённая Session — два формата

`TabletopSession.serialize({compact:false})` даёт читаемый `{format:'playroom-session',version:1,game,packVersion,options,createdAt,updatedAt,states:[...] }`. `serialize()` по умолчанию — `version:2` / `encoding:'interned-json-v1'`: `nodes` описывают повторяющиеся JSON-поддеревья, `states` и `journal` — ссылки на них, `options` закодированы тем же interned codec. `Session.restore` проверяет оба формата, точную версию пака, ход/состав/историю и запрещает неконсистентный timeline.

`app/library.js` добавляет `libraryId` к сериализованному JSON активной/архивной локальной партии. Это **не** формат сохранения действующей сетевой authority при перезапуске хоста — такой durable host persistence пока не реализован.

## Изменения контрактов

PR3 и версии игровых паков не повышать «за компанию» с новым UI. Новое поле `state`/команды/room должно иметь:
1. владельца (host/client/pack) и направление передачи;
2. явный version/migration plan;
3. whitelist приватных полей и проверку старых сохранений;
4. отрицательные тесты: stale token, wrong viewer, wrong pairing kind, malformed QR, cross-origin/tab profile.

Тесты: [`tests/pairing.test.cjs`](../tests/pairing.test.cjs), [`tests/acoustic-pairing.test.cjs`](../tests/acoustic-pairing.test.cjs), [`tests/webrtc-transport.test.cjs`](../tests/webrtc-transport.test.cjs), [`tests/authority.test.cjs`](../tests/authority.test.cjs), [`tests/session.test.cjs`](../tests/session.test.cjs).
