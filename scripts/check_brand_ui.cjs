/* Verify DocSteer brand assets in a real Chromium browser. */
const { chromium } = require('playwright');
const { checkBrandIcons } = require('../maintenance/check_brand_icons.cjs');
const { checkNavigation } = require('../maintenance/check_navigation.cjs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');

const siteRoot = path.resolve(__dirname, '../_site');
const baseurl = process.env.BASEURL;
const expectedLogo = process.env.EXPECTED_LOGO;
const expectedFavicon = process.env.EXPECTED_FAVICON;
const expectedGroups = Number(process.env.EXPECTED_GROUPS || 0);
const expectedTopics = Number(process.env.EXPECTED_TOPICS || 0);

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

    assert.equal(await page.locator('.knowledge-home').count(), 1, 'knowledge map homepage exists');
    if (expectedGroups) assert.equal(await page.locator('.knowledge-group').count(), expectedGroups, 'knowledge group count');
    if (expectedTopics) assert.equal(await page.locator('.knowledge-topic').count(), expectedTopics, 'core topic count');
    assert.equal(await page.locator('.knowledge-groups').evaluate(node => getComputedStyle(node).display), 'grid');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'desktop page overflow');

    const docsNav = page.locator('.navbar a').filter({ hasText: '文档' }).first();
    assert.equal(await docsNav.count(), 1, 'navbar docs entry exists');
    assert.equal(await docsNav.getAttribute('href'), baseurl + '/docs/', 'navbar docs entry points to full catalog');
    const docsResponse = await page.goto(root + '/docs/', { waitUntil: 'networkidle' });
    assert.equal(docsResponse.status(), 200, 'full catalog loads');
    assert.match(await page.locator('h1').textContent(), /完整目录/, 'full catalog title');
    await page.goto(root + '/', { waitUntil: 'networkidle' });

    const brandLogo = page.locator('.navbar .brand__logo');
    assert.equal(await brandLogo.count(), 1, 'navbar brand logo exists');
    assert.match(await brandLogo.getAttribute('src'), new RegExp(expectedLogo.replace('.', '\\.') + '\\?v=[0-9a-f]{12}$'));

    const favicon = page.locator('link[rel="icon"][type="image/svg+xml"]');
    assert.equal(await favicon.count(), 1, 'favicon link exists');
    assert.match(await favicon.getAttribute('href'), new RegExp(expectedFavicon.replace('.', '\\.') + '\\?v=[0-9a-f]{12}$'));

    const initialBackground = await brandLogo.evaluate(node => getComputedStyle(node).backgroundImage);
    assert.notEqual(initialBackground, 'none', 'brand logo has theme gradient');

    await page.locator('#skinPicker > .navbar__icon-btn').click();
    await page.locator('[data-skin-set="violet"]').click();
    assert.equal(await page.locator('html').getAttribute('data-skin'), 'violet');

    const violetBackground = await brandLogo.evaluate(node => getComputedStyle(node).backgroundImage);
    assert.notEqual(violetBackground, initialBackground, 'brand logo follows active skin');

    await checkBrandIcons(page, root);
    await page.setViewportSize({ width: 2560, height: 1440 });
    await checkNavigation(page, root);
    await page.goto(root + '/', { waitUntil: 'networkidle' });
    assert.ok(await page.locator('.knowledge-home').evaluate(node => node.getBoundingClientRect().width >= 1470), 'wide homepage uses desktop space');
    assert.ok(await page.locator('html').evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16.9), 'wide desktop root type scale');
    const docResponse = await page.goto(root + "/docs/01_AI_Storage_KV_Cache/", { waitUntil: 'networkidle' });
    assert.equal(docResponse.status(), 200);
    assert.ok(await page.locator('.page-shell').evaluate(node => node.getBoundingClientRect().width >= 1600), 'wide documentation shell');
    assert.ok(await page.locator('#sidebar .sidebar__link').first().evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 14.5), 'wide sidebar type is readable');
    assert.ok(await page.locator('.toc').evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 14.5), 'wide TOC type is readable');

    await page.setViewportSize({ width: 390, height: 844 });
    await checkBrandIcons(page, root);
    await checkNavigation(page, root);
    await page.goto(root + '/', { waitUntil: 'networkidle' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile page overflow');

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
