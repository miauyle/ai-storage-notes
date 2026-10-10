// WebKit engine regression, not a claim about real Safari/Chrome tab UI.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { webkit } = require('playwright');
const { checkBrandIcons } = require('./check_brand_icons.cjs');

(async () => {
  const base = process.argv[2];
  if (!/^\/[a-z0-9-]+$/.test(base || '')) throw new Error('Provide project baseurl');
  const site = path.resolve('_site');
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.mjs': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!url.startsWith(base + '/')) { res.writeHead(404).end(); return; }
    let file = path.resolve(site, '.' + url.slice(base.length));
    if (!file.startsWith(site + path.sep)) { res.writeHead(404).end(); return; }
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 3, hasTouch: true });
    const page = await context.newPage();
    const root = `http://127.0.0.1:${server.address().port}${base}`;
    await page.goto(root + '/', { waitUntil: 'networkidle' });
    await checkBrandIcons(page, root);
    console.log('Mobile WebKit icon resource and theme regression passed (browser UI requires real-device confirmation).');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
