/* Cyanote SPA bootstrap: theme + router (public site only) */
import { initTheme, initFuture } from './theme.js';
import { initCursorGlow } from './cursor-glow.js';
import { escapeHtml } from './util.js';
import { renderHome } from './pages/home.js';
import { renderPosts } from './pages/posts.js';
import { renderArticle } from './pages/article.js';
import { renderCategories } from './pages/categories.js';
import { renderTags } from './pages/tags.js';
import { renderArchive } from './pages/archive.js';
import { renderAbout } from './pages/about.js';

initTheme();
initFuture();
initCursorGlow();

const routes = [
  { match: (s) => s.length === 0, page: renderHome, nav: 'home' },
  { match: (s) => s[0] === 'posts', page: renderPosts, nav: 'posts' },
  { match: (s) => s[0] === 'post' && s.length >= 2, page: renderArticle, nav: 'posts' },
  { match: (s) => s[0] === 'categories', page: renderCategories, nav: 'categories' },
  { match: (s) => s[0] === 'tags', page: renderTags, nav: 'tags' },
  { match: (s) => s[0] === 'archive', page: renderArchive, nav: 'archive' },
  { match: (s) => s[0] === 'about', page: renderAbout, nav: 'about' },
  { match: () => true, page: renderHome, nav: 'home' },
];

function setActiveNav(nav) {
  document.querySelectorAll('.site-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === nav);
  });
}

async function route() {
  const hash = decodeURIComponent(location.hash.slice(1) || '/');
  const [path, qs] = hash.split('?');
  const segs = path.split('/').filter(Boolean);
  const query = new URLSearchParams(qs || '');
  const found = routes.find((r) => r.match(segs));

  setActiveNav(found.nav);
  window.scrollTo({ top: 0 });
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">加载中</div>';
  const params = segs[0] === 'post' ? { slug: segs[1] } : {};

  try {
    await found.page(app, params, query);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="empty"><span class="emoji">🌊</span>${escapeHtml(err.message || '加载失败')}<br /><a href="#/">返回首页</a></div>`;
  }
}

window.addEventListener('hashchange', route);
route();
