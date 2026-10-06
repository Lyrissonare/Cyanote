import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
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
import { adminToken } from './auth.js';
import { createRateLimiter, createLockout, limitMethods } from './rate-limit.js';

const ADMIN_TOKEN = adminToken.token;

/** constant-time token comparison */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isAuthed(req) {
  // Bearer header only: tokens must never travel in URLs (access logs, history, referrers)
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  return safeEqual(header.slice(7), ADMIN_TOKEN);
}

const authLockout = createLockout({
  maxFailures: 10,
  windowMs: 10 * 60_000,
  lockoutMs: 15 * 60_000,
  message: '认证失败次数过多，请 15 分钟后再试',
});

export function requireAuth(req, res, next) {
  if (!authLockout.check(req, res)) return;
  if (isAuthed(req)) {
    authLockout.reset(req);
    return next();
  }
  authLockout.fail(req);
  res.status(401).json({ error: '未授权：请提供有效的管理令牌' });
}

/* ---------------- Upload validation ----------------
   The client-declared MIME type and file name are attacker-controlled, so
   both are ignored: the file's first bytes must match the magic number of an
   allowed raster image type, and the stored extension is derived from that
   sniffed type. SVG (which can carry <script>) can therefore never be stored. */

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const ascii = (start, end) => buf.subarray(start, end).toString('latin1');
  const head6 = ascii(0, 6);
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis' || brand === 'av01') return 'image/avif';
  }
  return null;
}

// Buffered storage: the whole file (≤20MB) must be inspected before it is written anywhere.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/* ---------------- Rate limiting ---------------- */

const apiLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 300 });
const writeLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 120, message: '写操作过于频繁，请稍后再试' });
const authCheckLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 30, message: '尝试过于频繁，请稍后再试' });
const uploadLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 30, message: '上传过于频繁，请稍后再试' });

/* View counting: one bump per article per IP per hour, so refreshes and
   scripted hits cannot inflate the counter unboundedly. */
const VIEW_COOLDOWN_MS = 60 * 60_000;
const viewBumps = new Map(); // "ip:slug" -> last bump timestamp

function shouldBumpView(req, slug) {
  const now = Date.now();
  const key = `${limitKeyOf(req)}:${slug}`;
  const last = viewBumps.get(key) || 0;
  if (now - last < VIEW_COOLDOWN_MS) return false;
  viewBumps.set(key, now);
  if (viewBumps.size > 20000) {
    for (const [k, t] of viewBumps) if (now - t > VIEW_COOLDOWN_MS) viewBumps.delete(k);
  }
  return true;
}

function limitKeyOf(req) {
  return req.ip || 'unknown';
}

export const router = Router();

router.use(apiLimiter);
router.use(limitMethods(['POST', 'PUT', 'DELETE'], writeLimiter));

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

router.get('/auth/check', authCheckLimiter, requireAuth, (req, res) => {
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
  if (article.status === 'published' && shouldBumpView(req, article.slug)) bumpViews(article.slug);
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

router.post('/uploads', requireAuth, uploadLimiter, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    const mime = sniffImageMime(req.file.buffer);
    if (!mime) {
      return res.status(415).json({ error: '文件内容不是受支持的图片（仅接受 PNG / JPEG / GIF / WebP / AVIF）' });
    }
    // Extension comes from the sniffed content type, never from the original file name.
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${EXT_BY_MIME[mime]}`;
    await fs.writeFile(path.join(UPLOAD_DIR, name), req.file.buffer);
    res.status(201).json({
      url: `/uploads/${name}`,
      name: req.file.originalname,
      size: req.file.size,
      type: mime,
    });
  } catch (err) {
    next(err);
  }
});

// Multer errors (e.g. file too large)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 20MB' : err.message;
    return res.status(400).json({ error: message });
  }
  next(err);
});
