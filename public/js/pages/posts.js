import { get } from '../api.js';
import { postCardHTML, paginationHTML, renderSidebarInto } from '../site.js';
import { escapeHtml, debounce } from '../util.js';

export async function renderPosts(app, params, query) {
  const q = query.get('q') || '';
  const category = query.get('category') || '';
  const tag = query.get('tag') || '';
  const page = Number(query.get('page')) || 1;
  const pageSize = 6;

  const qp = new URLSearchParams();
  if (q) qp.set('q', q);
  if (category) qp.set('category', category);
  if (tag) qp.set('tag', tag);
  qp.set('page', String(page));
  qp.set('pageSize', String(pageSize));

  let title = '全部文章';
  let desc = '细雨闲敲，蓝色成文。';
  if (category) {
    title = `分类：${category}`;
    desc = `该分类下共收录相关文章`;
  } else if (tag) {
    title = `标签：# ${tag}`;
    desc = `该标签下共收录相关文章`;
  } else if (q) {
    title = `搜索：${q}`;
    desc = `在全部文章中检索`;
  }

  const data = await get(`/api/articles?${qp.toString()}`);

  app.innerHTML = `
    <div class="layout">
      <div class="layout-main">
        <div class="page-head">
          <h1 class="page-title">${escapeHtml(title)}</h1>
          <p class="page-desc">${escapeHtml(desc)} · 共 ${data.total} 篇</p>
        </div>

        <div class="list-toolbar">
          ${
            category || tag
              ? `<a class="chip" href="#/posts" style="font-size:13px;padding:6px 14px">${escapeHtml(category || ('# ' + tag))} ✕</a>`
              : ''
          }
          <input type="search" id="post-search" class="list-search" placeholder="搜索标题 / 内容…" value="${escapeHtml(q)}" />
        </div>

        ${
          data.items.length
            ? data.items.map((a) => postCardHTML(a)).join('')
            : `<div class="empty"><span class="emoji">🔍</span>没有找到符合条件的文章</div>`
        }
        ${paginationHTML(data.page, data.total, data.pageSize)}
      </div>
      <div id="sidebar-slot"></div>
    </div>
  `;

  renderSidebarInto(app.querySelector('#sidebar-slot'));

  const search = app.querySelector('#post-search');
  const go = debounce((value) => {
    const next = new URLSearchParams(qp);
    if (value) next.set('q', value);
    else next.delete('q');
    next.delete('page');
    location.hash = `#/posts?${next.toString()}`;
  }, 400);
  search?.addEventListener('input', (e) => go(e.target.value.trim()));

  app.querySelectorAll('.pagination a[data-page]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const next = new URLSearchParams(qp);
      next.set('page', a.dataset.page);
      location.hash = `#/posts?${next.toString()}`;
    });
  });
}
