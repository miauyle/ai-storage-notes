// Engine/HTTP regression only; real Safari/Chrome tab UI is confirmed separately.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { webkit } = require('playwright');
const { checkBrandIcons } = require('./check_brand_icons.cjs');
const { checkThemePages } = require('./check_theme_pages.cjs');

(async () => {
  const base = process.argv[2];
  if (!/^\/[a-z0-9-]+$/.test(base || '')) throw new Error('Provide project baseurl');
  const site = path.resolve('_site');
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!url.startsWith(base + '/')) { res.writeHead(404).end(); return; }
    let file = path.resolve(site, '.' + url.slice(base.length));
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
    const root = `http://127.0.0.1:${server.address().port}${base}`;
    await checkThemePages(browser, root);
    // Android Chrome's existing dynamic branch remains unchanged. This is a UA/DOM
    // regression in WebKit, not a test of Android Chrome's actual tab interface.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', isMobile: true, deviceScaleFactor: 3, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.goto(root + '/', { waitUntil: 'networkidle' });
      await checkBrandIcons(page, root);
    } finally { await context.close(); }
    console.log('WebKit static Safari/iOS Chrome routing and unchanged Android-UA dynamic DOM/resource regression passed.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
