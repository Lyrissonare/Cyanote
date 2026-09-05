import { get } from '../api.js';
import { getMeta, renderSidebarInto } from '../site.js';
import { escapeHtml, fmtDate } from '../util.js';

export async function renderCategories(app) {
  const [meta, all] = await Promise.all([
    getMeta(),
    get('/api/articles?pageSize=100'),
  ]);

  const byCategory = new Map();
  for (const a of all.items) {
    for (const c of a.categories) {
      if (!byCategory.has(c)) byCategory.set(c, []);
      byCategory.get(c).push(a);
    }
  }

  app.innerHTML = `
    <div class="layout">
      <div class="layout-main">
        <div class="page-head">
          <h1 class="page-title">分类</h1>
          <p class="page-desc">共 ${meta.categories.length} 个分类，${meta.posts} 篇文章</p>
        </div>
        ${
          meta.categories.length
            ? meta.categories
                .map(
                  (c) => `
            <section class="cat-group">
              <div class="cat-group-head">
                <span>🗂️ ${escapeHtml(c.name)}</span>
                <span class="count">${c.count} 篇</span>
              </div>
              ${(byCategory.get(c.name) || [])
                .map(
                  (a) => `
                <div class="archive-item">
                  <time>${fmtDate(a.publishedAt || a.updatedAt)}</time>
                  <a href="#/post/${encodeURIComponent(a.slug)}">${escapeHtml(a.title)}</a>
                </div>`
                )
                .join('')}
            </section>`
                )
                .join('')
            : `<div class="empty"><span class="emoji">🗂️</span>暂无分类</div>`
        }
      </div>
      <div id="sidebar-slot"></div>
    </div>
  `;
  renderSidebarInto(app.querySelector('#sidebar-slot'));
}
