const assert = require('node:assert/strict');

// Route expectations come from the rendered catalog, not a second page list.
async function checkNavigation(page, root) {
  const original = page.url();
  const base = new URL(root).pathname;
  const mobile = page.viewportSize().width < 960;
  const catalog = root + '/docs/';
  async function arrive(url) {
    await page.waitForURL(url);
    assert.equal(page.url(), url);
    assert.ok(await page.locator('h1').count() >= 1, 'Destination page has a title');
  }
  async function primary(href) {
    if (mobile) {
      await page.locator('#sidebarToggle').click();
      assert.equal(await page.locator('#sidebarToggle').getAttribute('aria-expanded'), 'true');
      await page.locator(`#sidebar .sidebar__primary a[href="${href}"]`).click();
      assert.equal(await page.locator('#sidebarToggle').getAttribute('aria-expanded'), 'false');
    } else {
      await page.locator(`.navbar__links a[href="${href}"]`).click();
    }
  }
  await page.goto(root + '/', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.navbar .brand').getAttribute('href'), base + '/');
  const shortcuts = page.locator(`.knowledge-actions a[href="${base}/docs/"]`);
  assert.equal(await shortcuts.count(), 1, 'Homepage exposes the full catalog directly');
  await shortcuts.click();
  await arrive(catalog);

  const entries = await page.locator('#sidebar .sidebar__nav a[href]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
  assert.ok(entries.length > 0);
  assert.equal(new Set(entries).size, entries.length, 'No duplicate sidebar destinations');
  const catalogLinks = await page.locator('#doc-content a[href]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
  for (const href of entries) assert.ok(catalogLinks.includes(href), 'Catalog includes sidebar destination: ' + href);

  // Verify every sidebar page and its reading-order edges without rendering
  // every diagram again. Existing UI tests separately render all content.
  for (const [index, href] of entries.entries()) {
    assert.ok(href.startsWith(base + '/'), 'Sidebar stays in this project');
    const response = await page.request.get(new URL(href, root).href);
    assert.equal(response.status(), 200, href);
    const html = await response.text();
    const links = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return {
        brand: doc.querySelector('.navbar .brand')?.getAttribute('href'),
        docs: [...doc.querySelectorAll('.navbar__links a')].filter(n => n.textContent.trim() === '文档').map(n => n.getAttribute('href')),
        pager: [...doc.querySelectorAll('.doc-pager a')].map(n => n.getAttribute('href'))
      };
    }, html);
    assert.equal(links.brand, base + '/');
    assert.deepEqual(links.docs, [base + '/docs/']);
    // Pages outside the docs collection (e.g. SOURCES.html) have no pager.
    if (href.startsWith(base + '/docs/')) {
      assert.deepEqual(links.pager, [entries[index - 1], entries[index + 1]].filter(Boolean), 'Reading order: ' + href);
    }
  }

  const first = new URL(entries[0], root).href;
  await page.locator(`#doc-content a[href="${entries[0]}"]`).first().click();
  await arrive(first);
  await primary(base + '/docs/');
  await arrive(catalog);
  await page.locator('.navbar .brand').click();
  await arrive(root + '/');
  await primary(base + '/#knowledge-map');
  await arrive(root + '/#knowledge-map');
  assert.equal(await page.locator('#knowledge-map').count(), 1);
  const group = page.locator('.knowledge-overview a').first();
  const fragment = await group.getAttribute('href');
  await group.click();
  await arrive(root + '/' + fragment);
  assert.equal(await page.locator(fragment).count(), 1);
  await page.goto(original, { waitUntil: 'networkidle' });
}

module.exports = { checkNavigation };
