/* Verify DocSteer brand assets in a real Chromium browser. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');

const siteRoot = path.resolve(__dirname, '../_site');
const baseurl = process.env.BASEURL;
const expectedLogo = process.env.EXPECTED_LOGO;
const expectedFavicon = process.env.EXPECTED_FAVICON;

if (!baseurl || !expectedLogo || !expectedFavicon) {
  throw new Error('BASEURL, EXPECTED_LOGO and EXPECTED_FAVICON are required');
}

const server = spawn('python3', ['-c', `
from http.server import HTTPServer, SimpleHTTPRequestHandler
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=${JSON.stringify(siteRoot)}, **kwargs)
    def do_GET(self):
        if not self.path.startswith(${JSON.stringify(baseurl + '/')}):
            self.send_error(404)
            return
        self.path = self.path[len(${JSON.stringify(baseurl)}):]
        super().do_GET()
HTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
`], { stdio: 'ignore' });

const root = 'http://127.0.0.1:8765' + baseurl;

(async () => {
  let browser;
  try {
    for (let retry = 0; retry < 100; retry++) {
      try {
        const response = await fetch(root + '/');
        if (response.ok) break;
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
    const response = await page.goto(root + '/', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);

    const brandLogo = page.locator('.navbar .brand__logo');
    assert.equal(await brandLogo.count(), 1, 'navbar brand logo exists');
    assert.match(await brandLogo.getAttribute('src'), new RegExp(expectedLogo.replace('.', '\\.') + '$'));

    const favicon = page.locator('link[rel="icon"]');
    assert.equal(await favicon.count(), 1, 'favicon link exists');
    assert.match(await favicon.getAttribute('href'), new RegExp(expectedFavicon.replace('.', '\\.') + '$'));

    const initialBackground = await brandLogo.evaluate(node => getComputedStyle(node).backgroundImage);
    assert.notEqual(initialBackground, 'none', 'brand logo has theme gradient');

    await page.locator('#skinPicker > .navbar__icon-btn').click();
    await page.locator('[data-skin-set="violet"]').click();
    assert.equal(await page.locator('html').getAttribute('data-skin'), 'violet');

    const violetBackground = await brandLogo.evaluate(node => getComputedStyle(node).backgroundImage);
    assert.notEqual(violetBackground, initialBackground, 'brand logo follows active skin');

    console.log(JSON.stringify({
      ok: true,
      logo: await brandLogo.getAttribute('src'),
      favicon: await favicon.getAttribute('href'),
      skin: 'aqua -> violet'
    }));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
