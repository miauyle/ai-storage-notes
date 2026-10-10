// Run after Jekyll, before validation/upload. CSS and UI are the palette source.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

async function boundedStyle(page, content, href) {
  let timer;
  try {
    return await Promise.race([
      page.addStyleTag({ content }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`CSS injection timed out: ${href}`)), 15000); })
    ]);
  } finally { clearTimeout(timer); }
}

(async () => {
  const site = path.resolve('_site');
  const base = process.argv[2];
  if (!/^\/[a-z0-9-]+$/.test(base || '')) throw new Error('Provide the project baseurl');
  const home = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const browser = await chromium.launch({ headless: true });
  let palettes, source;
  try {
    // Permit Playwright's injected style load callbacks, but never run site scripts.
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.route('**/*', route => route.abort());
    console.log('Theme icons: loading built homepage with site scripts removed.');
    await page.setContent(home.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
    const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
    for (const href of styles) {
      if (!href.startsWith(base + '/assets/')) continue;
      const file = path.join(site, href.slice(base.length).split('?')[0]);
      console.log(`Theme icons: reading compiled CSS ${href}.`);
      await boundedStyle(page, fs.readFileSync(file, 'utf8'), href);
    }
    source = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
    palettes = await page.evaluate(() => {
      const root = document.documentElement;
      const defaultSkin = root.getAttribute('data-skin');
      const skins = [...new Set([defaultSkin, ...[...document.querySelectorAll('[data-skin-set]')].map(n => n.dataset.skinSet)])];
      const result = {};
      const probe = document.createElement('span');
      document.body.append(probe);
      for (const skin of skins) {
        if (skin === null) root.removeAttribute('data-skin');
        else root.dataset.skin = skin;
        for (const mode of ['light', 'dark']) {
          root.dataset.mode = mode;
          const colors = ['brand', 'accent'].map(name => {
            probe.style.color = `var(--${name})`;
            return getComputedStyle(probe).color;
          });
          result[colors.join('|')] = colors;
        }
      }
      probe.remove();
      return result;
    });
  } finally { await browser.close(); }
  if (!source.startsWith(base + '/assets/')) throw new Error('Invalid favicon source');
  const rendered = spawnSync('python3', [path.join(__dirname, 'render_theme_icons.py'),
    path.join(site, source.slice(base.length).split('?')[0]),
    path.join(site, 'assets/images/generated-icons'), base],
    { input: JSON.stringify(palettes), encoding: 'utf8' });
  if (rendered.status !== 0) throw new Error(rendered.stderr || rendered.error || 'PNG rendering failed');
  const manifest = JSON.stringify(JSON.parse(rendered.stdout)).replace(/</g, '\\u003c');
  let count = 0;
  function patch(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) { patch(file); continue; }
      if (!item.name.endsWith('.html')) continue;
      let html = fs.readFileSync(file, 'utf8');
      html = html.replace(/<script id="favicon-palettes" type="application\/json">.*?<\/script>\s*/gs, '');
      if (!html.includes('data-favicon-script')) continue;
      html = html.replace(/<script (?=[^>]*data-favicon-script)/,
        `<script id="favicon-palettes" type="application/json">${manifest}</script>\n<script `);
      fs.writeFileSync(file, html);
      count++;
    }
  }
  patch(site);
  if (!count) throw new Error('No pages received the icon manifest');
  console.log(`Theme icons: ${Object.keys(palettes).length} computed palettes, ${count} pages, content-hashed PNG files.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
