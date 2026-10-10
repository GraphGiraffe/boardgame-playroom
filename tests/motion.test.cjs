'use strict';
// Test actual app moves with motion enabled: settled screenshots cannot catch
// transformed containers briefly expanding their parents' scrolling area.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const root = path.resolve(__dirname, '..');
const E = require(path.join(root, 'core/engine.js'));
const Session = require(path.join(root, 'core/session.js'));
const games = ['uno', 'domino', 'durak', 'checkers', 'snakes'];
games.forEach(game => require(path.join(root, 'packs', game, 'rules.js')));

function fixture(game, longHand = false) {
  const session = new Session(E, game, { players: [{ name: 'Аня' }, { name: 'Борис' }], mode: 'pass', openHands: true, preset: 'classic', seed: 17 });
  if (longHand) {
    for (let step = 0; step < 36; step++) {
      const legal = E.legalActions(session.current);
      session.act(session.current.turn, legal.find(a => a.type === 'draw') || legal.find(a => a.type === 'pass'));
    }
  }
  return session.export();
}

test('Motion never rotates/resizes the table or introduces temporary visible scrollbars', { timeout: 120000 }, async t => {
  const browser = await chromium.launch({ headless: true, executablePath: executablePath(), args: ['--no-sandbox', '--disable-background-networking'] });
  const overflowByViewport = {};
  try {
    for (const [width, height] of [[1820, 1386], [390, 844]]) {
      for (const game of [...games, 'uno-long-hand']) {
        await t.test(`${game} ${width}×${height}`, async () => {
          const id = game.replace('-long-hand', ''), longHand = game.endsWith('-long-hand');
          const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', hasTouch: width < 500 });
          try {
            await context.addInitScript(saved => {
              localStorage.clear();
              localStorage.setItem('playroom.session.v1', JSON.stringify(saved));
              localStorage.setItem('playroom.settings.v1', JSON.stringify({ motion: true, sound: false }));
            }, fixture(id, longHand));
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(process.env.PLAYROOM_URL || pathToFileURL(path.join(root, 'index.html')).href);
            await page.locator('.resume-banner [data-command=resume]').click();
            for (let move = 0; move < 2; move++) {
              await page.locator('.scene[aria-busy="false"]').waitFor();
              const result = await page.evaluate(async ({ game, longHand }) => {
                const visibleCard = () => {
                  const track = document.querySelector('.hand-track');
                  if (!track) return null;
                  const box = track.getBoundingClientRect();
                  return [...track.querySelectorAll('[data-action],.is-playable[data-select]')].find(el => {
                    const r = el.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right;
                  });
                };
                if (longHand) document.querySelector('.hand-track').scrollLeft = document.querySelector('.hand-track').scrollWidth;
                let action;
                if (game === 'checkers') {
                  document.querySelector('.checker-piece.movable').click();
                  action = document.querySelector('.checker-cell.destination');
                } else if (game === 'snakes') action = document.querySelector('.die[data-action]');
                else {
                  action = visibleCard();
                  // Preview metadata may coexist with a one-tap action; match input priority.
                  if (action?.hasAttribute('data-select') && !action.hasAttribute('data-action')) {
                    action.click(); action = document.querySelector('.uno-color-picker [data-action],.uno-drop-target[data-action],.defend-target,.domino-drop-target,.scene-actions [data-action]');
                  }
                  action ||= document.querySelector('.stock-button[data-action],.scene-actions [data-action],.hand-track [data-action]');
                }
                if (!action) throw Error(`No visible action in ${game}`);
                const selectors = ['.scene', '.game-scene', '.checker-board', '.snakes-board', '.hand-track', '.domino-chain'];
                const snapshots = [];
                function sample(time) {
                  const elements = {};
                  for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (!el) continue;
                    const b = el.getBoundingClientRect(), style = getComputedStyle(el);
                    elements[selector] = { width: b.width, height: b.height, layoutWidth: el.offsetWidth, layoutHeight: el.offsetHeight, overflowX: el.scrollWidth - el.clientWidth, overflowY: el.scrollHeight - el.clientHeight, transform: style.transform, scrollAxes: { overflowX: style.overflowX, overflowY: style.overflowY } };
                  }
                  snapshots.push({ time, elements });
                }
                const readMove = () => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move;
                const beforeMove = readMove();
                sample(-1); action.click(); sample(0);
                const start = performance.now();
                await new Promise(resolve => {
                  function frame(time) { sample(time - start); if (time - start < 550 || (time - start < 5000 && document.querySelector('.scene').getAttribute('aria-busy') === 'true')) requestAnimationFrame(frame); else resolve(); }
                  requestAnimationFrame(frame);
                });
                return { beforeMove, afterMove: readMove(), snapshots };
              }, { game: id, longHand });
              assert.equal(result.afterMove, result.beforeMove + 1, 'a real move must be applied');
              assert.ok(result.snapshots.length >= 3, 'must observe animation frames');
              for (const frame of result.snapshots) {
                const peaks = overflowByViewport[`${width}×${height}`] ||= { x: 0, y: 0, frames: 0 };
                peaks.x = Math.max(peaks.x, frame.elements['.scene'].overflowX);
                peaks.y = Math.max(peaks.y, frame.elements['.scene'].overflowY);
                peaks.frames++;
                const gameScene = frame.elements['.game-scene'];
                assert.equal(gameScene.transform, 'none', 'the scene itself must not transform');
                for (const selector of ['.game-scene', '.checker-board', '.snakes-board']) {
                  const box = frame.elements[selector]; if (!box) continue;
                  assert.ok(Math.abs(box.width - box.layoutWidth) <= 1 && Math.abs(box.height - box.layoutHeight) <= 1, `${selector} visual size changed at ${frame.time}ms`);
                }
                if (id === 'uno') for (const selector of ['.scene', '.hand-track']) {
                  const before = result.snapshots[0].elements[selector], box = frame.elements[selector];
                  assert.ok(Math.abs(box.height - before.height) <= 1, `${selector} height changed during UNO action at ${frame.time}ms`);
                }
                // Hands/chains may deliberately scroll along X; their maximum
                // range must follow content, never a flying card's transform.
                for (const selector of ['.scene', '.hand-track', '.domino-chain']) {
                  const box = frame.elements[selector]; if (!box) continue;
                  const before = result.snapshots[0].elements[selector] || { overflowX: 0, overflowY: 0 };
                  const after = result.snapshots.at(-1).elements[selector] || { overflowX: 0, overflowY: 0 };
                  for (const axis of ['overflowX', 'overflowY']) {
                    if (['hidden', 'clip'].includes(box.scrollAxes[axis])) continue;
                    assert.ok(box[axis] <= Math.max(before[axis], after[axis]) + 2, `${selector} transient ${axis}: ${box[axis]} (before ${before[axis]}, after ${after[axis]}) at ${frame.time}ms`);
                  }
                }
              }
            }
            assert.deepEqual(errors, []);
          } finally { await context.close(); }
        });
      }
    }
    t.diagnostic(`Maximum scene overflow in pixels: ${JSON.stringify(overflowByViewport)}`);
  } finally { await browser.close(); }
});
