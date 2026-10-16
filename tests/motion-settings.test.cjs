'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root = path.resolve(__dirname, '..');
const Core = require('../core/engine.js');
const Session = require('../core/session.js');
for(const game of ['uno','checkers','snakes','durak','domino'])require('../packs/'+game+'/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.join(root, 'index.html')).href;
const FLIGHT = '.playroom-motion-piece[data-motion-kind="play"], .action-reveal-art.is-flying';

function fixture({mode = 'pass', turn = 0, players = 2, openHands = false} = {}) {
  const session = new Session(Core, 'uno', {preset: 'classic', seed: 17, mode, openHands,
    players: Array.from({length: players}, (_, i) => ({name: i ? `Бот ${i}` : 'Аня', bot: mode === 'solo' && i > 0}))});
  const saved = session.export(), state = saved.states[0], data = state.data;
  const pool = new Map([...data.hands.flat(), ...data.drawPile, ...data.discard].map(card => [card.id, card]));
  const take = (color, value) => {
    const card = [...pool.values()].find(card => card.color === color && card.value === String(value));
    assert(card, `${color}/${value}`); pool.delete(card.id); return card;
  };
  data.discard = [take('red', 5)];
  const specs = [
    [['red', 3], ['blue', 1], ['green', 1], ['yellow', 1], ['blue', 2], ['green', 2], ['yellow', 2]],
    [['red', 9], ['blue', 4], ['green', 4], ['yellow', 4], ['blue', 6], ['green', 6], ['yellow', 6]],
    [['red', 7], ['blue', 8], ['green', 8], ['yellow', 8], ['blue', 0], ['green', 0], ['yellow', 0]]
  ];
  data.hands = specs.slice(0, players).map(hand => hand.map(([color, value]) => take(color, value)));
  data.drawPile = [...pool.values()];
  data.color = 'red'; data.direction = 1; data.drawn = null; data.noDraw = false; data.stalled = 0;
  state.turn = turn;
  Core.validateState(state);
  return saved;
}
function plusFourFixture() {
  const saved = fixture(), state = saved.states[0], data = state.data;
  const index = data.drawPile.findIndex(card => card.value === '+4');
  assert(index >= 0);
  const plusFour = data.drawPile.splice(index, 1)[0];
  data.drawPile.push(data.hands[0][0]);
  data.hands[0][0] = plusFour;
  assert(Core.legalActions(state, 0).some(action => action.card === plusFour.id));
  Core.validateState(state);
  return saved;
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.scene')?.getAttribute('aria-busy') !== 'true');
}
async function currentMove(page) {
  return page.evaluate(() => TabletopSession.restore(TabletopCore,
    JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move);
}
async function waitMove(page, move) {
  await page.waitForFunction(value => TabletopSession.restore(TabletopCore,
    JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move === value, move);
}
async function resume(page) {
  const resumeButton=page.locator('.resume-banner [data-command=resume]');
  assert.equal(await resumeButton.count(),1,
    'Resume missing: '+JSON.stringify(await page.evaluate(()=>({
      app:document.getElementById('app')?.innerText.slice(0,280),
      packs:globalThis.PlayroomPacks?.list?.().map(x=>x.id+'@'+x.version),
      saved:!!localStorage.getItem('playroom.session.v1'),
      warning:globalThis.PlayroomPackLoadError
    }))));
  await resumeButton.click();
  if (await page.locator('.handoff').count()) await page.locator('[data-command=unlock]').click();
}
async function playHumanCard(page, saved) {
  const id = saved.states[0].data.hands[0][0].id;
  const source = page.locator(`.hand-track [data-entity="card-${id}"]`);
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const position = await source.evaluate(el => {
    const r = el.getBoundingClientRect();
    for (const fy of [.5, .12, .88]) for (const f of [.5, .12, .88]) { const x=r.x+r.width*f, y=r.y+r.height*fy, hit=document.elementFromPoint(x,y);
      if (hit===el || el.contains(hit)) return {x:x-r.x,y:y-r.y}; }
    throw Error('No exposed card position');
  });
  await source.click({position});
  assert.equal(await currentMove(page), 0, 'First card click selects without playing');
  const colors = page.locator(`.color-choice[data-drop-piece="${id}"][data-action]`);
  if (await colors.count()) await colors.first().click();
  else await page.locator(`.uno-drop-target[data-drop-piece="${id}"][data-action]`).click();
  return sourceBox;
}
async function observe(page) {
  await page.evaluate(selector => {
    const trace = window.motionSettingsTrace = {samples: [], moves: [], drawsSeen: [], resumeAt: null, raw: null, move: 0, stopped: false};
    const knownDraws = new WeakSet();
    document.addEventListener('click', event => {
      if (event.target.closest('[data-command="resume"]')) trace.resumeAt = performance.now();
    }, {capture: true});
    const record = () => {
      if (trace.stopped) return;
      const t = performance.now(), raw = localStorage.getItem('playroom.session.v1');
      if (raw && raw !== trace.raw) {
        const state = TabletopSession.restore(TabletopCore, JSON.parse(raw)).current;
        trace.raw = raw; trace.move = state.move;
        trace.moves.push({t, move: state.move, turn: state.turn});
      }
      const pieces = [...document.querySelectorAll(selector)].map(el => {
        const r = el.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width, height: r.height,
          face: el.querySelector('.face-value')?.textContent?.trim() || ''};
      });
      const draws = [...document.querySelectorAll('.playroom-motion-piece[data-motion-kind="draw"]')].map(el => {
        const mover = el.closest('.playroom-motion-flight'), r = el.getBoundingClientRect();
        const item = {player: Number(el.dataset.motionPlayer), face: !!el.querySelector('.face-value'),
          visible: Number(getComputedStyle(mover || el).opacity) > .05,
          x: r.x, y: r.y, width: r.width, height: r.height};
        if (!knownDraws.has(el)) { knownDraws.add(el); trace.drawsSeen.push({...item, t}); }
        return item;
      });
      trace.samples.push({t, move: trace.move, pieces, draws, layer: !!document.querySelector('.playroom-motion-layer'), gate: !!document.querySelector('.handoff'),
        busy: document.querySelector('.scene')?.getAttribute('aria-busy') === 'true'});
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, FLIGHT);
}
async function stopTrace(page) {
  await page.evaluate(() => new Promise(requestAnimationFrame));
  return page.evaluate(() => {
    motionSettingsTrace.stopped = true;
    const {raw, ...trace} = motionSettingsTrace;
    return trace;
  });
}
const center = rect => ({x: rect.x + rect.width / 2, y: rect.y + rect.height / 2});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const playedFrames = (trace, move = 1) => trace.samples.filter(sample => sample.move === move && sample.pieces.length);

test('Animation presets persist and stage real card flights before the next actor', {timeout: 120000}, async t => {
  const fixtureServer=process.env.PLAYROOM_URL?.startsWith('http')?null:await serveBrowserFixture(root);
  const testUrl=fixtureServer?.url||url;
  const browser = await chromium.launch({headless: true,
    executablePath: executablePath(),
    args: ['--no-sandbox', '--disable-background-networking']});
  async function open({settings = {}, saved = null, reducedMotion = 'no-preference'} = {}) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true,
      isMobile: true, reducedMotion});
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(testUrl);
    // Seed once; a reload must read the user's current storage without reseeding.
    await page.evaluate(({settings, saved}) => {
      localStorage.clear();
      localStorage.setItem('playroom.settings.v1', JSON.stringify({sound: false, ...settings}));
      if (saved) localStorage.setItem('playroom.session.v1', JSON.stringify(saved));
    }, {settings, saved});
    await page.reload();
    return {page, context, errors};
  }
  async function check(name, fn) {
    await t.test(name, async () => {
      const environments = [];
      try {
        await fn(async options => { const env = await open(options); environments.push(env); return env; });
        for (const env of environments) assert.deepEqual(env.errors, [], 'No uncaught browser errors');
      } finally { for (const env of environments) await env.context.close(); }
    });
  }
  try {
    await check('All four preset choices persist through reload and replace the old checkbox', async open => {
      const {page} = await open();
      for (const speed of ['instant', 'fast', 'normal', 'slow']) {
        await page.locator('[data-command=settings]').click();
        assert.equal(await page.locator('#setting-motion').count(), 0);
        assert.deepEqual(await page.locator('#setting-speed option').evaluateAll(options => options.map(option => option.value)),
          ['instant', 'fast', 'normal', 'slow']);
        await page.locator('#setting-speed').selectOption(speed);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('playroom.settings.v1')).animationSpeed), speed);
        await page.evaluate(() => sessionStorage.clear());
        await page.reload();
        await page.locator('[data-command=settings]').click();
        assert.equal(await page.locator('#setting-speed').inputValue(), speed);
        await page.locator('.modal [data-command=close-modal]').click();
      }
    });

    await check('Manual Hotseat transfer is common to all packs and automatic transfer remains an explicit saved preference', async open => {
      for(const game of ['uno','checkers','snakes','durak','domino']){
        const candidate=new Session(Core,game,{seed:17,mode:'pass',preset:'classic',players:[{name:'Аня'},{name:'Борис'}]});
        let action;
        for(let i=0;i<30;i++){
          action=Core.botAction(candidate.current);const next=Core.applyAction(candidate.current,candidate.current.turn,action);
          if(next.turn!==candidate.current.turn&&next.status==='playing')break;
          candidate.act(candidate.current.turn,action);
        }
        assert(action,game+' fixture has a turn action');
        for(const automatic of [false,true]){
          const saved=candidate.export(),before=saved.states.at(-1),{page}=await open({saved,settings:{animationSpeed:'instant',autoPass:automatic}});
          await resume(page);
          await page.evaluate(action=>{const button=document.createElement('button');button.dataset.action=JSON.stringify(action);document.querySelector('.scene').append(button);button.click();button.remove();},action);
          await waitMove(page,before.move+1);await ready(page);
          if(!automatic){
            await page.locator('[data-command=pass-device]:not(:disabled)').waitFor();
            assert.equal(await page.locator('.handoff').count(),0,game+' must wait for explicit transfer');
            await page.locator('[data-command=pass-device]').click();
          }
          if(before.data.hands)await page.locator('.handoff').waitFor();
          else await page.waitForFunction(()=>document.querySelector('[data-command=pass-device]')?.disabled===true);
          assert.equal(await currentMove(page),before.move+1,'handoff is not a game action');
        }
      }
      const {page}=await open();await page.locator('[data-command=settings]').click();
      assert.equal(await page.locator('#setting-auto-pass').isChecked(),false);
      await page.locator('#setting-auto-pass').check();await page.reload();await page.locator('[data-command=settings]').click();
      assert.equal(await page.locator('#setting-auto-pass').isChecked(),true);
    });

    await check('Manual Hotseat transfer preserves the full local UNO response window', async open => {
      const saved=fixture(),state=saved.states[0];
      saved.options.unoMode='manual';state.data.uno.mode='manual';
      state.data.drawPile.push(...state.data.hands[0].splice(2));Core.validateState(state);
      const {page}=await open({saved,settings:{animationSpeed:'instant',autoPass:false}});
      await resume(page);await playHumanCard(page,saved);await waitMove(page,1);await ready(page);
      const readyAt=await page.evaluate(()=>performance.now()),pass=page.locator('[data-command=pass-device]');
      assert.equal(await pass.isDisabled(),true,'transfer cannot cut the UNO response window short');
      assert.equal(await pass.evaluate(el=>el.classList.contains('handoff-pending')),false,'a protected transfer must not pulse');
      await pass.dispatchEvent('click');
      assert.equal(await page.locator('.handoff').count(),0,'even a direct command cannot transfer early');
      await page.waitForFunction(()=>document.querySelector('[data-command=pass-device]')?.disabled===false);
      assert(await page.evaluate(at=>performance.now()-at,readyAt)>=2800,'manual transfer waits three seconds after presentation');
      assert.equal(await pass.evaluate(el=>el.classList.contains('handoff-pending')),true,'the ready transfer is highlighted');
      assert.equal(await currentMove(page),1,'ending the response window does not append a move');
      await pass.click();await page.locator('.handoff').waitFor();
    });

    await check('Legacy motion booleans migrate and explicit preset values have a defined priority', async open => {
      for (const [settings, expected] of [
        [{}, 'normal'], [{motion: false}, 'instant'], [{motion: true}, 'normal'],
        [{animationSpeed: 'fast', motion: false}, 'fast'],
        [{animationSpeed: 'invalid', motion: false}, 'normal']
      ]) {
        const {page} = await open({settings});
        await page.locator('[data-command=settings]').click();
        assert.equal(await page.locator('#setting-speed').inputValue(), expected);
      }
    });

    await check('Instant mode has no flying card while bot and action gaps remain nonzero', async open => {
      const saved = fixture({mode: 'solo', turn: 1});
      const {page} = await open({saved, settings: {animationSpeed: 'instant'}});
      await observe(page); await resume(page); await waitMove(page, 1); await ready(page);
      const trace = await stopTrace(page), accepted = trace.moves.find(move => move.move === 1);
      assert(accepted && trace.resumeAt !== null);
      assert(accepted.t - trace.resumeAt >= 180, 'Instant bot must retain its 220ms thinking gap');
      assert.equal(trace.samples.some(sample => sample.pieces.length), false);
      const busy = trace.samples.filter(sample => sample.move === 1 && sample.busy);
      assert(busy.length >= 2, 'Even instant actions retain a short observable pause');
      assert(busy.at(-1).t - busy[0].t >= 45, 'Instant action must not release immediately');
    });

    await check('Fast and normal both show a played card, with a shorter visible flight in fast mode', async open => {
      const durations = {};
      for (const speed of ['fast', 'normal']) {
        const saved = fixture({openHands: true}), {page} = await open({saved, settings: {animationSpeed: speed}});
        await resume(page); await observe(page); await playHumanCard(page, saved);
        await page.locator(FLIGHT).waitFor({state: 'visible'});
        await ready(page);
        const frames = playedFrames(await stopTrace(page));
        assert(frames.length >= 3, `${speed} must show multiple animation frames`);
        assert(frames.some(frame => frame.pieces[0].face === '3'), 'The actual played face must be visible');
        durations[speed] = frames.at(-1).t - frames[0].t;
      }
      assert(durations.fast >= 120 && durations.normal >= 380);
      assert(durations.normal > durations.fast + 150, JSON.stringify(durations));
    });

    await check('Slow human play flies from the hand to discard before the privacy curtain appears', async open => {
      const saved = fixture(), {page} = await open({saved, settings: {animationSpeed: 'slow',autoPass:true}});
      await resume(page); await observe(page);
      const source = await playHumanCard(page, saved);
      await page.locator(FLIGHT).waitFor({state: 'visible'});
      assert.equal(await page.locator('.handoff').count(), 0);
      const destination = await page.locator('.uno-discard > .uno-card').boundingBox();
      await page.locator('.handoff').waitFor({state: 'visible'});
      const trace = await stopTrace(page), frames = playedFrames(trace);
      assert(frames.length >= 10);
      assert(frames.every(frame => !frame.gate && frame.busy));
      assert(frames.some(frame => frame.pieces[0].face === '3'));
      assert(distance(center(frames[0].pieces[0]), center(source)) < 65, 'Flight must start at the old hand card');
      assert(distance(center(frames.at(-1).pieces[0]), center(destination)) < 45, 'Flight must arrive at discard');
      const accepted = trace.moves.find(move => move.move === 1), gate = trace.samples.find(sample => sample.gate);
      const effects=require('../core/game-flow.js').effectTimes.slow;
      assert(gate.t-accepted.t>=effects.flip*2+effects.reveal-100,'Privacy curtain waits for entry, shortened reveal hold and exit');
    });

    await check('Slow bot reveals only its played card and the next bot waits until staging is over', async open => {
      const saved = fixture({mode: 'solo', turn: 1, players: 3});
      const {page} = await open({saved, settings: {animationSpeed: 'slow'}});
      await observe(page); await resume(page);
      await page.locator(FLIGHT).waitFor({state: 'visible'});
      const destination = await page.locator('.uno-discard > .uno-card').boundingBox();
      await waitMove(page, 2);
      const trace = await stopTrace(page), frames = playedFrames(trace);
      assert(frames.length >= 10);
      assert(frames.some(frame => frame.pieces[0].face === '9'), 'Bot flight must show the card it actually played');
      assert(center(frames[0].pieces[0]).y < center(destination).y - 20, 'Bot card must start at the opponent side');
      assert(distance(center(frames.at(-1).pieces[0]), center(destination)) < 45);
      assert(frames.every(frame => frame.busy));
      const next = trace.moves.find(move => move.move === 2);
      assert(next.t - frames.at(-1).t >= 1100, 'Next bot waits for the complete reveal and its own thinking gap');
      assert.equal(await page.locator('.opponent-hand [data-entity^="card-"]').count(), 0, 'Other hidden bot cards stay unidentified');
    });

    await check('System reduced motion removes flights while preserving the selected slow pause', async open => {
      const saved = fixture({openHands: true});
      const {page} = await open({saved, settings: {animationSpeed: 'slow'}, reducedMotion: 'reduce'});
      await resume(page); await observe(page); await playHumanCard(page, saved); await ready(page);
      const trace = await stopTrace(page), busy = trace.samples.filter(sample => sample.move === 1 && sample.busy);
      assert.equal(trace.samples.some(sample => sample.pieces.length), false);
      assert(busy.length >= 4);
      assert(busy.at(-1).t - busy[0].t >= 550, 'Reduced motion must preserve slow observation time');
    });

    await check('A normal draw visibly transfers one card back from stock into the hand', async open => {
      const saved = fixture({openHands: true}), {page} = await open({saved, settings: {animationSpeed: 'normal'}});
      await resume(page); await observe(page);
      const stock = await page.locator('.stock-button').boundingBox();
      await page.locator('.stock-button[data-action]').click();
      await page.locator('.playroom-motion-piece[data-motion-kind=draw]').waitFor({state: 'visible'});
      await ready(page);
      const trace = await stopTrace(page), frames = trace.samples.filter(sample => sample.draws.some(draw => draw.visible));
      assert.equal(trace.drawsSeen.length, 1);
      assert.equal(trace.drawsSeen[0].player, 0);
      assert.equal(trace.drawsSeen[0].face, false, 'A drawn card travels face down');
      assert(frames.length >= 3);
      assert(frames.every(frame => frame.busy));
      assert.equal(playedFrames(trace).length, 0);
      assert(distance(center(frames[0].draws[0]), center(stock)) < 75, 'Draw starts at the stock');
      assert.equal(await currentMove(page), 1);
    });

    await check('Playing +4 finishes its flight before four face-down penalty draws and releases only after the sequence', async open => {
      const saved = plusFourFixture(), {page} = await open({saved, settings: {animationSpeed: 'normal'}});
      await resume(page); await observe(page); await playHumanCard(page, saved);
      await page.locator(FLIGHT).waitFor({state: 'visible'});
      await ready(page);
      const trace = await stopTrace(page), played = playedFrames(trace);
      const drawing = trace.samples.filter(sample => sample.draws.some(draw => draw.visible));
      assert(played.length >= 3 && drawing.length >= 3);
      assert(played.some(frame => frame.pieces[0].face === '+4'));
      assert.equal(trace.drawsSeen.length, 4, 'The full four-card penalty must be animated');
      assert(trace.drawsSeen.every(draw => draw.player === 1 && !draw.face), 'All penalty cards travel as backs to the opponent');
      assert(drawing[0].t >= played.at(-1).t - 20, 'Penalty draws start only after the played +4 arrives');
      assert(trace.samples.filter(sample => sample.move === 1 && sample.layer).every(sample => sample.busy && !sample.gate));
      const latest = await page.evaluate(() => TabletopSession.restore(TabletopCore,
        JSON.parse(localStorage.getItem('playroom.session.v1'))).current);
      assert.equal(latest.data.hands[1].length, saved.states[0].data.hands[1].length + 4);
      assert.equal(latest.turn, 0, 'Two-player +4 skips the opponent after the visible penalty');
      assert.equal(latest.move, 1, 'Presentation never applies extra rule actions');
    });

    await check('Phone card help lists the current hand descriptions and closes back to the game', async open => {
      const saved = fixture(), {page} = await open({saved, settings: {animationSpeed: 'instant'}});
      await resume(page);
      const expected = await page.locator('.own-hand .uno-card[data-tooltip]').evaluateAll(cards => [...new Set(cards.map(card => card.dataset.tooltip))]);
      assert(expected.length > 0);
      await page.locator('.uno-card-help[data-command=card-help]').click();
      const text = await page.locator('.card-help-list').innerText();
      for (const description of expected) assert(text.includes(description));
      assert.equal(await currentMove(page), 0);
      await page.locator('.modal [data-command=close-modal]').click();
      assert.equal(await page.locator('.modal').count(), 0);
      assert(await page.locator('.own-hand .uno-card').count() > 0);
    });

    await check('Leaving during a slow flight cleans up and cannot display a stale privacy curtain', async open => {
      const saved = fixture(), {page} = await open({saved, settings: {animationSpeed: 'slow'}});
      await resume(page); await playHumanCard(page, saved);
      await page.locator(FLIGHT).waitFor({state: 'visible'});
      await page.locator('.table-heading [data-command=home]').click();
      assert.equal(await page.locator('.game-tile').count(), 13);
      assert.equal(await page.locator('.playroom-motion-layer').count(), 0);
      await page.waitForTimeout(1850);
      assert.equal(await page.locator('.handoff').count(), 0);
      assert.equal(await page.locator('.game-tile').count(), 13);
    });
  } finally { await browser.close(); await fixtureServer?.close(); }
});
