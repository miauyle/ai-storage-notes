const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

async function checkBrandIcons(page, root) {
  const original = page.url();
  const iconsByRoute = [];
  await page.goto(root + '/docs/', { waitUntil: 'networkidle' });
  const documentUrl = await page.locator('a[href]').evaluateAll((nodes, root) => {
    const prefix = new URL(root).pathname + '/docs/';
    return nodes.map(n => n.href).find(h => {
      const u = new URL(h);
      return u.origin === new URL(root).origin && u.pathname.startsWith(prefix) && u.pathname !== prefix && !u.hash;
    });
  }, root);
  assert.ok(documentUrl, 'A real document must be available');
  for (const url of [root + '/', root + '/docs/', documentUrl]) {
    await page.goto(url, { waitUntil: 'networkidle' });
    const icons = await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(nodes => nodes.map(n => ({ rel: n.rel, type: n.type, sizes: n.sizes.value, href: n.href })));
    assert.deepEqual(icons.map(n => [n.rel, n.type, n.sizes]), [
      ['icon', 'image/svg+xml', 'any'], ['icon', 'image/png', '32x32'],
      ['icon', 'image/png', '192x192'], ['apple-touch-icon', 'image/png', '180x180']
    ]);
    iconsByRoute.push(icons);
    const logo = page.locator('.navbar .brand__logo');
    assert.equal(await logo.count(), 1);
    const assets = [...icons, { href: new URL(await logo.getAttribute('src'), page.url()).href }];
    for (const asset of assets) {
      const u = new URL(asset.href);
      assert.ok(u.pathname.startsWith(new URL(root).pathname + '/assets/'), 'Project subpath is preserved');
      const response = await page.request.get(asset.href);
      assert.equal(response.status(), 200, asset.href);
      const body = await response.body();
      assert.equal(u.searchParams.get('v'), createHash('sha256').update(body).digest('hex').slice(0, 12));
      if (asset.type === 'image/png') {
        assert.equal(body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        const size = Number(asset.sizes.split('x')[0]);
        assert.equal(body.readUInt32BE(16), size);
        assert.equal(body.readUInt32BE(20), size);
      }
    }
    assert.ok(await logo.evaluate(n => n.complete && n.naturalWidth > 0), 'Logo decodes');
    assert.equal(await logo.evaluate(n => getComputedStyle(n).flexShrink), '0', 'Logo keeps its width on mobile');
  }
  assert.deepEqual(iconsByRoute[0], iconsByRoute[1]);
  assert.deepEqual(iconsByRoute[0], iconsByRoute[2]);
  await page.goto(original, { waitUntil: 'networkidle' });
}
module.exports = { checkBrandIcons };
