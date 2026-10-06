import express from 'express';
import path from 'node:path';
import { router } from './routes.js';
import { db, DATA_DIR, PUBLIC_DIR, UPLOAD_DIR, ROOT_DIR } from './db.js';
import { adminToken } from './auth.js';

const app = express();
const PORT = process.env.PORT || 3810;
const ADMIN_DIR = path.join(ROOT_DIR, 'admin');

// Set TRUST_PROXY=1 when behind one reverse proxy hop (Render, Nginx, ...),
// so req.ip reflects the real client for rate limiting. Default: direct socket.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined && trustProxy !== '0') {
  app.set('trust proxy', trustProxy === 'true' ? true : Number(trustProxy) || 1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// API
app.use('/api', router);

// Uploaded images — served as static files validated by magic bytes at upload
// time; the sandbox CSP only applies when the URL is opened as a document.
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '30d',
    immutable: true,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  })
);

// Admin console — hidden entry, never linked from the public site.
// Still protected by the admin token for every write operation.
// Served with no-cache so the console is never stuck on stale assets.
app.use(
  '/admin',
  express.static(ADMIN_DIR, {
    maxAge: 0,
    etag: true,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0');
    },
  })
);
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0');
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});

// Frontend static shell
app.use(
  express.static(PUBLIC_DIR, {
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (path.extname(filePath) === '.html') res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// SPA fallback for hash-based routes
app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Final error handler
app.use((err, req, res, next) => {
  console.error('[cyanote]', err);
  res.status(500).json({ error: '服务器内部错误' });
});

const server = app.listen(PORT, () => {
  console.log(`\n  🌊yanote is running at http://localhost:${PORT}`);
  console.log(`  Data: ${DATA_DIR}`);
  if (adminToken.source === 'env') {
    console.log('  Admin token: from env CYANOTE_TOKEN\n');
  } else if (adminToken.source === 'file') {
    console.log('  Admin token: from data/admin-token (set CYANOTE_TOKEN to override)\n');
  } else {
    // First boot without CYANOTE_TOKEN: a random secret was generated. Print it
    // once so the local developer can log in; later boots stay quiet.
    console.log(`  Admin token (auto-generated, saved to data/admin-token): ${adminToken.token}`);
    console.log('  ⚠️  Set CYANOTE_TOKEN in production to control the admin token explicitly.\n');
  }
});

// First run on a fresh deployment: seed demo content unless SEED_DEMO=0
try {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM articles').get();
  if (n === 0 && process.env.SEED_DEMO !== '0') {
    console.log('  Empty database detected — seeding demo content (SEED_DEMO=0 to disable)\n');
    await import('./seed.js');
  }
} catch (err) {
  console.error('[cyanote] seed check failed:', err.message);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
