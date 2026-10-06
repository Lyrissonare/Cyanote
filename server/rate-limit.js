/* Minimal dependency-free, in-memory fixed-window rate limiting.
   Per-process state — good enough for a single-node blog; reset on restart. */

const MAX_TRACKED_KEYS = 10000;

function sweepExpired(map, now) {
  for (const [key, entry] of map) {
    if (entry.resetAt <= now) map.delete(key);
  }
}

function limitKey(req) {
  // req.ip honours Express `trust proxy` when the app runs behind a reverse proxy
  return req.ip || 'unknown';
}

function sendTooMany(res, retryAfterSec, message) {
  res.setHeader('Retry-After', retryAfterSec);
  res.status(429).json({ error: message });
}

/**
 * Fixed-window rate limiter. Each key gets `max` requests per `windowMs`;
 * exceeding the budget returns 429 until the window resets.
 */
export function createRateLimiter({ windowMs, max, message = '请求过于频繁，请稍后再试' }) {
  const hits = new Map(); // key -> { count, resetAt }
  let lastSweep = 0;

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if ((now - lastSweep > windowMs && hits.size > 0) || hits.size > MAX_TRACKED_KEYS) {
      lastSweep = now;
      sweepExpired(hits, now);
    }
    const key = limitKey(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    if (entry.count > max) {
      return sendTooMany(res, Math.ceil((entry.resetAt - now) / 1000), message);
    }
    next();
  };
}

/**
 * Failure lockout for authentication: after `maxFailures` failures within
 * `windowMs`, the key is locked out for `lockoutMs`. Successful auth resets
 * the failure count. `check()` answers the 429 itself and returns false while
 * the key is locked.
 */
export function createLockout({ maxFailures, windowMs, lockoutMs, message = '失败次数过多，请稍后再试' }) {
  const state = new Map(); // key -> { failures, windowStart, lockedUntil }
  let lastSweep = 0;

  function sweep(now) {
    if ((now - lastSweep > windowMs && state.size > 0) || state.size > MAX_TRACKED_KEYS) {
      lastSweep = now;
      for (const [key, entry] of state) {
        if (entry.lockedUntil <= now && entry.windowStart + windowMs <= now) state.delete(key);
      }
    }
  }

  return {
    check(req, res) {
      const now = Date.now();
      sweep(now);
      const entry = state.get(limitKey(req));
      if (entry && entry.lockedUntil > now) {
        sendTooMany(res, Math.ceil((entry.lockedUntil - now) / 1000), message);
        return false;
      }
      return true;
    },
    fail(req) {
      const now = Date.now();
      const key = limitKey(req);
      let entry = state.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        entry = { failures: 0, windowStart: now, lockedUntil: 0 };
        state.set(key, entry);
      }
      entry.failures += 1;
      if (entry.failures >= maxFailures) {
        entry.lockedUntil = now + lockoutMs;
        entry.windowStart = now;
      }
    },
    reset(req) {
      state.delete(limitKey(req));
    },
  };
}

/** Apply a limiter only to the given HTTP methods (rate-limit writes, let reads pass). */
export function limitMethods(methods, limiter) {
  return function methodLimit(req, res, next) {
    if (methods.includes(req.method)) return limiter(req, res, next);
    next();
  };
}
