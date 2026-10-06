/* Cyanote 管理台 — management views: 文章管理 / 分类管理 / 标签管理 / 站点设置 */
import { get, post, put, del } from './api.js';
import { escapeHtml, fmtDate, debounce, toast } from '/js/util.js';

/* ================= 文章管理 ================= */
export async function renderManagePosts(app) {
  const data = await get('/api/articles?status=all&pageSize=100');
  const all = data.items;
  let state = { q: '', status: 'all' };

  const view = () => {
    const list = all.filter(
      (a) =>
        (state.status === 'all' || a.status === state.status) &&
        (!state.q || (a.title + a.slug + a.excerpt + a.content).toLowerCase().includes(state.q.toLowerCase()))
    );
    app.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">文章管理</h1>
        <p class="page-desc">共 ${all.length} 篇（草稿 ${all.filter((a) => a.status === 'draft').length} · 已发布 ${all.filter((a) => a.status === 'published').length}）</p>
      </div>
      <div class="mng-toolbar">
        <input type="search" id="mng-search" class="mng-search" placeholder="搜索标题 / 内容…" value="${escapeHtml(state.q)}" />
        <div class="mng-filter" id="mng-filter">
          ${['all', 'published', 'draft']
            .map(
              (s) =>
                `<button data-status="${s}" class="${state.status === s ? 'active' : ''}">${{ all: '全部', published: '已发布', draft: '草稿' }[s]}</button>`
            )
            .join('')}
        </div>
        <a class="btn btn-primary btn-sm" href="/admin/?view=editor">＋ 写文章</a>
      </div>
      <div class="mng-card">
        ${
          list.length
            ? list
                .map(
                  (a) => `
        <div class="mng-row" data-slug="${escapeHtml(a.slug)}">
          <div class="mng-row-main">
            <div class="mng-row-title">${a.pinned ? '<span class="post-pin">置顶</span>' : ''}${escapeHtml(a.title)}</div>
            <div class="mng-row-sub">/${escapeHtml(a.slug)}</div>
          </div>
          <span class="status-pill ${a.status}">${a.status === 'published' ? '已发布' : '草稿'}</span>
          <div class="mng-row-meta">
            <time>${fmtDate(a.publishedAt || a.updatedAt)}</time><span>${a.views} 阅读</span>
          </div>
          <div class="mng-actions">
            <a class="btn btn-ghost btn-sm" href="/admin/?view=editor&slug=${encodeURIComponent(a.slug)}">编辑</a>
            <button class="btn btn-ghost btn-sm" data-act="toggle-publish">${a.status === 'published' ? '撤回' : '发布'}</button>
            <button class="btn btn-danger btn-sm" data-act="delete">删除</button>
          </div>
        </div>`
                )
                .join('')
            : '<div class="empty" style="padding:40px"><span class="emoji">📄</span>没有符合条件的文章</div>'
        }
      </div>
    `;

    const search = app.querySelector('#mng-search');
    search.addEventListener('input', debounce((e) => {
      state.q = e.target.value.trim();
      view();
    }, 300));

    app.querySelectorAll('#mng-filter button').forEach((b) => {
      b.addEventListener('click', () => {
        state.status = b.dataset.status;
        view();
      });
    });

    app.querySelectorAll('[data-act="toggle-publish"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.mng-row');
        const slug = row.dataset.slug;
        const isPub = btn.textContent.includes('撤回');
        try {
          if (isPub) await post(`/api/articles/${encodeURIComponent(slug)}/unpublish`);
          else await post(`/api/articles/${encodeURIComponent(slug)}/publish`);
          toast(isPub ? '已撤回为草稿' : '🎉 已发布', 'ok');
          renderManagePosts(app);
        } catch (e) {
          toast(e.message || '操作失败', 'err');
        }
      });
    });

    app.querySelectorAll('[data-act="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.mng-row');
        const slug = row.dataset.slug;
        const title = row.querySelector('.mng-row-title').textContent.trim();
        if (!confirm(`确定删除《${title}》吗？此操作不可恢复。`)) return;
        try {
          await del(`/api/articles/${encodeURIComponent(slug)}`);
          toast('已删除', 'ok');
          renderManagePosts(app);
        } catch (e) {
          toast(e.message || '删除失败', 'err');
        }
      });
    });
  };

  view();
}

/* ================= 分类 / 标签管理 ================= */
async function renderNameManager(app, { kind, title, desc }) {
  const meta = await get('/api/meta');
  const items = kind === 'category' ? meta.categories : meta.tags;
  const base = kind === 'category' ? 'categories' : 'tags';

  app.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">${escapeHtml(title)}</h1>
      <p class="page-desc">${escapeHtml(desc)} · 共 ${items.length} 个，修改会同步到所有文章</p>
    </div>
    <div class="mng-card">
      ${
        items.length
          ? items
              .map(
                (c) => `
      <div class="mng-row" data-name="${escapeHtml(c.name)}">
        <span class="status-pill" style="background:color-mix(in srgb, var(--accent-soft) 60%, transparent);color:var(--accent-2)">${c.count} 篇</span>
        <input class="mng-rename mng-edit-input" value="${escapeHtml(c.name)}" aria-label="${kind}名" />
        <div class="mng-actions">
          <button class="btn btn-ghost btn-sm" data-act="rename">保存改名</button>
          <button class="btn btn-danger btn-sm" data-act="remove">删除</button>
        </div>
      </div>`
              )
              .join('')
          : '<div class="empty" style="padding:40px"><span class="emoji">🏷️</span>暂无，在文章中创建</div>'
      }
    </div>
    <p class="widget-note" style="margin-top:14px">💡 ${kind === 'category' ? '分类' : '标签'}会在写作时自动创建；这里的「删除」将从所有文章中移除它。</p>
  `;

  app.querySelectorAll('[data-act="rename"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.mng-row');
      const from = row.dataset.name;
      const to = row.querySelector('.mng-rename').value.trim();
      if (!to) return toast('名称不能为空', 'err');
      try {
        await put(`/api/${base}/${encodeURIComponent(from)}`, { name: to });
        toast(`已重命名：${from} → ${to}`, 'ok');
        renderNameManager(app, { kind, title, desc });
      } catch (e) {
        toast(e.message || '重命名失败', 'err');
      }
    });
  });

  app.querySelectorAll('[data-act="remove"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.mng-row');
      const name = row.dataset.name;
      const count = row.querySelector('.status-pill').textContent;
      if (!confirm(`确定删除${kind === 'category' ? '分类' : '标签'}「${name}」吗？将从 ${count} 的所有文章中移除。`)) return;
      try {
        await del(`/api/${base}/${encodeURIComponent(name)}`);
        toast('已删除并同步所有文章', 'ok');
        renderNameManager(app, { kind, title, desc });
      } catch (e) {
        toast(e.message || '删除失败', 'err');
      }
    });
  });
}

