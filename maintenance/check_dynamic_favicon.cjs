const assert = require('node:assert/strict');

async function checkDynamicFavicon(page, root, documentUrl) {
  const saved = await page.evaluate(() => ({
    skin: document.documentElement.getAttribute('data-skin'),
    mode: document.documentElement.getAttribute('data-mode'),
    storedSkin: localStorage.getItem('docsteer-skin')
  }));
  async function snapshot() {
    await page.waitForFunction(() => {
      const icon = document.querySelector('[data-dynamic-favicon]');
      const probe = document.createElement('span');
      probe.hidden = true;
      document.body.append(probe);
      const palette = ['brand', 'accent'].map(name => {
        probe.style.color = `var(--${name})`;
        return getComputedStyle(probe).color;
      }).join('|');
      probe.remove();
      return icon && icon.dataset.palette === palette && icon.href.startsWith('data:image/png;base64,');
    });
    return page.evaluate(async () => {
      const icon = document.querySelector('[data-dynamic-favicon]');
      const image = new Image();
      image.src = icon.href;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return { href: icon.href, palette: icon.dataset.palette, width: image.naturalWidth,
        pixel: [...ctx.getImageData(4, 32, 1, 1).data],
        count: document.querySelectorAll('[data-dynamic-favicon]').length,
        apple: document.querySelector('link[rel="apple-touch-icon"]').href };
    });
  }
  const initial = await snapshot();
  assert.equal(initial.width, 64);
  assert.equal(initial.count, 1);
  const skins = await page.locator('[data-skin-set]').evaluateAll(nodes => nodes.map(n => n.dataset.skinSet));
  assert.ok(skins.includes('violet') && skins.includes('aqua'));
  let previous = initial;
  for (const skin of skins) {
    await page.locator('#skinPicker > .navbar__icon-btn').click();
    await page.locator(`[data-skin-set="${skin}"]`).click();
    const result = await snapshot();
    if (result.palette !== previous.palette) {
      assert.notEqual(result.href, previous.href, 'PNG changes with theme');
      assert.notDeepEqual(result.pixel, previous.pixel, 'Rendered background changes');
    }
    assert.equal(result.apple, initial.apple, 'Apple icon stays static');
    assert.equal(result.count, 1, 'No duplicate dynamic links');
    previous = result;
  }
  await page.locator('#skinPicker > .navbar__icon-btn').click();
  await page.locator('[data-skin-set="violet"]').click();
  const violet = await snapshot();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await snapshot()).palette, violet.palette, 'Saved skin survives reload');
  for (const url of [root + '/docs/', documentUrl, root + '/']) {
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal((await snapshot()).palette, violet.palette, 'Saved skin across routes');
  }
  for (const mode of ['dark', 'light']) {
    await page.evaluate(mode => document.documentElement.dataset.mode = mode, mode);
    await snapshot();
  }
  // Rapid changes: only the final palette may be published.
  await page.evaluate(() => {
    ['violet', 'aqua', 'violet', 'aqua'].forEach(s => document.documentElement.dataset.skin = s);
  });
  await snapshot();
  await page.evaluate(() => document.documentElement.removeAttribute('data-mode'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await snapshot();
  await page.emulateMedia({ colorScheme: 'light' });
  await snapshot();
  await page.evaluate(saved => {
    for (const key of ['skin', 'mode']) {
      if (saved[key] === null) document.documentElement.removeAttribute(`data-${key}`);
      else document.documentElement.setAttribute(`data-${key}`, saved[key]);
    }
    if (saved.storedSkin === null) localStorage.removeItem('docsteer-skin');
    else localStorage.setItem('docsteer-skin', saved.storedSkin);
  }, saved);
  await snapshot();

  const failedContext = await page.context().browser().newContext();
  const failed = await failedContext.newPage();
  try {
    await failed.route('**/assets/images/*.svg*', route => {
      if (route.request().resourceType() === 'fetch') return route.abort();
      return route.continue();
    });
    await failed.goto(root + '/', { waitUntil: 'networkidle' });
    assert.equal(await failed.locator('[data-dynamic-favicon]').count(), 0);
    assert.equal(await failed.locator('link[rel="icon"][media="not all"]').count(), 0, 'Source failure keeps static icons active');
  } finally { await failedContext.close(); }
  const noJS = await page.context().browser().newContext({ javaScriptEnabled: false });
  try {
    const fallback = await noJS.newPage();
    await fallback.goto(root + '/', { waitUntil: 'networkidle' });
    assert.equal(await fallback.locator('[data-dynamic-favicon]').count(), 0);
    assert.equal(await fallback.locator('link[rel="icon"]').count(), 3, 'No-JS static icons');
  } finally { await noJS.close(); }
  console.log('Dynamic favicon: all skins, PNG pixels, reload/routes, modes/system theme, rapid changes and fallback passed.');
}
module.exports = { checkDynamicFavicon };
