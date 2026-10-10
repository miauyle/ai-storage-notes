/* HTTP PNG variants are built from computed theme colors. */
(() => {
  const manifest = document.getElementById('favicon-palettes');
  const root = document.documentElement;
  const originals = [...document.querySelectorAll('[data-static-brand-icon]')];
  const rels = originals.map(icon => icon.dataset.staticRel);
  let active = [], current = '', serial = 0, frame;
  function colors() {
    const probe = document.createElement('span');
    probe.hidden = true;
    root.append(probe);
    const key = ['brand', 'accent'].map(name => {
      probe.style.color = `var(--${name})`;
      return getComputedStyle(probe).color;
    }).join('|');
    probe.remove();
    return key;
  }
  function fallback() {
    active.forEach(icon => icon.remove());
    active = [];
    originals.forEach((icon, i) => icon.setAttribute('rel', rels[i]));
    current = '';
  }
  if (!manifest) { fallback(); return; }
  let palettes;
  try { palettes = JSON.parse(manifest.textContent); }
  catch (_) { fallback(); return; }
  const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function update(parser = false) {
    const key = colors();
    if (key === current) return;
    const version = ++serial;
    const variant = palettes[key];
    if (!variant) { fallback(); return; }
    const links = [['icon', '64x64', variant.icon], ['apple-touch-icon', '180x180', variant.apple]];
    // Replace nodes and remove competing static icon declarations, including Apple Touch.
    active.forEach(icon => icon.remove());
    if (parser) {
      // Only during a parser-inserted, synchronous head script. Never write after load.
      document.write(links.map(([rel, size, href]) =>
        `<link rel="${rel}" type="image/png" sizes="${size}" href="${escapeAttribute(href)}" data-palette="${escapeAttribute(key)}" ${rel === 'icon' ? 'data-dynamic-favicon' : 'data-dynamic-apple-icon'} data-favicon-parser-icon>`
      ).join(''));
      active = [...document.querySelectorAll('[data-favicon-parser-icon]')];
    } else active = links.map(([rel, size, href]) => {
      const icon = document.createElement('link');
      icon.rel = rel;
      icon.type = 'image/png';
      icon.sizes = size;
      icon.href = href;
      icon.dataset.palette = key;
      if (rel === 'icon') icon.dataset.dynamicFavicon = '';
      else icon.dataset.dynamicAppleIcon = '';
      document.head.append(icon);
      return icon;
    });
    originals.forEach(icon => icon.removeAttribute('rel'));
    current = key;
    links.forEach(([, , href]) => {
      const image = new Image();
      image.onerror = () => { if (version === serial) fallback(); };
      image.src = href;
    });
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => update());
  }
  // Non-deferred head script: use the persisted theme on initial navigation.
  const script = document.currentScript;
  update(document.readyState === 'loading' && !!script?.hasAttribute('data-favicon-script') && !script.async && !script.defer);
  new MutationObserver(schedule).observe(root, {
    attributes: true, attributeFilter: ['data-skin', 'data-mode', 'class', 'style']
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
})();
