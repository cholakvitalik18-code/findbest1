'use strict';
// Adapted from lib/security.js for Vercel functions. clientIp trusts
// x-forwarded-for unconditionally: on Vercel that header is set by their edge,
// not reachable directly by a client, so it is not spoofable the way it would
// be on a self-hosted box (see lib/security.js's TRUST_PROXY_HOPS for that case).

const { cleanText } = require('./search-query');

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return first || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs, max, maxEntries = 5000 }) {
  const entries = new Map();
  return function limit(key) {
    const now = Date.now();
    if (entries.size >= maxEntries) {
      for (const [entryKey, entry] of entries) if (entry.resetAt <= now) entries.delete(entryKey);
    }
    const current = entries.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && entries.size >= maxEntries) return { allowed: false, remaining: 0, retryAfter: Math.ceil(windowMs / 1000) };
      entries.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1, retryAfter: 0 };
    }
    current.count += 1;
    return { allowed: current.count <= max, remaining: Math.max(0, max - current.count), retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  };
}

function validateSearch(query, location) {
  if (typeof query !== 'string' || query.length > 120 || /[\x00-\x1F\x7F]/.test(query) || (location != null && (typeof location !== 'string' || location.length > 60 || /[\x00-\x1F\x7F]/.test(location)))) return { ok: false, error: 'Invalid search parameters.' };
  const q = cleanText(query, 120);
  const city = cleanText(location, 60);
  if (q.length < 2) return { ok: false, error: 'Введите запрос минимум из 2 символов.' };
  if (q.length > 120) return { ok: false, error: 'Запрос слишком длинный.' };
  if (!/[\p{L}\p{N}]/u.test(q)) return { ok: false, error: 'Введите название товара.' };
  if (city && !/[\p{L}\p{N}]/u.test(city)) return { ok: false, error: 'Некорректный город или регион.' };
  return { ok: true, query: q, location: city };
}

function allowedHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048 || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname) || url.hostname.endsWith('.local')) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

module.exports = { clientIp, createRateLimiter, validateSearch, allowedHttpUrl };
