// Keep DocSteer's original button and icons. A system change ends a manual override.
(() => {
  if (window.DocSteerAppearance) return;
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const modeKey = 'docsteer-mode';
  const systemKey = 'docsteer-mode-system';
  const system = () => media.matches ? 'dark' : 'light';
  const manual = value => value === 'light' || value === 'dark';
  let seenSystem = system();
  let memory = { mode: 'auto', system: null };
  let storageAvailable = true;

  function read() {
    if (storageAvailable) {
      try {
        const value = localStorage.getItem(modeKey);
        memory = { mode: manual(value) ? value : 'auto', system: localStorage.getItem(systemKey) };
      } catch (_) { storageAvailable = false; }
    }
    return memory;
  }
  function save(mode) {
    memory = { mode, system: manual(mode) ? system() : null };
    if (storageAvailable) {
      try {
        if (manual(mode)) {
          localStorage.setItem(systemKey, memory.system);
          localStorage.setItem(modeKey, mode);
        } else {
          localStorage.removeItem(modeKey);
          localStorage.removeItem(systemKey);
        }
      } catch (_) { storageAvailable = false; }
    }
    return mode;
  }
  function apply(mode) {
    if (root.dataset.mode !== mode) root.dataset.mode = mode;
    return mode;
  }
  function reset() {
    seenSystem = system();
    return apply(save('auto'));
  }
  function sync() {
    if (seenSystem !== system()) return reset();
    const saved = read();
    // Compare before paint/routing: the system may have changed while no page was open.
    if (manual(saved.mode) && manual(saved.system) && saved.system !== system()) return reset();
    // Existing manual preferences have no snapshot yet; preserve and migrate them once.
    if (manual(saved.mode) && !manual(saved.system)) save(saved.mode);
    return apply(saved.mode);
  }
  window.DocSteerAppearance = { sync };
  sync();
  if (media.addEventListener) media.addEventListener('change', reset);
  else media.addListener(reset);
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === modeKey || event.key === systemKey) sync();
  });
  window.addEventListener('focus', sync);
  window.addEventListener('pageshow', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  document.addEventListener('DOMContentLoaded', () => {
    const original = document.getElementById('modeToggle');
    if (!original) return;
    // Remove only the theme's old binary listener; preserve its complete icon markup,
    // classes, accessibility attributes, CSS transitions and native button interaction.
    const button = original.cloneNode(true);
    original.replaceWith(button);
    button.addEventListener('click', () => {
      const mode = sync();
      const effective = manual(mode) ? mode : system();
      apply(save(effective === 'dark' ? 'light' : 'dark'));
    });
  });
})();
