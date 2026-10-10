/* HTTP PNG variants are built from computed theme colors. */
(() => {
  const manifest = document.getElementById('favicon-palettes');
  if (!manifest) return; // Plain Jekyll builds retain the static fallback.
  const palettes = JSON.parse(manifest.textContent);
  const root = document.documentElement;
  const originals = [...document.querySelectorAll('[data-static-brand-icon]')];
  const rels = originals.map(icon => icon.getAttribute('rel'));
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
  function update() {
    const key = colors();
    if (key === current) return;
    const version = ++serial;
    const variant = palettes[key];
    if (!variant) { fallback(); return; }
    const links = [['icon', '64x64', variant.icon], ['apple-touch-icon', '180x180', variant.apple]];
    // Replace nodes and remove competing static icon declarations, including Apple Touch.
    active.forEach(icon => icon.remove());
    active = links.map(([rel, size, href]) => {
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
    frame = requestAnimationFrame(update);
  }
  // Non-deferred head script: use the persisted theme on initial navigation.
  update();
  new MutationObserver(schedule).observe(root, {
    attributes: true, attributeFilter: ['data-skin', 'data-mode', 'class', 'style']
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
})();
