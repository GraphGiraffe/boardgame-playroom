'use strict';
// Shared browser discovery for existing tests and Cloud setup; no app or pack imports.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
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
  const managed = executable(chromium.executablePath());
  if (managed) return managed;
  const error = Error('No Chromium browser found. Run bash scripts/codex/setup.sh, or set CHROME_BIN to an installed Chrome/Chromium executable.');
  error.code = 'BROWSER_MISSING'; throw error;
}
module.exports = {chromium, executablePath};
if (require.main === module) {
  (async () => {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) throw Error('Usage: node scripts/codex/browser.cjs [--check]');
    const binary = executablePath();
    if (process.argv[2] === '--check') {
      const browser = await chromium.launch({headless:true, executablePath:binary, args:['--no-sandbox','--disable-background-networking']});
      await browser.close();
    }
    console.log(binary);
  })().catch(error => { console.error(error.message); process.exitCode = error.code === 'BROWSER_MISSING' ? 3 : 1; });
}
