import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';import {
  listArticles,
  getArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  publishArticle,
  bumpViews,
  getMeta,
  getArchivePosts,
  getSiteSettings,
  setSiteSettings,
  renameCategory,
  deleteCategory,
  renameTag,
  deleteTag,
  UPLOAD_DIR,
} from './db.js';

export const ADMIN_TOKEN = process.env.CYANOTE_TOKEN || 'cyanote-demo-token';

/** constant-time token comparison */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isAuthed(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  return safeEqual(token, ADMIN_TOKEN);
}

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: '未授权：请提供有效的管理令牌' });
}

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 PNG / JPEG / GIF / WebP / AVIF 图片'));
  },
});

export const router = Router();

/* ---------------- Public API ---------------- */

router.get('/health', (req, res) => res.json({ ok: true, name: 'Cyanote', time: new Date().toISOString() }));

router.get('/meta', (req, res) => {
  res.json(getMeta());
});

router.get('/settings', (req, res) => {
  res.json(getSiteSettings());
});

router.put('/settings', requireAuth, (req, res) => {
  const { homeRecentCount, aboutContent } = req.body ?? {};
  const patch = {};
  if (homeRecentCount !== undefined) {
    const n = Number(homeRecentCount);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      return res.status(400).json({ error: '首页最新文章数量需为 1-10 的整数' });
    }
    patch.homeRecentCount = String(n);
  }
  if (aboutContent !== undefined) {
    patch.aboutContent = String(aboutContent).slice(0, 200000);
  }
  res.json(setSiteSettings(patch));
});

/* ---------------- Category / tag management ---------------- */

const validName = (v) => typeof v === 'string' && v.trim() && v.trim().length <= 50;

router.put('/categories/:from', requireAuth, (req, res) => {
  const from = String(req.params.from);
  const to = req.body?.name;
  if (!validName(from) || !validName(to)) return res.status(400).json({ error: '分类名不能为空且不超过 50 字' });
  res.json({ updated: renameCategory(from, to.trim()), from, to: to.trim() });
});

router.delete('/categories/:name', requireAuth, (req, res) => {
  const name = String(req.params.name);
  if (!validName(name)) return res.status(400).json({ error: '分类名不能为空' });
  res.json({ removed: deleteCategory(name) });
});

router.put('/tags/:from', requireAuth, (req, res) => {
  const from = String(req.params.from);
  const to = req.body?.name;
  if (!validName(from) || !validName(to)) return res.status(400).json({ error: '标签名不能为空且不超过 50 字' });
  res.json({ updated: renameTag(from, to.trim()), from, to: to.trim() });
});

router.delete('/tags/:name', requireAuth, (req, res) => {
  const name = String(req.params.name);
  if (!validName(name)) return res.status(400).json({ error: '标签名不能为空' });
  res.json({ removed: deleteTag(name) });
});

router.get('/archive', (req, res) => {
  res.json(getArchivePosts());
});

router.get('/auth/check', requireAuth, (req, res) => {
  res.json({ ok: true, role: 'admin' });
});

router.get('/articles', (req, res) => {
  const { status = 'published', category, tag, q, page, pageSize, order } = req.query;
  const effectiveStatus = status === 'all' && isAuthed(req) ? 'all' : status;
  res.json(listArticles({ status: effectiveStatus, category, tag, q, page, pageSize, order }));
});

router.get('/articles/:slug', (req, res) => {
  const article = getArticle(req.params.slug, { includeDraft: isAuthed(req) });
  if (!article) return res.status(404).json({ error: '文章不存在' });
  if (article.status === 'published') bumpViews(article.slug);
  res.json(article);
});

/* ---------------- Admin API ---------------- */

router.post('/articles', requireAuth, (req, res) => {
  try {
    const article = createArticle(req.body ?? {});
    res.status(201).json(article);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/articles/:slug', requireAuth, (req, res) => {
  try {
    const article = updateArticle(req.params.slug, req.body ?? {});
    if (!article) return res.status(404).json({ error: '文章不存在' });
    res.json(article);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/articles/:slug', requireAuth, (req, res) => {
  const ok = deleteArticle(req.params.slug);
  if (!ok) return res.status(404).json({ error: '文章不存在' });
  res.json({ ok: true });
});

router.post('/articles/:slug/publish', requireAuth, (req, res) => {
  const article = publishArticle(req.params.slug, { publish: true });
  if (!article) return res.status(404).json({ error: '文章不存在' });
  res.json(article);
});

router.post('/articles/:slug/unpublish', requireAuth, (req, res) => {
  const article = publishArticle(req.params.slug, { publish: false });
  if (!article) return res.status(404).json({ error: '文章不存在' });
  res.json(article);
});

router.post('/uploads', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
  });
});

// Multer error handler (e.g. file too large)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err?.message?.includes('仅支持')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});
