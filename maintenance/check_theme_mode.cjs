const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');

async function checkThemeMode(browser, root, userAgent, mobile, diagramRoute) {
  const context = await browser.newContext({ colorScheme: 'light', userAgent,
    viewport: mobile ? { width: 320, height: 720 } : { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(root + '/', { waitUntil: 'networkidle' });
    async function mode(value) {
      await page.locator('#modeToggle').click();
      await page.locator(`[data-mode-set="${value}"]`).click();
      assert.equal(await page.locator('html').getAttribute('data-mode'), value);
      assert.equal(await page.evaluate(() => localStorage.getItem('docsteer-mode')), value);
      assert.equal(await page.locator(`[data-mode-set="${value}"]`).getAttribute('aria-checked'), 'true');
    }
    const bg = () => page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--bg').trim());
    assert.equal(await page.locator('html').getAttribute('data-mode'), 'auto');
    const light = await bg();
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await bg();
    assert.notEqual(light, dark, 'A first visit follows live system changes');
    await mode('light');
    assert.equal(await bg(), light);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await bg(), light, 'Saved light overrides a dark system after reload');
    await mode('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    assert.equal(await bg(), dark, 'Explicit dark overrides a light system');
    await mode('auto');
    assert.equal(await bg(), light);
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await bg(), dark, 'Returning to auto restores live following');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-mode'), 'auto');
    assert.equal(await bg(), dark);
    const peer = await context.newPage();
    await peer.goto(root + '/', { waitUntil: 'networkidle' });
    const peerURL = peer.url();
    await mode('light');
    await peer.waitForFunction(() => document.documentElement.dataset.mode === 'light');
    assert.equal(peer.url(), peerURL, 'Passive synchronization does not navigate');
    await mode('auto');
    await peer.waitForFunction(() => document.documentElement.dataset.mode === 'auto');
    await page.locator('#modeToggle').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('html').getAttribute('data-mode'), 'dark');
    await page.locator('#modeToggle').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modeToggle').getAttribute('aria-expanded'), 'false');
    await page.locator('#modeToggle').click();
    const rect = await page.locator('#themeModeMenu').boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= (mobile ? 320 : 1280), 'Menu stays inside the viewport');
    assert.ok(await page.locator('[data-mode-set=auto]').evaluate(el => el.getBoundingClientRect().height >= 44));
    fs.mkdirSync('site-qa', { recursive: true });
    await page.screenshot({ path: `site-qa/theme-mode-${browser.browserType().name()}-${mobile ? 'mobile' : 'desktop'}-${userAgent.includes('CriOS') ? 'crios' : userAgent.includes('Chrome') ? 'chrome' : 'safari'}.png` });
    if (diagramRoute) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(root + diagramRoute, { waitUntil: 'networkidle' });
      await page.locator('.mermaid svg').first().waitFor();
      const diagram = page.locator('.mermaid').first();
      const id = await diagram.locator('svg').getAttribute('id');
      await mode('auto');
      await page.waitForFunction(before => document.querySelector('.mermaid svg')?.id !== before, id);
      const fill = () => diagram.locator('.node rect, .node polygon, .node path').first().evaluate(el => getComputedStyle(el).fill);
      const darkFill = await fill();
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForFunction(previous => {
        const el = document.querySelector('.mermaid .node rect, .mermaid .node polygon, .mermaid .node path');
        return el && getComputedStyle(el).fill !== previous;
      }, darkFill);
      assert.notEqual(await fill(), darkFill, 'Mermaid follows system changes in auto mode');
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
    console.log('Theme modes: Chromium/WebKit desktop/mobile, system changes, manual overrides, auto recovery, reload, storage sync, keyboard and menu layout passed. Browser tab UI requires real-device verification.');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { checkThemeMode };
