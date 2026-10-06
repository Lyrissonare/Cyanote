import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

const TOKEN_FILE = path.join(DATA_DIR, 'admin-token');
const LEGACY_DEMO_TOKEN = 'cyanote-demo-token';

/**
 * Admin token resolution order:
 *   1. CYANOTE_TOKEN environment variable (explicit, wins over everything)
 *   2. previously auto-generated token persisted at data/admin-token
 *   3. generate a strong random token, persist it to data/admin-token
 *
 * There is intentionally no well-known default: a deployment that forgets to
 * set CYANOTE_TOKEN gets a random secret instead of the old demo token.
 */
function resolveAdminToken() {
  const fromEnv = (process.env.CYANOTE_TOKEN || '').trim();
  if (fromEnv) {
    if (fromEnv === LEGACY_DEMO_TOKEN) {
      console.warn('[cyanote] ⚠️  CYANOTE_TOKEN is set to the old well-known demo token — pick a strong secret instead.');
    }
    return { token: fromEnv, source: 'env' };
  }
  try {
    const saved = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (saved) return { token: saved, source: 'file' };
  } catch {
    /* not generated yet */
  }
  const generated = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(TOKEN_FILE, `${generated}\n`, { mode: 0o600 });
  return { token: generated, source: 'generated' };
}

export const adminToken = resolveAdminToken();
export const ADMIN_TOKEN_FILE = TOKEN_FILE;
