// Extend DocSteer's binary toggle without changing the pinned theme package.
document.addEventListener('DOMContentLoaded', () => {
  const old = document.getElementById('modeToggle');
  if (!old) return;
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const choices = { auto: '跟随系统', light: '浅色', dark: '深色' };
  // The theme has already bound its binary click handler; replace that node.
  const button = old.cloneNode(false);
  const host = document.createElement('div');
  host.className = 'theme-mode';
  old.replaceWith(host);
  host.append(button);
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', 'themeModeMenu');
  button.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.id = 'themeModeMenu';
  menu.className = 'theme-mode__menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '页面外观');
  menu.hidden = true;
  host.append(menu);
  function preference() {
    try {
      const saved = localStorage.getItem('docsteer-mode');
      return Object.hasOwn(choices, saved) ? saved : 'auto';
    } catch (_) {
      return Object.hasOwn(choices, root.dataset.mode) ? root.dataset.mode : 'auto';
    }
  }
  function sync() {
    const mode = preference();
    root.dataset.mode = mode;
    const effective = mode === 'auto' ? (media.matches ? 'dark' : 'light') : mode;
    button.textContent = mode === 'auto' ? '◐' : effective === 'dark' ? '☾' : '☀';
    button.setAttribute('aria-label', '页面外观：' + choices[mode]);
    button.title = '页面外观：' + choices[mode];
    menu.querySelectorAll('[data-mode-set]').forEach(item => {
      item.setAttribute('aria-checked', String(item.dataset.modeSet === mode));
    });
  }
  function close(focus = false) {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  }
  const items = Object.entries(choices).map(([mode, label]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.dataset.modeSet = mode;
    item.setAttribute('role', 'menuitemradio');
    item.tabIndex = -1;
    item.textContent = label;
    item.addEventListener('click', () => {
      root.dataset.mode = mode;
      try { localStorage.setItem('docsteer-mode', mode); } catch (_) {}
      sync();
      close(true);
    });
    menu.append(item);
    return item;
  });
  function open(last = false) {
    sync();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (last ? items.at(-1) : items.find(item => item.dataset.modeSet === preference())).focus();
  }
  button.addEventListener('click', () => menu.hidden ? open() : close());
  button.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    open(event.key === 'ArrowUp');
  });
  menu.addEventListener('keydown', event => {
    const index = items.indexOf(document.activeElement);
    const targets = { ArrowDown: (index + 1) % 3, ArrowUp: (index + 2) % 3, Home: 0, End: 2 };
    if (Object.hasOwn(targets, event.key)) {
      event.preventDefault();
      items[targets[event.key]].focus();
    }
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (event.key === 'Tab') close();
  });
  document.addEventListener('click', event => { if (!host.contains(event.target)) close(); });
  host.addEventListener('focusout', event => { if (!host.contains(event.relatedTarget)) close(); });
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'docsteer-mode') sync();
  });
  window.addEventListener('focus', sync);
  window.addEventListener('pageshow', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  // CSS media queries update the palette; refresh the accessible current state too.
  if (media.addEventListener) media.addEventListener('change', sync);
  else media.addListener(sync);
  sync();
});
