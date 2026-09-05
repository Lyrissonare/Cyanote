import { get } from '../api.js';
import { renderSidebarInto } from '../site.js';
import { escapeHtml } from '../util.js';

export async function renderArchive(app) {
  const posts = await get('/api/archive');

  const byYear = new Map();
  for (const p of posts) {
    const y = p.published_at.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, new Map());
    const m = p.published_at.slice(5, 7);
    if (!byYear.get(y).has(m)) byYear.get(y).set(m, []);
    byYear.get(y).get(m).push(p);
  }

  const years = [...byYear.keys()].sort().reverse();

  app.innerHTML = `
    <div class="layout">
      <div class="layout-main">
        <div class="page-head">
          <h1 class="page-title">归档</h1>
          <p class="page-desc">共 ${posts.length} 篇文章，${years.length} 个年份</p>
        </div>
        ${
          years.length
            ? years
                .map((y) => {
                  const months = [...byYear.get(y).keys()].sort().reverse();
                  return `
            <section class="year-group">
              <div class="year-group-head">
                <span>${y} 年</span>
                <span class="count">${[...byYear.get(y).values()].reduce((a, l) => a + l.length, 0)} 篇</span>
              </div>
              ${months
                .map((m) => {
                  const list = byYear.get(y).get(m);
                  return `
                <div class="month-block">
                  <h3 class="month-title">${Number(m)} 月 <small style="font-weight:500;color:var(--text-3)">${list.length} 篇</small></h3>
                  ${list
                    .map(
                      (p) => `
                    <div class="archive-item">
                      <time>${p.published_at.slice(0, 10)}</time>
                      <a href="#/post/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a>
                    </div>`
                    )
                    .join('')}
                </div>`;
                })
                .join('')}
            </section>`;
                })
                .join('')
            : `<div class="empty"><span class="emoji">🕰️</span>还没有归档内容</div>`
        }
      </div>
      <div id="sidebar-slot"></div>
    </div>
  `;
  renderSidebarInto(app.querySelector('#sidebar-slot'));
}
