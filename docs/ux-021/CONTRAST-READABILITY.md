# Измерение читаемости Light / Dark

2 ноября 2026. Read-only независимый дизайн-аудит: настоящее локальное приложение,
Chromium156.0.8078.47,390×844, safe fetch provider, native Supabase0/pageerrors[].
Тема изменялась через реальную галерею Apply. Исходники приложения не менялись.
Raw evidence: `tmp_files/ux-021/contrast-021/chromium-computed-before.json` и
после исправления `chromium-computed.json`.

## Первоначальные значения до исправления

Цвет текста получен getComputedStyle. Прозрачные backgrounds родителей составлены
в порядке рисования, CSS colors нормализованы canvas. Расчёт относительной яркости
в sRGB; решение не строится по сглаженным пикселям букв. Выбраны Games/Profile/
Settings,15 карточек и5 цветовых групп.126 DOM samples включают дополнительные
tags; часть находится ниже fold или скрыта текущей плотностью. Для всегда
показываемого числа игроков получен тот же диапазон, поэтому вывод не зависит
от включения скрытых дополнительных tags. Подложка active-tab создаётся pseudo
индикатором: его общий body-background ratio не используется в таблице как
точный контраст выбранной вкладки.

| Элемент | Font | Light foreground / background | Light ratio | Dark ratio |
|---|---|---|---|---|
| Названия15игр |14px/700|#263c36 /5pastel backgrounds|8.916–9.537|8.738–10.240|
| Число игроков и tags |11px/normal|#7c867a /5pastel backgrounds|**2.864–3.063**|5.579–6.538|
| Tagline |13px/normal|#7c867a /#f3f0e7|**3.322**|11.767|
| Имя профиля |15px/700|#263c36 /#f3f0e7|10.342|18.429|
| Статус личности |12px/normal|#7c867a /#f3f0e7|**3.322**|11.767|
| Подписанный пункт профиля |14px/700|#263c36 /#f3f0e7|10.342|18.429|
| Label настройки |13px/normal|#263c36 /#f3f0e7|10.342|18.429|
| Версия/secondary в настройках |12px/normal|#7c867a /#f3f0e7|**3.322**|11.767|

Light backgrounds карточек: #dbe9e8/#e2ead7/#e5dfee/#f1dcd0/#f1e7c7.
Dark: #2b414b/#304536/#3d344e/#4b4228/#4c352f, secondary #bbc5b5,
canvas#000 и primary#f3f0e7.

Для обычного информативного текста ориентир4.5:1;3:1 относится к действительно
крупному тексту.11/12px metadata под исключение large text не попадает.
Это не декоративные подписи: владелец отдельно повысил приоритет count/tags.
Источник критерия и указание использовать underlying colors:
[W3C Understanding Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
Это конкретное измерение выборки, **не WCAG certification приложения**.

## Рекомендация без смены базовой палитры и артов

Оставить все backgrounds, арты, основные ink и Dark secondary. Для важного
малого текста Light нужен один semantic readable-secondary slot вместо нынешнего
слабого muted. Его можно получить из существующих ink/paper:

```css
/* Light mapping; Dark продолжает использовать существующий secondary. */
--text-secondary-readable: color-mix(in srgb, var(--ink) 80%, var(--paper));
```

Для текущих Light tokens получается около#4f6059. На показанной выборке его
контраст5.044–5.851:1. Это производный тон существующей семьи, не новая палитра
или новый арт. Если важно вообще не вводить новый цвет, использовать существующий
opaque `--ink` для необходимых маленьких count/tag/status; иерархию сохранять
размером и весом. Не применять opacity к текстовому контейнеру: это снова снизит
итоговый контраст. Декоративный muted и disabled не нужно механически превращать
в primary. Нормальные информационные подписи не считать disabled ради исключения.

11px даже после исправления контраста остаётся мелким. Следующий ограниченный шаг:
малые информативные подписи12–13px в shared relative text tokens, с повторной
проверкой существующего каталога15игр/3колонок/обеихориентаций. Не увеличивать все
отступы и игровые координаты вместе с текстом; адаптивные строки/переносы должны
оставаться компактными. Для типографики web.dev рекомендует relative базовые размеры
и ограниченный набор вариаций:
[web.dev Typography](https://web.dev/learn/accessibility/typography).

## Text-size граница доказательства

В отдельной CSS root-font simulation корень изменён16→32px. Computed body остался
16px, card title14px, metadata11px; horizontal overflow не возник. Это показывает,
что эти slots сейчас привязаны к px, а не масштабу корня. Это **не** проверка native
iOS/Android font preference,200% browser zoom или доказанный провал SC1.4.4.

Рекомендация: переносить в rem базовый UI текст и его semantic slots постепенно,
вместе с reflow соответствующих карточек/форм; уменьшение плотности при большом
тексте допустимее обрезки. Точные игровые размеры/руки/поле сохраняют свой отдельный
адаптивный механизм. Массовый typography rewrite или возврат ручного scale slider
из этого измерения не следует.


## Повтор после canonical token fix

Root изменил один canonical Light text.secondary на#4f6059 и штатно регенерировал
appearance models; Dark/backgrounds/arts/primary сохранены. Собственная повторная
actual browser выборка снова126DOMsamples/6groups, errors[]/native0. Runtime
foreground действительно стал rgb(79,96,89), не остался старым после генерации.

Light players/tags на карточках теперь не ниже5.044:1; body secondary/tagline/
profile status/settings version5.851:1. Dark остался прежним: metadata минимум5.579,
bodysecondary11.767. Выявленный конкретный contrast defect на этих поверхностях
закрыт. Canonical property check root охватывает8app/card surfaces обеих тем;
он дополняет, а не заменяет эту actual UI выборку. Это по-прежнему не аудит всех
цветов/состояний приложения и не WCAG certification.

Root-font simulation после исправления контраста намеренно не меняет fonts:
body16/title14/meta11 остаются px. Рекомендация relative text slots сохраняется
как отдельная работа при доказанном UX/reflow требовании; изменение всех физических
игровых пикселей вrem из этих данных не следует.
