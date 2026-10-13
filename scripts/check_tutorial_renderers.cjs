/* Verify real math/diagram rendering on every documentation page, then mobile overflow. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const base = process.env.BASEURL || '/ai-storage-notes';
const site = path.resolve('_site');
const server = spawn('python3', ['-c', `
from http.server import HTTPServer, SimpleHTTPRequestHandler
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=${JSON.stringify(site)}, **kwargs)
    def do_GET(self):
        if not self.path.startswith(${JSON.stringify(base + '/')}):
            self.send_error(404)
            return
        self.path = self.path[len(${JSON.stringify(base)}):]
        super().do_GET()
HTTPServer(('127.0.0.1', 8766), Handler).serve_forever()
`], { stdio: 'ignore' });
(async () => {
  let browser;
  try {
    const root = 'http://127.0.0.1:8766' + base;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(root + '/')).ok) break; } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let math = 0, diagrams = 0, pages = 0;
    for (const entry of fs.readdirSync(path.join(site, 'docs'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const route = '/docs/' + entry.name + '/';
      assert.equal((await page.goto(root + route, { waitUntil: 'networkidle' })).status(), 200);
      await page.waitForFunction(() => [...document.querySelectorAll('.mermaid')].every(n => n.dataset.rendered === 'true' || n.classList.contains('render-error')));
      assert.equal(await page.locator('.render-error, .katex-error').count(), 0, route);
      const m = await page.locator('[data-tex]').count();
      const d = await page.locator('.mermaid').count();
      assert.equal(await page.locator('[data-tex] .katex').count(), m, 'All formulas render: ' + route);
      assert.equal(await page.locator('.mermaid > svg').count(), d, 'All diagrams render: ' + route);
      assert.equal(await page.locator('code.language-mermaid').count(), 0, 'No diagram left as code: ' + route);
      math += m; diagrams += d; pages++;
      if (entry.name.match(/^00[a-d]_/)) {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Desktop overflow: ' + route);
        for (const mode of ['light', 'dark']) {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.evaluate(mode => { document.documentElement.dataset.mode = mode; }, mode);
          await page.waitForTimeout(300);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile overflow: ' + route);
          assert.equal(await page.locator('.render-error').count(), 0, 'Mobile rendering: ' + route);
          assert.ok(await page.locator('.mobile-toc').isVisible(), 'Mobile TOC: ' + route);
          if (process.env.SCREENSHOT_DIR) {
            fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, entry.name + '-' + mode + '.png') });
          }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    }
    assert.deepEqual(errors, [], 'No JavaScript errors');
    assert.ok(math > 0 && diagrams > 0, 'Both renderers were exercised');
    console.log(JSON.stringify({ ok: true, pages, formulas: math, diagrams }));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
