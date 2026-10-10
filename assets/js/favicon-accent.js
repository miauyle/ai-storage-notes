/* Shared by all four knowledge sites. Static icons remain the fallback. */
(() => {
  const source = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
  if (!source) return;
  const root = document.documentElement;
  const staticIcons = [...document.querySelectorAll('link[rel="icon"]')];
  const media = staticIcons.map(icon => icon.getAttribute('media'));
  let template;
  let current = '';
  let serial = 0;
  let frame = 0;
  let dynamic;

  function colors() {
    const probe = document.createElement('span');
    probe.hidden = true;
    document.body.append(probe);
    const result = ['brand', 'accent'].map(name => {
      probe.style.color = `var(--${name})`;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    return result;
  }

  function fallback() {
    if (dynamic) dynamic.remove();
    dynamic = undefined;
    staticIcons.forEach((icon, index) => {
      if (media[index] === null) icon.removeAttribute('media');
      else icon.setAttribute('media', media[index]);
    });
    current = '';
  }

  async function update() {
    const palette = colors();
    const key = palette.join('|');
    if (key === current) return;
    const version = ++serial;
    try {
      if (!template) {
        const response = await fetch(source.href);
        if (!response.ok) throw new Error('Favicon source unavailable');
        const text = await response.text();
        const svg = new DOMParser().parseFromString(text, 'image/svg+xml');
        if (svg.querySelector('parsererror') || !svg.querySelector('[data-theme-color="brand"]') || !svg.querySelector('[data-theme-color="accent"]')) {
          throw new Error('Favicon theme markers missing');
        }
        template = svg;
      }
      const svg = template.cloneNode(true);
      svg.documentElement.setAttribute('width', '64');
      svg.documentElement.setAttribute('height', '64');
      ['brand', 'accent'].forEach((name, index) => {
        svg.querySelectorAll(`[data-theme-color="${name}"]`).forEach(stop => stop.setAttribute('stop-color', palette[index]));
      });
      const image = new Image();
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      await loaded;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(image, 0, 0, 64, 64);
      const png = canvas.toDataURL('image/png');
      if (version !== serial) return; // Never publish an obsolete color after rapid toggles.
      if (!dynamic) {
        dynamic = document.createElement('link');
        dynamic.rel = 'icon';
        dynamic.type = 'image/png';
        dynamic.sizes = '64x64';
        dynamic.dataset.dynamicFavicon = '';
        document.head.append(dynamic);
      }
      dynamic.href = png;
      dynamic.dataset.palette = key;
      staticIcons.forEach(icon => icon.media = 'not all');
      current = key;
    } catch (_) {
      if (version === serial) fallback();
    }
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }
  function start() {
    schedule();
    new MutationObserver(schedule).observe(root, {
      attributes: true, attributeFilter: ['data-skin', 'data-mode', 'class', 'style']
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
    window.addEventListener('pageshow', schedule);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
