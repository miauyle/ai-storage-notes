// Two project paths share one origin/storage, just like the four Pages sites.
const assert = require('node:assert/strict');

async function checkSharedTheme(browser, root, peerRoot) {
  for (const userAgent of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1'
  ]) {
    const context = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 } });
    try {
      const a = await context.newPage();
      await a.goto(root + '/', { waitUntil: 'networkidle' });
      await a.evaluate(() => {
        localStorage.setItem('docsteer-skin', 'aqua');
        localStorage.setItem('docsteer-mode', 'light');
      });
      await a.goto(root + '/theme/aqua/light/', { waitUntil: 'networkidle' });
      const b = await context.newPage();
      await b.goto(peerRoot + '/theme/aqua/light/?qa=shared#top', { waitUntil: 'networkidle' });
      const manifest = await (await context.request.get(peerRoot + '/assets/theme-pages.json')).json();
      async function choose(skin) {
        await a.locator('#skinPicker > .navbar__icon-btn').click();
        await a.locator(`[data-skin-set="${skin}"]`).click();
        await b.waitForFunction(skin => document.documentElement.dataset.skin === skin, skin);
      }
      async function matches(page, origin, skin, mode) {
        await page.waitForURL(origin + `/theme/${skin}/${mode}/**`);
        assert.equal(await page.locator('html').getAttribute('data-skin'), skin);
        assert.equal(await page.locator('[data-dynamic-favicon]').count(), 0);
        const href = await page.locator('[data-theme-page-icon]').getAttribute('href');
        const expected = manifest.icons[manifest.profiles[`${skin}/${mode}`]].icon;
        assert.equal(href, expected.replace(new URL(peerRoot).pathname, new URL(origin).pathname));
      }
      for (const skin of ['ember', 'mint', 'violet']) {
        const beforeURL = b.url();
        const beforeIcon = await b.locator('[data-theme-page-icon]').getAttribute('href');
        await b.evaluate(() => { window.sharedDocumentMarker = 'unchanged'; });
        await choose(skin);
        assert.equal(b.url(), beforeURL, 'Passive synchronization must not navigate');
        assert.equal(await b.evaluate(() => window.sharedDocumentMarker), 'unchanged');
        assert.equal(await b.locator('[data-theme-page-icon]').getAttribute('href'), beforeIcon);
        await a.reload({ waitUntil: 'networkidle' });
        await matches(a, root, skin, 'light');
        await b.reload({ waitUntil: 'networkidle' });
        await matches(b, peerRoot, skin, 'light');
        assert.equal(new URL(b.url()).search, '?qa=shared');
        assert.equal(new URL(b.url()).hash, '#top');
        // Repeated refresh must not toggle or revert to the old profile.
        await b.reload({ waitUntil: 'networkidle' });
        await matches(b, peerRoot, skin, 'light');
      }
      await a.locator('#modeToggle').click();
      await a.locator('[data-mode-set="dark"]').click();
      await b.waitForFunction(() => document.documentElement.dataset.mode === 'dark');
      await b.reload({ waitUntil: 'networkidle' });
      await matches(b, peerRoot, 'violet', 'dark');

      // Model a suspended tab missing an event: focus/visibility resync from storage.
      await b.evaluate(() => {
        window.addEventListener('storage', event => event.stopImmediatePropagation(), { capture: true, once: true });
      });
      await a.locator('#skinPicker > .navbar__icon-btn').click();
      await a.locator('[data-skin-set="graphite"]').click();
      await b.waitForFunction(() => localStorage.getItem('docsteer-skin') === 'graphite');
      const heldURL = b.url();
      await b.evaluate(() => window.dispatchEvent(new Event('focus')));
      await b.waitForFunction(() => document.documentElement.dataset.skin === 'graphite');
      assert.equal(b.url(), heldURL);
      await b.reload({ waitUntil: 'networkidle' });
      await matches(b, peerRoot, 'graphite', 'dark');
    } finally { await context.close(); }
  }
  console.log('Shared theme: same-origin project paths, passive skin/mode changes, reloads, static icons, query/hash and suspended-tab focus recovery passed. Tab UI is not tested.');
}
module.exports = { checkSharedTheme };