export function renderManageCategories(app) {
  return renderNameManager(app, {
    kind: 'category',
    title: '分类管理',
    desc: '重命名 / 删除分类，操作实时同步到所有文章',
  });
}

export function renderManageTags(app) {
  return renderNameManager(app, {
    kind: 'tag',
    title: '标签管理',
    desc: '重命名 / 删除标签，操作实时同步到所有文章',
  });
}

/* ================= 站点设置 ================= */
/** friendLinks canonical JSON → editable lines of `名称 | 链接 | 备注` */
function friendLinksToText(json) {
  try {
    const arr = JSON.parse(json || '[]');
    if (!Array.isArray(arr)) return '';
    return arr
      .filter((l) => l && l.name && l.url)
      .map((l) => (l.desc ? `${l.name} | ${l.url} | ${l.desc}` : `${l.name} | ${l.url}`))
      .join('\n');
  } catch {
    return '';
  }
}

export async function renderSettingsView(app) {
  let settings;
  try {
    settings = await get('/api/settings');
  } catch (e) {
    app.innerHTML = `<div class="empty"><span class="emoji">⚙️</span>${escapeHtml(e.message || '读取失败')}</div>`;
    return;
  }

  app.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">站点设置</h1>
      <p class="page-desc">配置保存在服务器（SQLite settings 表），保存后立即生效</p>
    </div>
    <div class="editor-meta" style="max-width:760px;padding-bottom:24px">
      <div class="field" style="margin-bottom:18px">
        <label>首页「最新文章」展示数量（1-10）</label>
        <input type="number" id="set-recent-count" min="1" max="10" value="${Number(settings.homeRecentCount) || 3}" />
        <small class="field-hint">完整展示 N 篇，其后渲染 1 张半浸入光晕的幽灵卡片（点击进入全部文章）</small>
      </div>
      <div class="field" style="margin-bottom:18px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="set-announcements-on" ${settings.announcementsEnabled === '1' ? 'checked' : ''} />
          启用侧边栏「公告栏」
        </label>
        <textarea id="set-announcements" rows="5" placeholder="公告内容，支持 Markdown…">${escapeHtml(settings.announcements || '')}</textarea>
        <small class="field-hint">关闭开关时内容保留但不在前台显示</small>
      </div>
      <div class="field" style="margin-bottom:18px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="set-friend-links-on" ${settings.friendLinksEnabled === '1' ? 'checked' : ''} />
          启用侧边栏「友情链接」
        </label>
        <textarea id="set-friend-links" rows="5" placeholder="每行一个：名称 | 链接 | 备注(可选)">${escapeHtml(friendLinksToText(settings.friendLinks))}</textarea>
        <small class="field-hint">例如：<code>张三的博客 | https://example.com | 前端 / 摄影</code>，仅接受 http(s) 链接，最多 100 条</small>
      </div>
      <div class="field" style="margin-bottom:18px">
        <label>防护等级</label>
        <select id="set-protection-level">
          <option value="high" ${settings.protectionLevel !== 'low' ? 'selected' : ''}>高 — 默认限流与防爆破（生产环境推荐）</option>
          <option value="low" ${settings.protectionLevel === 'low' ? 'selected' : ''}>低 — 限流放宽 5 倍（本地开发用）</option>
        </select>
        <small class="field-hint">控制 API 限流额度与登录失败锁定的阈值，保存后立即生效，无需重启</small>
      </div>
      <div class="field">
        <label>关于页内容（Markdown）</label>
        <textarea id="set-about" rows="14" style="min-height:220px">${escapeHtml(settings.aboutContent || '')}</textarea>
      </div>
      <div class="dialog-actions" style="margin-top:10px">
        <button class="btn btn-primary" id="settings-save">保存设置</button>
      </div>
    </div>
  `;

  app.querySelector('#settings-save').addEventListener('click', async () => {
    const n = Number(app.querySelector('#set-recent-count').value);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      toast('首页最新文章数量需为 1-10 的整数', 'err');
      return;
    }
    try {
      await put('/api/settings', {
        homeRecentCount: n,
        aboutContent: app.querySelector('#set-about').value,
        protectionLevel: app.querySelector('#set-protection-level').value,
        announcementsEnabled: app.querySelector('#set-announcements-on').checked ? '1' : '0',
        announcements: app.querySelector('#set-announcements').value,
        friendLinksEnabled: app.querySelector('#set-friend-links-on').checked ? '1' : '0',
        friendLinks: app.querySelector('#set-friend-links').value,
      });
      toast('站点设置已保存 ✨', 'ok');
    } catch (e) {
      toast(e.message || '保存设置失败', 'err');
    }
  });
}
