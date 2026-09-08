'use strict';

const { cleanText } = require('./search-query');

function clientIp(req) {
  // Only enable behind a known proxy that appends the actual client address.
  const hops = Math.min(5, Math.max(0, Number(process.env.TRUST_PROXY_HOPS) || 0));
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim());
  const candidate = hops ? chain[chain.length - hops] : '';
  return candidate && require('node:net').isIP(candidate) ? candidate : req.socket.remoteAddress || 'unknown';
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

function securityHeaders(req, isHtml = false) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  if (isHtml) {
    headers['Content-Security-Policy'] = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' https: data:; connect-src 'self' https://*.google-analytics.com; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'self'";
    if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') headers['Content-Security-Policy'] += '; upgrade-insecure-requests';
  }
  return headers;
}

function validateSearch(query, location) {
  if (typeof query !== 'string' || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query) || (location != null && (typeof location !== 'string' || location.length > 60 || /[\u0000-\u001f\u007f]/.test(location)))) return { ok: false, error: 'Invalid search parameters.' };
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

module.exports = { clientIp, createRateLimiter, securityHeaders, validateSearch, allowedHttpUrl };
