'use strict';
// Shared browser discovery for existing tests and Cloud setup; no app or pack imports.
const fs = require('node:fs');
const path = require('node:path');
const {chromium: playwrightChromium, webkit, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
function executable(candidate) {
  if (!candidate) return null;
  const paths = candidate.includes('/') || candidate.includes('\\')
    ? [path.resolve(candidate)]
    : (process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, candidate));
  for (const file of paths) {
    try { if (fs.statSync(file).isFile()) { fs.accessSync(file, fs.constants.X_OK); return file; } } catch (_) {}
  }
  return null;
}
const TEST_PROFILE_SCRIPT = () => {
  if (!localStorage.getItem('playroom.player-profile.v1')) {
    localStorage.setItem('playroom.player-profile.v1', JSON.stringify({
      version: 1, id: 'playroom-test-player', name: 'Тестовый игрок', createdAt: 1, updatedAt: 1
    }));
  }
};
function wrapContext(context, seedProfile) {
  if (!seedProfile) return context;
  const seed = () => context.addInitScript(TEST_PROFILE_SCRIPT);
  return new Proxy(context, {
    get(target, prop) {
      if (prop === 'addInitScript') return async (...args) => {
        const result = await target.addInitScript(...args);
        await seed();
        return result;
      };
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
const chromium = new Proxy(playwrightChromium, {
  get(target, prop) {
    if (prop === 'launch') return async options => {
      const browser = await target.launch(options);
      return new Proxy(browser, {
        get(browserTarget, browserProp) {
          if (browserProp === 'newContext') return async (options = {}) => {
            const {playroomProfile = true, ...playwrightOptions} = options;
            const context = await browserTarget.newContext(playwrightOptions);
            if (playroomProfile) await context.addInitScript(TEST_PROFILE_SCRIPT);
            return wrapContext(context, playroomProfile);
          };
          const value = Reflect.get(browserTarget, browserProp, browserTarget);
          return typeof value === 'function' ? value.bind(browserTarget) : value;
        }
      });
    };
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
function executablePath() {
  const override = process.env.CHROME_BIN || process.env.CHROME_PATH;
  if (override) {
    const found = executable(override);
    if (!found) throw Error(`CHROME_BIN/CHROME_PATH is not an executable browser: ${override}`);
    return found;
  }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = executable(name); if (found) return found;
  }
  const managed = executable(playwrightChromium.executablePath());
  if (managed) return managed;
  const error = Error('No Chromium browser found. Run bash scripts/codex/setup.sh, or set CHROME_BIN to an installed Chrome/Chromium executable.');
  error.code = 'BROWSER_MISSING'; throw error;
}
function launchTestBrowser(engine) {
  if (engine === 'chromium') return chromium.launch({headless: true, executablePath: executablePath()});
  if (engine === 'webkit') return webkit.launch({headless: true});
  throw Error('Choose chromium or webkit');
}
function phoneProfile(engine) {
  const descriptor = engine === 'webkit' ? devices['iPhone 15'] : devices['Pixel 7'];
  const {defaultBrowserType, ...context} = descriptor;
  return context;
}
module.exports = {chromium, executablePath, launchTestBrowser, phoneProfile, TEST_PROFILE_SCRIPT};
if (require.main === module) {
  (async () => {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) throw Error('Usage: node scripts/codex/browser.cjs [--check]');
    const binary = executablePath();
    if (process.argv[2] === '--check') {
      const browser = await playwrightChromium.launch({headless:true, executablePath:binary, args:['--no-sandbox','--disable-background-networking']});
      await browser.close();
    }
    console.log(binary);
  })().catch(error => { console.error(error.message); process.exitCode = error.code === 'BROWSER_MISSING' ? 3 : 1; });
}
