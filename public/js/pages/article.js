import { get } from '../api.js';
import { renderSidebarInto } from '../site.js';
import { renderMarkdown } from '../markdown.js';
import { escapeHtml, fmtDate } from '../util.js';

export async function renderArticle(app, params) {
  let article;
  try {
    article = await get(`/api/articles/${encodeURIComponent(params.slug)}`);
  } catch (err) {
    app.innerHTML = `<div class="empty"><span class="emoji">🌊</span>${escapeHtml(err.message || '文章未找到')}<br /><a href="#/posts">返回文章列表</a></div>`;
    return;
  }

  const { html, headings } = renderMarkdown(article.content);
  const toc = headings.filter((h) => h.level === 2 || h.level === 3);

  app.innerHTML = `
    <div class="layout">
      <div class="layout-main">
        <article class="article">
          <header class="article-header">
            ${article.pinned ? '<span class="post-pin">置顶</span>' : ''}
            ${article.status !== 'published' ? '<span class="post-pin" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">草稿</span>' : ''}
            <h1 class="article-title">${escapeHtml(article.title)}</h1>
            <div class="post-meta" style="font-size:13px">
              <time>发布于 ${fmtDate(article.publishedAt || article.updatedAt)}</time>
              ${article.updatedAt !== article.publishedAt ? `<span class="dot"></span><span>更新于 ${fmtDate(article.updatedAt)}</span>` : ''}
              <span class="dot"></span><span>${article.views} 次阅读</span>
              ${article.categories.map((c) => `<a class="chip chip-sm" href="#/posts?category=${encodeURIComponent(c)}">${escapeHtml(c)}</a>`).join('')}
              ${article.tags.map((t) => `<a class="chip chip-sm" href="#/posts?tag=${encodeURIComponent(t)}"># ${escapeHtml(t)}</a>`).join('')}
            </div>
            ${
              article.cover
                ? `<div class="article-cover"><img src="${escapeHtml(article.cover)}" alt="${escapeHtml(article.title)}" /></div>`
                : ''
            }
          </header>
          <div class="article-body">${html}</div>
        </article>
      </div>
      <div class="article-side">
        ${
          toc.length
            ? `<nav class="toc"><h4>目录</h4><ol>${toc
                .map((h) => `<li class="lvl-${h.level}"><a href="#${h.id}" data-toc="${h.id}">${escapeHtml(h.text)}</a></li>`)
                .join('')}</ol></nav>`
            : ''
        }
        <div id="sidebar-slot"></div>
      </div>
    </div>
  `;

  // TOC: smooth-scroll without touching location.hash (a hash change would
  // trigger the SPA router and navigate away from the article).
  app.querySelectorAll('.toc a[data-toc]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.toc);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  renderSidebarInto(app.querySelector('#sidebar-slot'));

  // TOC scroll spy
  const links = [...app.querySelectorAll('.toc a[data-toc]')];
  const heads = links.map((a) => document.getElementById(a.dataset.toc)).filter(Boolean);
  if (heads.length) {
    const onScroll = () => {
      const y = window.scrollY + 90;
      let activeId = heads[0].id;
      for (const h of heads) if (h.offsetTop <= y) activeId = h.id;
      links.forEach((a) => a.classList.toggle('active', a.dataset.toc === activeId));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}
