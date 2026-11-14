# Общая навигация: выделение и бейдж в обеих ориентациях

02.11.2026. Независимая проверка заполненных A04 выявила общий дефект: в landscape
pill оставался под «Игры», а счётчик «Моих партий» не имел своего якоря. Портретные
кадры и прежняя проверка положения самой панели не обнаруживали эту ошибку.

`hub-navigation-v021` теперь полностью задаёт собственную геометрию во всех
ориентациях: relative контейнер, absolute pill, один ряд четырёх назначений,
преобразование по реальному `--page-index`. Компонент не зависит от старых правил
только для узкого portrait. Бейдж находится в семантическом `.hub-nav-icon`
соответствующей кнопки; пассивное обновление вставляет его в тот же якорь.
На широких экранах сохраняется rail, pill отключён, выбранная строка выделяется
своим фоном. Нет компенсации left для отдельного экрана или браузера.

Выбранный случай существующего rc2-hub-browser:

```sh
node scripts/codex/test.cjs case/rc2-hub-browser --name 'root navigation selection'
env PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit \
  LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu \
  LAB_ENGINE=webkit node --test --test-name-pattern='root navigation selection' tests/rc2-hub-browser.test.cjs
```

Chromium **1/1 PASS**, WebKit **1/1 PASS**. В каждом движке 12 состояний:
четыре назначения ×390×844/844×390/1440×900. После реальной анимации измеряются
ровно одна aria-current кнопка, центр pill относительно выбранной кнопки
(погрешность менее 1 px), счётчик внутри собственной кнопки и отсутствие
horizontal overflow; для rail проверяется отсутствие pill. Активная сохранённая
партия создаётся настоящей локальной библиотекой. Pageerrors[] и внешних
Supabase-запросов0. Это не весь старый rc2-case и не физическое устройство.

Workspace evidence: `tmp_files/ux-021/navigation-021/{chromium,webkit}-navigation-report.json`
и `*-navigation-sessions-844.png`. Ведущий просмотрел свежий WebKit landscape.
