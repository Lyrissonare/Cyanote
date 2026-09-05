/* Markdown rendering: marked + DOMPurify + Prism highlighting
   Returns { html, headingList } — headingList = [{level, id, text}] for TOC. */

const slugForId = (() => {
  const seen = new Map();
  return (text) => {
    let base = String(text)
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
})();

export function renderMarkdown(md, { forPreview = false } = {}) {
  if (!md || !md.trim()) {
    return {
      html: `<div class="empty-hint">${forPreview ? '开始输入，预览会实时呈现 ✨' : ''}</div>`,
      headings: [],
    };
  }
  const raw = window.marked.parse(md, { gfm: true, breaks: true });
  const clean = window.DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  const container = document.createElement('div');
  container.innerHTML = clean;

  // heading ids
  const headings = [];
  container.querySelectorAll('h1,h2,h3,h4').forEach((h) => {
    const level = Number(h.tagName[1]);
    const text = h.textContent.trim();
    h.id = slugForId(text);
    headings.push({ level, id: h.id, text });
  });

  // syntax highlight
  container.querySelectorAll('pre > code').forEach((code) => {
    const lang = (code.className.match(/language-([\w-]+)/) || [])[1];
    const pre = code.parentElement;
    if (lang && window.Prism?.languages?.[lang]) {
      try {
        code.innerHTML = window.Prism.highlight(code.textContent, window.Prism.languages[lang], lang);
      } catch {
        /* keep raw */
      }
    }
    pre.setAttribute('data-lang', lang || '');
  });

  return { html: container.innerHTML, headings };
}
