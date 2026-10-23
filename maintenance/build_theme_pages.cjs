const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');

function buildThemePages(site, base, icons, profiles, defaultSkin) {
  const pages = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (['assets', 'theme', 'favicon-check', 'favicon-pilot'].includes(entry.name)) continue;
        collect(path.join(directory, entry.name));
      } else if (entry.name.endsWith('.html') && entry.name !== '404.html') {
        const file = path.join(directory, entry.name);
        const html = fs.readFileSync(file, 'utf8');
        if (!html.includes('data-favicon-script')) continue;
        const relative = path.relative(site, file).split(path.sep).join('/');
        const route = '/' + (relative.endsWith('index.html') ? relative.slice(0, -10) : relative);
        pages.push({ file, html, route: base + route });
      }
    }
  }
  collect(site);
  if (!pages.length) throw new Error('No themed pages found');
  const paths = pages.map(page => page.route);
  const validPaths = new Set(paths);
  const skins = [...new Set(Object.keys(profiles).map(value => value.split('/')[0]))];
  if (!skins.includes(defaultSkin)) throw new Error('Default theme profile missing');
  const script = fs.readFileSync(path.join(__dirname, 'theme-page-navigation.js'));
  const scriptName = `theme-page-navigation-${createHash('sha256').update(script).digest('hex').slice(0, 12)}.js`;
  fs.writeFileSync(path.join(site, 'assets/js', scriptName), script);
  function inject(html, page, profile) {
    const config = { base, canonical: page.route, profile, paths, skins, defaultSkin };
    html = html.replace(/<script\b[^>]*data-theme-mode-script[^>]*>[\s\S]*?<\/script>\s*/g, '');
    const routing = `<script src="${base}/assets/js/theme-mode.js?v=4" data-theme-mode-script></script>\n<script id="theme-page-config" type="application/json">${json(config)}</script>\n<script src="${base}/assets/js/${scriptName}"></script>`;
    // Select the document before declaring any old-profile icon. Keep charset first.
    const charset = /<meta\b[^>]*charset\s*=[^>]*>/i;
    if (charset.test(html)) return html.replace(charset, tag => tag + '\n' + routing);
    return html.replace(/<head\b[^>]*>/i, tag => tag + '\n' + routing);
  }
  let count = 0;
  for (const page of pages) {
    // Normal URLs and ordinary-browser dynamic behavior are preserved.
    fs.writeFileSync(page.file, inject(page.html, page, null));
    for (const [profile, palette] of Object.entries(profiles)) {
      if (!/^[a-z0-9-]+\/(light|dark)$/.test(profile)) throw new Error(`Invalid profile ${profile}`);
      const png = icons[palette];
      if (!png) throw new Error(`Missing PNG palette ${palette}`);
      const [skin, mode] = profile.split('/');
      let html = page.html
        .replace(/<link\b[^>]*data-static-brand-icon[^>]*>\s*/g, '')
        .replace(/<script\b[^>]*id="favicon-palettes"[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<script\b[^>]*data-favicon-script[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<script>\s*\(function\s*\(\)\s*\{[\s\S]*?localStorage\.getItem\('docsteer-mode'\)[\s\S]*?<\/script>/, '');
      html = html.replace(/<html\b[^>]*>/, tag => tag.replace(/\sdata-(?:skin|mode)="[^"]*"/g, '')
        .replace(/>$/, ` data-skin="${skin}" data-mode="${mode}">`));
      html = html.replace('</head>', `<meta name="robots" content="noindex,nofollow">\n<link rel="icon" type="image/png" sizes="64x64" href="${png.icon}" data-theme-page-icon>\n<link rel="apple-touch-icon" sizes="180x180" href="${png.apple}">\n</head>`);
      if (html.includes('data-static-brand-icon') || html.includes('data-favicon-script')) throw new Error('Static variant retained dynamic icon handling');
      // Rebase links against the original URL; assets/edit/canonical metadata are not rewritten.
      const canonicalURL = page.html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/);
      const origin = canonicalURL ? new URL(canonicalURL[1]).origin : 'https://example.invalid';
      html = html.replace(/<a\b[^>]*>/g, tag => {
        if (/\bdownload(?:\s|=|>)/.test(tag)) return tag;
        return tag.replace(/href="([^"]+)"/, (attribute, href) => {
          const url = new URL(href.replace(/&amp;/g, '&'), origin + page.route);
          if (url.origin !== origin || !validPaths.has(url.pathname)) return attribute;
          const value = base + '/theme/' + profile + url.pathname.slice(base.length) + url.search + url.hash;
          return `href="${value.replace(/&/g, '&amp;')}"`;
        });
      });
      const destination = path.join(site, 'theme', profile, page.route.slice(base.length));
      const file = page.route.endsWith('/') ? path.join(destination, 'index.html') : destination;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, inject(html, page, profile));
      count++;
    }
  }
  fs.writeFileSync(path.join(site, 'assets/theme-pages.json'), json({ base, paths, profiles, icons, defaultSkin }));
  console.log(`Static theme pages: ${pages.length} original routes, ${Object.keys(profiles).length} profiles, ${count} variants; canonical/search/sitemap preserved.`);
}
module.exports = { buildThemePages };
