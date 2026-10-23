// Safari and iOS Chrome select static-icon HTML. Other browsers retain canonical URLs.
(() => {
  const node = document.getElementById('theme-page-config');
  if (!node) return;
  const config = JSON.parse(node.textContent);
  const ua = navigator.userAgent;
  const staticTheme = /CriOS\//.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|OPiOS|Android/.test(ua));
  if (!staticTheme) {
    if (config.profile) location.replace(config.canonical + location.search + location.hash);
    return;
  }
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const paths = new Set(config.paths);
  const prefix = config.base + '/theme/';
  function restore() {
    const appearance = window.DocSteerAppearance && window.DocSteerAppearance.sync();
    try {
      const skin = localStorage.getItem('docsteer-skin');
      const mode = appearance || localStorage.getItem('docsteer-mode');
      root.dataset.skin = config.skins.includes(skin) ? skin : (config.profile?.split('/')[0] || config.defaultSkin);
      root.dataset.mode = ['light', 'dark', 'auto'].includes(mode) ? mode : 'auto';
    } catch (_) {
      root.dataset.skin = config.profile?.split('/')[0] || config.defaultSkin;
      root.dataset.mode = appearance || config.profile?.split('/')[1] || 'auto';
    }
  }
  function profile() {
    const skin = config.skins.includes(root.dataset.skin) ? root.dataset.skin : config.defaultSkin;
    const mode = root.dataset.mode;
    return skin + '/' + (mode === 'dark' || (mode !== 'light' && media.matches) ? 'dark' : 'light');
  }
  function variant(canonical) { return prefix + profile() + canonical.slice(config.base.length); }
  function canonical(pathname) {
    if (!pathname.startsWith(prefix)) return pathname;
    const match = pathname.slice(prefix.length).match(/^[a-z0-9-]+\/(light|dark)(\/.*)$/);
    return match ? config.base + match[2] : pathname;
  }
  function navigate() {
    const target = variant(config.canonical);
    if (location.pathname !== target) {
      // The guard runs before icon links. Do not finish parsing a stale profile's
      // head while replacement navigation is pending (including manual reload).
      window.stop();
      location.replace(target + location.search + location.hash);
      return true;
    }
    return false;
  }
  restore();
  if (navigate()) return;
  function rewrite(link) {
    if (!link.hasAttribute('href') || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    const original = canonical(url.pathname);
    if (paths.has(original)) link.href = variant(original) + url.search + url.hash;
  }
  let frame;
  function update() {
    // Do not change location/history or the current document's static icon on skin changes.
    document.querySelectorAll('a[href]').forEach(rewrite);
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }
  document.addEventListener('DOMContentLoaded', () => {
    update();
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-skin', 'data-mode'] });
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (link) rewrite(link); // Also catches search results added immediately before clicking.
    }, true);
    media.addEventListener('change', schedule);
    function resync() { restore(); schedule(); }
    window.addEventListener('storage', event => {
      if (event.key !== null && !['docsteer-skin', 'docsteer-mode'].includes(event.key)) return;
      resync();
    });
    // iOS may suspend a background tab. Recover shared preferences even if its
    // storage event was delayed/missed; do not reload on focus or passive changes.
    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
    window.addEventListener('pageshow', event => {
      if (event.persisted) { restore(); if (navigate()) return; }
      schedule();
    });
  });
})();
