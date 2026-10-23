const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');

async function checkThemeMode(browser, root, userAgent, mobile, diagramRoute) {
  const context = await browser.newContext({ colorScheme: 'light', userAgent,
    isMobile: mobile, hasTouch: mobile,
    viewport: mobile ? { width: 320, height: 720 } : { width: 1280, height: 900 } });
  try {
    let page = await context.newPage();
    const errors = [];
    const watch = p => p.on('pageerror', error => errors.push(error.message));
    watch(page);
    const bg = () => page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--bg').trim());
    const mode = () => page.locator('html').getAttribute('data-mode');
    async function click(expected) {
      await page.locator('#modeToggle').click();
      assert.equal(await mode(), expected);
      assert.equal(await page.evaluate(() => localStorage.getItem('docsteer-mode')), expected);
    }
    async function automatic() {
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'auto');
      assert.equal(await page.evaluate(() => localStorage.getItem('docsteer-mode')), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('docsteer-mode-system')), null);
    }
    await page.goto(root + '/', { waitUntil: 'networkidle' });
    assert.equal(await mode(), 'auto');
    assert.equal(await page.locator('script[data-theme-mode-script]').count(), 1);
    assert.equal(await page.locator('#modeToggle > .fa-sun.icon-light').count(), 1);
    assert.equal(await page.locator('#modeToggle > .fa-moon.icon-dark').count(), 1);
    assert.equal(await page.locator('#modeToggle').getAttribute('class'), 'navbar__icon-btn');
    assert.equal(await page.locator('#themeModeMenu, .theme-mode, [href*="theme-mode.css"]').count(), 0);
    const originalIcons = await page.locator('#modeToggle').innerHTML();
    const light = await bg();
    await click('dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('docsteer-mode-system')), 'light');
    const dark = await bg();
    assert.notEqual(light, dark);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await mode(), 'dark', 'Reload preserves manual choice while system is unchanged');
    assert.equal(await bg(), dark);
    await page.locator('#modeToggle').focus();
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'light', 'Original button retains native keyboard interaction');
    await page.emulateMedia({ colorScheme: 'dark' });
    await automatic();
    assert.equal(await bg(), dark);
    await page.emulateMedia({ colorScheme: 'light' });
    await automatic();
    assert.equal(await bg(), light);

    // A manual choice matching the current system is still temporary.
    await click('dark');
    await click('light');
    await page.close();
    page = await context.newPage(); watch(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    const navigations = [];
    page.on('request', request => { if (request.isNavigationRequest()) navigations.push(request.url()); });
    await page.goto(root + '/?qa=restore#top', { waitUntil: 'networkidle' });
    await automatic();
    assert.equal(await bg(), dark, 'A changed system clears a saved override before routing');
    assert.ok(!navigations.some(url => /\/theme\/[^/]+\/light\//.test(url)), 'No stale light-profile detour');
    assert.equal(new URL(page.url()).search, '?qa=restore');
    assert.equal(new URL(page.url()).hash, '#top');

    await page.emulateMedia({ colorScheme: 'light' });
    await automatic();
    const peer = await context.newPage(); watch(peer);
    await peer.goto(root + '/', { waitUntil: 'networkidle' });
    const peerURL = peer.url();
    await click('dark');
    await peer.waitForFunction(() => document.documentElement.dataset.mode === 'dark');
    assert.equal(peer.url(), peerURL, 'Passive synchronization does not navigate');
    await page.emulateMedia({ colorScheme: 'dark' });
    await automatic();
    await peer.waitForFunction(() => document.documentElement.dataset.mode === 'auto');
    assert.equal(peer.url(), peerURL);
    await peer.close();

    // Existing preferences have no system snapshot: migrate without resetting them.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => {
      localStorage.setItem('docsteer-mode', 'dark');
      localStorage.removeItem('docsteer-mode-system');
    });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await mode(), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('docsteer-mode-system')), 'light');
    assert.equal(await page.locator('#modeToggle').innerHTML(), originalIcons, 'Original icon markup remains intact');
    fs.mkdirSync('site-qa', { recursive: true });
    await page.screenshot({ path: `site-qa/theme-mode-${browser.browserType().name()}-${mobile ? 'mobile' : 'desktop'}-${userAgent.includes('CriOS') ? 'crios' : userAgent.includes('Chrome') ? 'chrome' : 'safari'}.png` });

    if (diagramRoute) {
      // Restore auto through an actual system change, then verify both palettes.
      await page.emulateMedia({ colorScheme: 'dark' });
      await automatic();
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(root + diagramRoute, { waitUntil: 'networkidle' });
      await page.locator('.mermaid svg').first().waitFor();
      const fill = () => page.locator('.mermaid .node rect, .mermaid .node polygon, .mermaid .node path').first().evaluate(el => getComputedStyle(el).fill);
      const lightFill = await fill();
      await page.emulateMedia({ colorScheme: 'dark' });
      await automatic();
      await page.waitForFunction(previous => {
        const el = document.querySelector('.mermaid .node rect, .mermaid .node polygon, .mermaid .node path');
        return el && getComputedStyle(el).fill !== previous;
      }, lightFill);
      assert.notEqual(await fill(), lightFill, 'Mermaid follows automatic system changes');
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

if (require.main === module) (async () => {
  const base = process.argv[2];
  assert.match(base, /^\/[a-z0-9-]+$/);
  const site = path.resolve('_site');
  const candidates = [];
  function findDiagram(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) findDiagram(file);
      else if (entry.name.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8');
        const count = (html.match(/class="mermaid"/g) || []).length;
        const first = html.match(/<div class="mermaid">\s*(flowchart|graph)\b/);
        if (count && first && html.indexOf(first[0]) === html.indexOf('<div class="mermaid">')) candidates.push({ file, count });
      }
    }
  }
  findDiagram(path.join(site, 'docs'));
  candidates.sort((a, b) => a.count - b.count);
  const diagramRoute = candidates.length ? '/' + path.relative(site, candidates[0].file).split(path.sep).join('/').replace(/index\.html$/, '') : null;
  const mime = { '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.html': 'text/html' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!url.startsWith(base + '/')) return res.writeHead(404).end();
    let file = path.resolve(site, '.' + url.slice(base.length));
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch();
      try {
        const root = `http://127.0.0.1:${server.address().port}${base}`;
        const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
        const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
        for (const [ua, mobile] of engine === chromium ? [
          ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', false],
          ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', true]
        ] : [[safari, false], [iphone, true], [iphone.replace('Version/18.0', 'CriOS/130.0.0.0'), true]]) {
          await checkThemeMode(browser, root, ua, mobile, diagramRoute);
        }
      } finally { await browser.close(); }
    }
    console.log('Original theme button: Chromium/WebKit desktop/mobile, temporary overrides, system changes while open/closed, reload, storage sync, legacy migration, keyboard, icons and diagram colors passed. Browser tab UI requires real-device verification.');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { checkThemeMode };
