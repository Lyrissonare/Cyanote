import { get } from '../api.js';
import { renderMarkdown } from '../markdown.js';
import { renderSidebarInto } from '../site.js';

export async function renderAbout(app) {
  const settings = await get('/api/settings');
  const { html } = renderMarkdown(settings.aboutContent);

  app.innerHTML = `
    <div class="layout">
      <div class="layout-main">
        <div class="page-head">
          <h1 class="page-title">关于</h1>
          <p class="page-desc">关于 Cyanote 与这个站点</p>
        </div>
        <article class="article about-article">
          <div class="article-body">${html}</div>
        </article>
      </div>
      <div id="sidebar-slot"></div>
    </div>
  `;
  renderSidebarInto(app.querySelector('#sidebar-slot'));
}
