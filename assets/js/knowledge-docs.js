/* Only the two renderers the content needs; everything else is DocSteer. */
(() => {
  const mermaidSrc = document.currentScript.dataset.mermaidSrc;
  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[data-tex]').forEach(node => {
      try {
        if (!window.katex) throw new Error('数学渲染器未加载');
        window.katex.render(node.dataset.tex, node, { displayMode: node.classList.contains('math-display'), throwOnError: true, trust: false });
      } catch (error) {
        node.classList.add('render-error');
        node.textContent = node.dataset.tex;
        node.setAttribute('role', 'alert');
        console.error(error);
      }
    });
    const content = document.querySelector('#doc-content');
    if (content) {
      const heads = [...content.querySelectorAll('h2, h3')];
      if (heads.length >= 2) {
        const details = document.createElement('details');
        details.className = 'mobile-toc';
        const summary = document.createElement('summary');
        summary.textContent = '本页目录';
        const nav = document.createElement('nav');
        nav.setAttribute('aria-label', '本页目录');
        heads.forEach(head => {
          const link = document.createElement('a');
          link.href = '#' + head.id;
          link.textContent = head.textContent.trim();
          link.className = head.tagName === 'H3' ? 'lvl-3' : 'lvl-2';
          link.addEventListener('click', () => { details.open = false; });
          nav.append(link);
        });
        details.append(summary, nav);
        content.querySelector('.doc-head').after(details);
      }
    }
    const diagrams = [...document.querySelectorAll('.mermaid')];
    if (!diagrams.length) return;
    const sources = diagrams.map(node => node.textContent);
    try {
      const { default: mermaid } = await import(mermaidSrc);
      const root = document.documentElement;
      const preference = matchMedia('(prefers-color-scheme: dark)');
      let pending = false;
      let rendering = false;
      let serial = 0;
      async function render() {
        pending = true;
        if (rendering) return;
        rendering = true;
        while (pending) {
          pending = false;
          const dark = root.dataset.mode === 'dark' || (!root.dataset.mode && preference.matches);
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', flowchart: { htmlLabels: false } });
          for (let index = 0; index < diagrams.length; index++) {
            const node = diagrams[index];
            try {
              const { svg, bindFunctions } = await mermaid.render('knowledge-diagram-' + serial++, sources[index]);
              node.innerHTML = svg;
              node.dataset.rendered = 'true';
              if (bindFunctions) bindFunctions(node);
            } catch (error) {
              node.textContent = sources[index];
              node.classList.add('render-error');
              node.setAttribute('role', 'alert');
              console.error(error);
            }
          }
        }
        rendering = false;
      }
      await render();
      new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ['data-mode', 'data-skin'] });
      preference.addEventListener('change', render);
    } catch (error) {
      diagrams.forEach((node, index) => { node.textContent = sources[index]; node.classList.add('render-error'); });
      console.error(error);
    }
  });
})();
