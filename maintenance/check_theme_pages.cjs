const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const staticAgents = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1'
];

async function checkThemePages(browser, root) {
  const site = path.resolve('_site');
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'assets/theme-pages.json')));
  const base = new URL(root).pathname;
  const doc = manifest.paths.find(p => p.startsWith(base + '/docs/') && p !== base + '/docs/');
  assert.ok(doc);
  for (const old of ['favicon-check', 'favicon-pilot']) assert.ok(!fs.existsSync(path.join(site, old)), 'Old demos removed');
  for (const canonical of manifest.paths) for (const [profile, palette] of Object.entries(manifest.profiles)) {
    const route = base + '/theme/' + profile + canonical.slice(base.length);
    const file = path.join(site, route.slice(base.length), route.endsWith('/') ? 'index.html' : '');
    const html = fs.readFileSync(file, 'utf8');
    const [skin, mode] = profile.split('/');
    assert.ok(html.includes(`data-skin="${skin}" data-mode="${mode}"`));
    assert.ok(html.includes(`href="${manifest.icons[palette].icon}" data-theme-page-icon`));
    assert.ok(html.includes('noindex,nofollow'));
    assert.ok(!html.includes('data-favicon-script') && !html.includes('document.write'));
    assert.ok(html.indexOf('theme-page-navigation-') < html.indexOf('data-theme-page-icon'), 'Route guard precedes static icons');
    const canonicalTag = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/);
    assert.equal(new URL(canonicalTag[1]).pathname, canonical);
  }
  assert.ok(!fs.readFileSync(path.join(site, 'sitemap.xml'), 'utf8').includes(base + '/theme/'));
  assert.ok(!fs.readFileSync(path.join(site, 'search.json'), 'utf8').includes(base + '/theme/'));
  const skins = [...new Set(Object.keys(manifest.profiles).map(value => value.split('/')[0]))];
  for (const [i, userAgent] of staticAgents.entries()) {
    const context = await browser.newContext({ userAgent, viewport: i === 1 ? { width: 1280, height: 900 } : { width: 390, height: 844 } });
    try {
      await context.addInitScript(() => {
        if (!localStorage.getItem('docsteer-skin')) {
          localStorage.setItem('docsteer-skin', 'aqua');
          localStorage.setItem('docsteer-mode', 'light');
        }
      });
      const page = await context.newPage();
      await page.goto(root + '/', { waitUntil: 'networkidle' });
      await page.waitForURL(root + '/theme/aqua/light/');
      for (const skin of [...skins, 'aqua']) {
        const beforeURL = page.url();
        const beforeIcon = await page.locator('[data-theme-page-icon]').getAttribute('href');
        await page.evaluate(() => { window.themeDocumentMarker = 'same-document'; });
        await page.locator('#skinPicker > .navbar__icon-btn').click();
        await page.locator(`[data-skin-set="${skin}"]`).click();
        await page.waitForFunction(skin => document.documentElement.dataset.skin === skin, skin);
        assert.equal(page.url(), beforeURL);
        assert.equal(await page.evaluate(() => window.themeDocumentMarker), 'same-document');
        assert.equal(await page.locator('[data-theme-page-icon]').getAttribute('href'), beforeIcon);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForURL(root + `/theme/${skin}/light/`);
        const expected = manifest.icons[manifest.profiles[skin + '/light']].icon;
        assert.equal(await page.locator('[data-theme-page-icon]').getAttribute('href'), expected);
        assert.equal(await page.locator('[data-dynamic-favicon]').count(), 0);
        const png = await context.request.get(new URL(expected, root).href);
        assert.equal(png.status(), 200);
        assert.ok(expected.endsWith(`-${createHash('sha256').update(await png.body()).digest('hex').slice(0, 12)}.png`));
      }
      await page.locator(`.knowledge-actions a[href="${base}/theme/aqua/light/docs/"]`).click();
      await page.waitForURL(root + '/theme/aqua/light/docs/');
      await page.locator(`#doc-content a[href="${base}/theme/aqua/light${doc.slice(base.length)}"]`).first().click();
      await page.waitForURL(root + '/theme/aqua/light' + doc.slice(base.length));
      await page.evaluate(doc => {
        const a = document.createElement('a'); a.href = doc; a.id = 'qa-search-result'; a.textContent = 'QA result'; document.body.append(a);
      }, base + '/');
      await page.locator('#qa-search-result').click();
      await page.waitForURL(root + '/theme/aqua/light/');
      await page.locator('#modeToggle').click();
      await page.locator('[data-mode-set="dark"]').click();
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForURL(root + '/theme/aqua/dark/');
      assert.equal(await page.locator('html').getAttribute('data-mode'), 'dark');
      await page.goto(root + '/theme/ember/light/', { waitUntil: 'networkidle' });
      await page.waitForURL(root + '/theme/aqua/dark/');
      const script = await page.locator('script[src*="theme-page-navigation-"]').getAttribute('src');
      const bytes = await (await context.request.get(new URL(script, root).href)).body();
      assert.ok(script.endsWith(`-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.js`));
    } finally { await context.close(); }
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false, userAgent: staticAgents[0] });
  try {
    const page = await noJS.newPage();
    for (const profile of Object.keys(manifest.profiles)) {
      await page.goto(root + '/theme/' + profile + '/', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('link[rel="icon"]').count(), 1);
      assert.equal(await page.locator('link[rel="apple-touch-icon"]').count(), 1);
      assert.equal(await page.locator('html').getAttribute('data-skin'), profile.split('/')[0]);
      assert.equal(await page.locator('html').getAttribute('data-mode'), profile.split('/')[1]);
      await page.locator(`.knowledge-actions a[href="${base}/theme/${profile}/docs/"]`).click();
      await page.waitForURL(root + '/theme/' + profile + '/docs/');
    }
  } finally { await noJS.close(); }
  for (const userAgent of [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  ]) {
    const chrome = await browser.newContext({ userAgent });
    try {
      const page = await chrome.newPage();
      await page.goto(root + '/theme/ember/light/', { waitUntil: 'networkidle' });
      await page.waitForURL(root + '/');
      assert.equal(await page.locator('[data-dynamic-favicon]').count(), 1);
      assert.equal(await page.locator('[data-theme-page-icon]').count(), 0);
    } finally { await chrome.close(); }
  }
  console.log(`Safari/iOS Chrome static routing: ${manifest.paths.length} pages × ${Object.keys(manifest.profiles).length} profiles, all skins, reload/navigation/modes, no-JS, search links, hashes and desktop/Android Chrome canonical URLs passed. Browser tab UI is not tested.`);
}
module.exports = { checkThemePages };
