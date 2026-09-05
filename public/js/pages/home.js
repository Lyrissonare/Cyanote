import { get } from '../api.js';
import { getMeta, postCardHTML, renderSidebarInto } from '../site.js';
import { escapeHtml } from '../util.js';

export async function renderHome(app) {
  const [meta, settings, recent] = await Promise.all([
    getMeta(),
    get('/api/settings'),
    undefined,
  ]);

  const count = Math.min(Math.max(Number(settings.homeRecentCount) || 3, 1), 10);
  const data = await get(`/api/articles?pageSize=${count + 1}`);
  const full = data.items.slice(0, count);
  const ghost = data.items[count]; // the "half-drowned" card if there are more posts

  app.innerHTML = `
    <div class="layout">
      <div class="layout-main">
        <section class="hero">
          <h1>在<span class="blue">蓝色</span>的深处<br />记录思想与代码</h1>
          <p class="hero-sub">Hexo 式的阅读体验，语雀式的写作体验。暗夜蓝光，一页点亮。</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/posts">开始阅读</a>
            <a class="btn btn-ghost" href="#/archive">查看归档</a>
          </div>
        </section>

        <h2 class="section-title">最新文章 <a class="more-link" href="#/posts">查看全部 →</a></h2>
        ${
          full.length
            ? full.map((a) => postCardHTML(a)).join('')
            : `<div class="empty"><span class="emoji">🌊</span>还没有文章</div>`
        }
        ${ghost ? ghostCardHTML(ghost) : ''}

        <h2 class="section-title">探索</h2>
        <div class="explore-grid">
          <a class="explore-card" href="#/categories">
            <span class="explore-ico">🗂️</span>
            <b>分类</b>
            <small>${meta.categories.slice(0, 4).map((c) => escapeHtml(c.name)).join(' · ') || '暂无'}</small>
          </a>
          <a class="explore-card" href="#/tags">
            <span class="explore-ico">🏷️</span>
            <b>标签</b>
            <small>${meta.tags.slice(0, 4).map((t) => `# ${escapeHtml(t.name)}`).join(' · ') || '暂无'}</small>
          </a>
          <a class="explore-card" href="#/archive">
            <span class="explore-ico">🕰️</span>
            <b>归档</b>
            <small>${meta.archive.map((y) => `${y.year} 年`).join(' · ') || '暂无'}</small>
          </a>
        </div>
      </div>
      <div id="sidebar-slot"></div>
    </div>
  `;

  renderSidebarInto(app.querySelector('#sidebar-slot'));
}

/** The teaser card: upper half shows the next article, lower half fades into the
    glow — click to jump to the full article list. */
function ghostCardHTML(article) {
  return `
    <div class="fade-card-wrap">
      <div class="fade-card">
        ${postCardHTML(article)}
      </div>
      <a class="fade-card-link" href="#/posts" aria-label="查看全部文章">
        <span class="fade-cta">✨ 查看全部文章</span>
      </a>
      <div class="fade-glow" aria-hidden="true"></div>
    </div>`;
}
