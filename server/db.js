import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.join(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'cyanote.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS articles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT    NOT NULL UNIQUE,
    title        TEXT    NOT NULL,
    content      TEXT    NOT NULL DEFAULT '',
    excerpt      TEXT    NOT NULL DEFAULT '',
    cover        TEXT    NOT NULL DEFAULT '',
    categories   TEXT    NOT NULL DEFAULT '[]',
    tags         TEXT    NOT NULL DEFAULT '[]',
    status       TEXT    NOT NULL DEFAULT 'draft',
    pinned       INTEGER NOT NULL DEFAULT 0,
    views        INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL,
    published_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
  CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

/** Decode a JSON array column; tolerate bad values. */
function arr(value) {
  try {
    const v = JSON.parse(value ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function toArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    excerpt: row.excerpt,
    cover: row.cover,
    categories: arr(row.categories),
    tags: arr(row.tags),
    status: row.status,
    pinned: !!row.pinned,
    views: row.views,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export function listArticles({ status = 'published', category, tag, q, page = 1, pageSize = 10, order = 'desc' } = {}) {
  const where = [];
  const params = [];
  if (status === 'all') {
    // no filter
  } else if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (category) {
    where.push('categories LIKE ?');
    params.push(`%"${category}"%`);
  }
  if (tag) {
    where.push('tags LIKE ?');
    params.push(`%"${tag}"%`);
  }
  if (q) {
    where.push('(title LIKE ? OR content LIKE ? OR excerpt LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = `ORDER BY pinned DESC, ${status === 'all' ? 'updated_at' : 'published_at'} ${order === 'asc' ? 'ASC' : 'DESC'}`;
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM articles ${whereSql}`)
    .get(...params).n;
  const pageSizeN = Math.min(Math.max(Number(pageSize) || 10, 1), 100);
  const pageN = Math.max(Number(page) || 1, 1);
  const offset = (pageN - 1) * pageSizeN;
  const rows = db
    .prepare(`SELECT * FROM articles ${whereSql} ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSizeN, offset);
  return { items: rows.map(toArticle), total, page: pageN, pageSize: pageSizeN };
}

export function getArticle(slug, { includeDraft = false } = {}) {
  const row = db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug);
  const article = toArticle(row);
  if (!article) return null;
  if (article.status !== 'published' && !includeDraft) return null;
  return article;
}

export function createArticle(input) {
  const now = new Date().toISOString();
  const slug = makeSlug(input.slug, input.title);
  const publishedAt = input.status === 'published' ? now : null;
  db.prepare(
    `INSERT INTO articles (slug, title, content, excerpt, cover, categories, tags, status, pinned, created_at, updated_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    slug,
    input.title,
    input.content ?? '',
    input.excerpt ?? '',
    input.cover ?? '',
    JSON.stringify(input.categories ?? []),
    JSON.stringify(input.tags ?? []),
    input.status === 'published' ? 'published' : 'draft',
    input.pinned ? 1 : 0,
    now,
    now,
    publishedAt
  );
  return getArticle(slug, { includeDraft: true });
}

export function updateArticle(slug, input) {
  const existing = getArticle(slug, { includeDraft: true });
  if (!existing) return null;
  const now = new Date().toISOString();
  let publishedAt = existing.publishedAt;
  if (input.status === 'published' && existing.status !== 'published') {
    publishedAt = now;
  }
  if (input.status === 'draft' && existing.status === 'published') {
    publishedAt = null;
  }
  const nextSlug = input.slug && input.slug !== slug ? makeSlug(input.slug, input.title ?? existing.title) : slug;
  if (nextSlug !== slug) {
    // Keep slug uniqueness by checking collisions
    const col = db.prepare('SELECT 1 FROM articles WHERE slug = ?').get(nextSlug);
    if (col) throw new Error(`Slug "${nextSlug}" 已被使用`);
  }
  db.prepare(
    `UPDATE articles SET slug = ?, title = ?, content = ?, excerpt = ?, cover = ?, categories = ?, tags = ?, status = ?, pinned = ?, updated_at = ?, published_at = ? WHERE slug = ?`
  ).run(
    nextSlug,
    input.title ?? existing.title,
    input.content ?? existing.content,
    input.excerpt ?? existing.excerpt,
    input.cover ?? existing.cover,
    JSON.stringify(input.categories ?? existing.categories),
    JSON.stringify(input.tags ?? existing.tags),
    input.status === 'published' ? 'published' : input.status === 'draft' ? 'draft' : existing.status,
    input.pinned ?? existing.pinned ? 1 : 0,
    now,
    publishedAt,
    slug
  );
  return getArticle(nextSlug, { includeDraft: true });
}

export function deleteArticle(slug) {
  const res = db.prepare('DELETE FROM articles WHERE slug = ?').run(slug);
  return res.changes > 0;
}

export function publishArticle(slug, { publish = true } = {}) {
  const existing = getArticle(slug, { includeDraft: true });
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE articles SET status = ?, published_at = ?, updated_at = ? WHERE slug = ?').run(
    publish ? 'published' : 'draft',
    publish ? (existing.publishedAt ?? now) : null,
    now,
    slug
  );
  return getArticle(slug, { includeDraft: true });
}

export function bumpViews(slug) {
  db.prepare('UPDATE articles SET views = views + 1 WHERE slug = ?').run(slug);
}

export function getMeta() {
  const published = db
    .prepare("SELECT categories, tags, published_at, title, slug, cover FROM articles WHERE status = 'published'")
    .all();
  const categoryCount = new Map();
  const tagCount = new Map();
  const years = new Map();
  for (const row of published) {
    for (const c of arr(row.categories)) categoryCount.set(c, (categoryCount.get(c) ?? 0) + 1);
    for (const t of arr(row.tags)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    if (row.published_at) {
      const y = row.published_at.slice(0, 4);
      if (!years.has(y)) years.set(y, { year: y, months: new Map() });
      const m = row.published_at.slice(5, 7);
      const ym = years.get(y).months;
      ym.set(m, (ym.get(m) ?? 0) + 1);
    }
  }
  const categories = [...categoryCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const tags = [...tagCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const archive = [...years.values()]
    .sort((a, b) => b.year.localeCompare(a.year))
    .map((y) => ({
      year: y.year,
      months: [...y.months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, count]) => ({ month, count })),
    }));
  return { posts: published.length, categories, tags, archive };
}

export function getArchivePosts() {
  const rows = db
    .prepare("SELECT slug, title, published_at FROM articles WHERE status = 'published' AND published_at IS NOT NULL ORDER BY published_at DESC")
    .all();
  return rows;
}

function makeSlug(slug, title) {
  if (slug && slug.trim()) {
    return slug.trim().replace(/[^\w\-\u4e00-\u9fa5]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `post-${Date.now().toString(36)}`;
  }
  return `post-${Date.now().toString(36)}`;
}

/* ---------------- Category / tag management ---------------- */

function replaceInAll(col, from, to) {
  const rows = db.prepare('SELECT slug, ' + col + ' FROM articles').all();
  const upd = db.prepare('UPDATE articles SET ' + col + ' = ?, updated_at = ? WHERE slug = ?');
  const now = new Date().toISOString();
  let touched = 0;
  for (const r of rows) {
    const list = arr(r[col]);
    if (!list.includes(from)) continue;
    const next = [...new Set(list.map((v) => (v === from ? to : v)))];
    upd.run(JSON.stringify(next), now, r.slug);
    touched++;
  }
  return touched;
}

function removeFromAll(col, name) {
  const rows = db.prepare('SELECT slug, ' + col + ' FROM articles').all();
  const upd = db.prepare('UPDATE articles SET ' + col + ' = ?, updated_at = ? WHERE slug = ?');
  const now = new Date().toISOString();
  let touched = 0;
  for (const r of rows) {
    const list = arr(r[col]);
    if (!list.includes(name)) continue;
    upd.run(JSON.stringify(list.filter((v) => v !== name)), now, r.slug);
    touched++;
  }
  return touched;
}

export function renameCategory(from, to) {
  return replaceInAll('categories', from, to);
}
export function deleteCategory(name) {
  return removeFromAll('categories', name);
}
export function renameTag(from, to) {
  return replaceInAll('tags', from, to);
}
export function deleteTag(name) {
  return removeFromAll('tags', name);
}

/* ---------------- Site settings ---------------- */

const DEFAULT_SETTINGS = {
  homeRecentCount: '3',
  protectionLevel: 'high', // 'high' | 'low' — 限流与防爆破强度
  announcementsEnabled: '0', // '0' | '1' — 侧边栏公告栏开关
  announcements: '', // 公告内容（Markdown）
  friendLinksEnabled: '0', // '0' | '1' — 侧边栏友情链接开关
  friendLinks: '', // 规范化 JSON：[{"name","url","desc"}]
  aboutContent: `# 关于 Cyanote

> 在蓝色的深处，记录思想与代码。

**Cyanote** 是一个前后分离的博客系统：公开站点参照 Hexo / Butterfly 的阅读体验，管理台（\`/admin\`，隐藏入口）提供语雀式的写作体验，全局特征色为蓝色。

## 它有什么

- **阅读**：首页（最新文章 + 侧边栏统计）、文章列表、分类、标签、归档、关于
- **外观**：暗色 / 亮色主题一键切换；侧边栏可开启「未来视效」先锋风格
- **写作**：Markdown 实时预览、快捷工具栏、图片拖拽 / 粘贴即时上传
- **视效**：跟随鼠标的柔和光照

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Node.js + Express + 内置 SQLite |
| 公开前端 | 原生 JS 单页应用（零构建） |
| 管理台 | 独立入口（/admin，令牌鉴权） |
| 渲染 | marked + DOMPurify + Prism |

## 关于本文

这段内容来自「站点设置」，可在管理台右上角的 **⚙ 设置** 中直接编辑。
`,
};

export function getSiteSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    out[key] = map.get(key) ?? def;
  }
  return out;
}

export function setSiteSettings(patch) {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(patch)) {
    if (key in DEFAULT_SETTINGS) upsert.run(key, String(value));
  }
  if ('protectionLevel' in patch) protectionLevelCache = patch.protectionLevel === 'low' ? 'low' : 'high';
  return getSiteSettings();
}

/** Cached protection level — consulted by the rate limiters on every request. */
let protectionLevelCache = null;

export function getProtectionLevel() {
  if (protectionLevelCache === null) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'protectionLevel'").get();
    protectionLevelCache = row?.value === 'low' ? 'low' : 'high';
  }
  return protectionLevelCache;
}
