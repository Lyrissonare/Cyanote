import { getMeta, renderSidebarInto } from '../site.js';
import { escapeHtml } from '../util.js';

export async function renderTags(app) {
  const meta = await getMeta();

  app.innerHTML = `
    <div class="layout">
      <div class="layout-main">
        <div class="page-head">
          <h1 class="page-title">标签</h1>
          <p class="page-desc">共 ${meta.tags.length} 个标签，${meta.posts} 篇文章</p>
        </div>
        <div class="tags-hero">
          ${
            meta.tags.length
              ? meta.tags
                  .map((t) => {
                    const max = Math.max(1, ...meta.tags.map((x) => x.count));
                    const s = Math.max(1, Math.round((t.count / max) * 4));
                    return `<a href="#/posts?tag=${encodeURIComponent(t.name)}" class="s${s}">${escapeHtml(t.name)} <small style="opacity:.65">${t.count}</small></a>`;
                  })
                  .join('')
              : '<span style="color:var(--text-3)">暂无标签</span>'
          }
        </div>
      </div>
      <div id="sidebar-slot"></div>
    </div>
  `;
  renderSidebarInto(app.querySelector('#sidebar-slot'));
}
