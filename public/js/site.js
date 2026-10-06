/* shared view helpers: meta cache, post cards, sidebar widgets (Butterfly-style) */
import { get } from './api.js';
import { escapeHtml, fmtDate, snippet, wordCount } from './util.js';
import { isFutureOn, setFutureOn, applyTheme } from './theme.js';
import { renderMarkdown } from './markdown.js';

let metaCache = null;
let metaAt = 0;

export async function getMeta(force = false) {
  if (!metaCache || Date.now() - metaAt > 30000 || force) {
    metaCache = await get('/api/meta');
    metaAt = Date.now();
  }
  return metaCache;
}

export function invalidateMeta() {
  metaCache = null;
}

export function postCardHTML(article, { showExcerpt = true } = {}) {
  const date = article.publishedAt || article.updatedAt;
  const href = `#/post/${encodeURIComponent(article.slug)}`;
  const cats = article.categories
    .map((c) => `<a class="chip chip-sm" href="#/posts?category=${encodeURIComponent(c)}">${escapeHtml(c)}</a>`)
    .join('');
  const tags = article.tags
    .slice(0, 4)
    .map((t) => `<a class="chip chip-sm" href="#/posts?tag=${encodeURIComponent(t)}"># ${escapeHtml(t)}</a>`)
    .join('');
  const excerpt = article.excerpt || snippet(article.content, 150);
  const words = wordCount(article.content);
  return `
  <div class="post-card">
    <a class="post-card-link" href="${href}" aria-label="${escapeHtml(article.title)}"></a>
    <h3>${article.pinned ? '<span class="post-pin">置顶</span>' : ''}<a href="${href}">${escapeHtml(article.title)}</a></h3>
    ${
      showExcerpt && excerpt
        ? `<p class="excerpt">${escapeHtml(excerpt)}</p>`
        : ''
    }
    <div class="post-meta">
      <time>${fmtDate(date)}</time>
      ${cats ? `<span class="dot"></span>${cats}` : ''}
      ${tags ? `<span class="dot"></span>${tags}` : ''}
      ${words > 0 ? `<span class="words" title="字数">${words} 字</span>` : ''}
    </div>
  </div>`;
}

function tagCloudHTML(meta) {
  const max = Math.max(1, ...meta.tags.map((t) => t.count));
  return meta.tags
    .slice(0, 24)
    .map((t) => {
      const s = Math.max(1, Math.round((t.count / max) * 4));
      return `<a href="#/posts?tag=${encodeURIComponent(t.name)}" class="s${s}">${escapeHtml(t.name)}</a>`;
    })
    .join('');
}

function parseFriendLinks(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter((l) => l && l.name && /^https?:\/\//i.test(l.url)) : [];
  } catch {
    return [];
  }
}

function announcementWidgetHTML(settings) {
  if (settings.announcementsEnabled !== '1' || !(settings.announcements || '').trim()) return '';
  const { html } = renderMarkdown(settings.announcements);
  return `
    <div class="widget announcement-widget">
      <h4>📢 公告</h4>
      <div class="article-body widget-md">${html}</div>
    </div>`;
}

function friendLinksWidgetHTML(settings) {
  if (settings.friendLinksEnabled !== '1') return '';
  const links = parseFriendLinks(settings.friendLinks);
  if (!links.length) return '';
  return `
    <div class="widget friend-links-widget">
      <h4>🔗 友情链接</h4>
      <ul class="widget-list">
        ${links
          .map(
            (l) =>
              `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(l.desc || l.name)}">${escapeHtml(l.name)}</a>${l.desc ? `<span class="fl-desc">${escapeHtml(l.desc)}</span>` : ''}</li>`
          )
          .join('')}
      </ul>
    </div>`;
}

/** Butterfly-style sidebar: 公告 + 未来视效 switch + 站点统计 + 分类 + 标签云 + 归档 + 友情链接 */
export function sidebarHTML(meta, settings = {}) {
  return `
  <aside class="sidebar">
    ${announcementWidgetHTML(settings)}
    <div class="widget future-widget">
      <h4>未来视效</h4>
      <button class="future-switch ${isFutureOn() ? 'active' : ''}" id="future-switch" title="切换未来主义先锋风格">
        <span class="switch-label">${isFutureOn() ? '已开启' : '点击开启'}</span>
        <span class="switch" aria-hidden="true"></span>
      </button>
      <p class="widget-note">霓虹、玻璃与流动网格的先锋视效。</p>
      <div class="conflict-note" hidden>
        ⚠️ 亮色模式与未来视效冲突。
        <button type="button" id="conflict-to-dark">切换暗色</button>
      </div>
    </div>${statWidgetHTML(meta)}
    <div class="widget">
      <h4>分类</h4>
      <ul class="widget-list">
        ${meta.categories
          .slice(0, 10)
          .map(
            (c) =>
              `<li><a href="#/posts?category=${encodeURIComponent(c.name)}">${escapeHtml(c.name)}<span class="count">${c.count}</span></a></li>`
          )
          .join('')}
      </ul>
    </div>
    <div class="widget">
      <h4>标签云</h4>
      <div class="tag-cloud">${tagCloudHTML(meta) || '<span style="color:var(--text-3);font-size:13px">暂无标签</span>'}</div>
    </div>
    <div class="widget">
      <h4>归档</h4>
      <ul class="widget-list">
        ${meta.archive
          .map((y) => {
            const months = y.months.map((m) => `${Number(m.month)} 月`).join(' · ');
            return `<li><a href="#/archive">${y.year} 年<span class="count" title="${months}">${y.months.reduce((a, m) => a + m.count, 0)}</span></a></li>`;
          })
          .join('')}
      </ul>
    </div>
    ${friendLinksWidgetHTML(settings)}
  </aside>`;
}

function statWidgetHTML(meta) {
  return `
    <div class="widget">
      <h4>站点统计</h4>
      <div class="stat-grid">
        <div class="stat-cell"><b>${meta.posts}</b><span>文章</span></div>
        <div class="stat-cell"><b>${meta.categories.length}</b><span>分类</span></div>
        <div class="stat-cell"><b>${meta.tags.length}</b><span>标签</span></div>
        <div class="stat-cell"><b>${meta.archive.length}</b><span>年份</span></div>
      </div>
    </div>`;
}

/** wire up sidebar interactivity (future switch, conflict note) */
export function bindSidebar(root) {
  root.querySelectorAll('.future-switch').forEach((sw) => {
    sw.addEventListener('click', () => setFutureOn(!isFutureOn()));
  });
  root.querySelector('#conflict-to-dark')?.addEventListener('click', () => applyTheme('dark'));
}

export async function renderSidebarInto(container) {
  try {
    const [meta, settings] = await Promise.all([getMeta(), get('/api/settings').catch(() => ({}))]);
    container.innerHTML = sidebarHTML(meta, settings);
    bindSidebar(container);
  } catch {
    container.innerHTML = '';
  }
}

/** generic list page: renders header + optional filter box + list + pagination */
export function paginationHTML(page, total, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return '';
  const link = (p, label, cls = '', disabled = false) =>
    disabled
      ? `<span class="disabled">${label}</span>`
      : `<a href="#" data-page="${p}" class="${cls}">${label}</a>`;
  let items = '';
  items += link(page - 1, '‹ 上一页', '', page <= 1);
  const win = 2;
  for (let p = Math.max(1, page - win); p <= Math.min(pages, page + win); p++) {
    items += p === page ? `<span class="current">${p}</span>` : link(p, p);
  }
  items += link(page + 1, '下一页 ›', '', page >= pages);
  return `<nav class="pagination">${items}</nav>`;
}
