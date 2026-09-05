/* Cyanote 管理台 bootstrap — hidden admin entry at /admin
   Views: 文章管理 (default) / 写文章 / 分类管理 / 标签管理 / 站点设置 */
import { initTheme } from '/js/theme.js';
import { getToken } from './api.js';
import { escapeHtml } from '/js/util.js';
import { renderEditor, renderLogin } from './editor.js';
import { renderManagePosts, renderManageCategories, renderManageTags, renderSettingsView } from './manage.js';

initTheme();

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'posts';

document.querySelectorAll('.admin-nav a').forEach((a) => {
  a.classList.toggle('active', a.dataset.view === view);
});

const app = document.getElementById('admin-app');
const views = {
  posts: renderManagePosts,
  editor: () => renderEditor(app, params.get('slug') || ''),
  categories: renderManageCategories,
  tags: renderManageTags,
  settings: renderSettingsView,
};

async function mountView() {
  const fn = views[view] || renderManagePosts;
  app.innerHTML = '<div class="loading">加载中</div>';
  try {
    await fn(app, params);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="empty"><span class="emoji">🌊</span>${escapeHtml(err.message || '加载失败')}（可返回 <a href="/">前台</a>）</div>`;
  }
}

if (!getToken()) {
  renderLogin(app, params.get('slug') || '', async () => {
    await mountView();
  });
} else {
  mountView();
}

// back/forward navigation should re-read ?view= and remount
window.addEventListener('popstate', () => location.reload());
