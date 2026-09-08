'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { createReviewsStore } = require('./reviews-store');
const { validateReview, validateReviewList } = require('./reviews-validation');
const { clientIp, createRateLimiter } = require('./security');
const { readJson } = require('./request');
const scrypt = promisify(crypto.scrypt);
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

function createReviewsApi({ root, sendJson, log, env = process.env }) {
  const production = env.NODE_ENV === 'production' || env.RENDER === 'true';
  const dataDir = env.REVIEWS_DATA_DIR || path.join(root, 'data');
  const password = env.REVIEWS_ADMIN_PASSWORD || '';
  const origin = env.PUBLIC_SITE_URL || (env.RENDER_EXTERNAL_HOSTNAME ? `https://${env.RENDER_EXTERNAL_HOSTNAME}` : '');
  let siteOrigin = '';
  try { siteOrigin = new URL(origin).origin; } catch { /* No host guessing in production. */ }
  let secret = env.REVIEWS_SECRET || '', store = null;
  try {
    if (production && (env.REVIEWS_PERSISTENT_STORAGE !== 'true' || !path.isAbsolute(env.REVIEWS_DATA_DIR || '') || secret.length < 32 || !siteOrigin.startsWith('https://'))) throw new Error('reviews_configuration_required');
    if (!secret) {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      const secretPath = path.join(dataDir, 'reviews.secret');
      if (!fs.existsSync(secretPath)) fs.writeFileSync(secretPath, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
      secret = fs.readFileSync(secretPath, 'utf8').trim();
    }
    if (secret.length < 32) throw new Error('reviews_configuration_required');
    store = createReviewsStore(path.join(dataDir, 'reviews.sqlite'));
  } catch { log('reviews_unavailable', { reason: 'storage_or_configuration' }); }
  const accepting = Boolean(store && password.length >= 32 && password.length <= 128);
  const sessions = new Map(), adminDigest = crypto.scryptSync(password, secret || 'disabled-reviews', 32);
  const reads = createRateLimiter({ windowMs: 60000, max: 120 });
  const loginLimit = createRateLimiter({ windowMs: 900000, max: 5 });
  const loginGlobal = createRateLimiter({ windowMs: 60000, max: 15, maxEntries: 1 });
  const writeBurst = createRateLimiter({ windowMs: 60000, max: 20 });
  const digest = input => crypto.createHmac('sha256', secret).update(input).digest('hex');
  const failure = (req, res, status, code, extra = {}) => sendJson(req, res, status, { code, error: code === 'rate_limited' ? 'Too many requests. Please try again in a moment.' : 'Unable to complete this request. Please try again.', ...extra });
  function limited(req, res, result) {
    if (result.allowed) return false;
    sendJson(req, res, 429, { code: 'rate_limited', error: 'Too many requests. Please try again in a moment.' }, { 'Retry-After': String(result.retryAfter || 60) });
    return true;
  }
  function sameOrigin(req) {
    if (req.headers['x-findbest-request'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site') return false;
    const expected = siteOrigin || (!production && /^([a-z\d.-]+|\[::1\])(?::\d+)?$/i.test(req.headers.host || '') ? `http://${req.headers.host}` : '');
    return Boolean(expected && req.headers.origin === expected);
  }
  function cookie(token, maxAge = 1800) {
    return `fb_admin=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production || siteOrigin.startsWith('https://') ? '; Secure' : ''}`;
  }
  function auth(req) {
    const token = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('fb_admin='))?.slice(9) || '';
    const key = digest(token), expires = sessions.get(key);
    if (!expires || expires < Date.now()) { sessions.delete(key); return null; }
    return key;
  }
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/reviews') && !url.pathname.startsWith('/api/admin/')) return false;
    const started = Date.now(), endpoint = url.pathname.startsWith('/api/admin/') ? 'admin_reviews' : 'reviews';
    res.once('finish', () => log(endpoint, { method: req.method, status: res.statusCode, latencyMs: Date.now() - started }));
    const id = url.pathname.split('/')[3];
    const routes = {
      '/api/reviews': ['GET', 'POST'], '/api/admin/session': ['GET', 'POST', 'DELETE'], '/api/admin/reviews': ['GET']
    };
    const allowed = routes[url.pathname] || (uuid.test(id || '') && url.pathname === `/api/reviews/${id}/helpful` ? ['POST'] : null);
    // Admin ids have a different segment from public helpful-vote ids.
    const adminId = url.pathname.split('/')[4];
    const methods = allowed || (uuid.test(adminId || '') && url.pathname === `/api/admin/reviews/${adminId}` ? ['PATCH', 'DELETE'] : null);
    if (!methods) { failure(req, res, 404, 'not_found'); return true; }
    if (!methods.includes(req.method)) { sendJson(req, res, 405, { code: 'method_not_allowed' }, { Allow: methods.join(', ') }); return true; }
    if (Number(req.headers['content-length']) > 12000) { req.resume(); failure(req, res, 413, 'invalid_review'); return true; }
    const identity = digest(clientIp(req));
    if (limited(req, res, reads(identity))) return true;
    if (req.method !== 'GET' && !sameOrigin(req)) { failure(req, res, 403, 'forbidden'); return true; }
    if (!store) { failure(req, res, 503, 'reviews_unavailable'); return true; }
    try {
      if (url.pathname === '/api/admin/session') {
        if (req.method === 'GET') { sendJson(req, res, 200, { authenticated: Boolean(auth(req)) }); return true; }
        if (req.method === 'DELETE') { const key = auth(req); if (key) sessions.delete(key); sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) }); return true; }
        if (!accepting) { failure(req, res, 503, 'reviews_unavailable'); return true; }
        if (limited(req, res, loginGlobal('global')) || limited(req, res, loginLimit(identity))) return true;
        const data = await readJson(req, 2048);
        const input = typeof data?.password === 'string' && data.password.length <= 128 ? data.password : '';
        const candidate = await scrypt(input, secret, 32);
        if (!crypto.timingSafeEqual(adminDigest, candidate)) { failure(req, res, 401, 'invalid_credentials'); return true; }
        for (const [key, until] of sessions) if (until < Date.now()) sessions.delete(key);
        if (sessions.size >= 20) sessions.delete(sessions.keys().next().value);
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(digest(token), Date.now() + 1800000);
        sendJson(req, res, 200, { authenticated: true }, { 'Set-Cookie': cookie(token) }); return true;
      }
      if (url.pathname.startsWith('/api/admin/')) {
        if (!auth(req)) { failure(req, res, 401, 'authentication_required'); return true; }
        if (url.pathname === '/api/admin/reviews') {
          const params = validateReviewList(url.searchParams, true);
          if (!params) failure(req, res, 400, 'invalid_parameters'); else sendJson(req, res, 200, store.list(params));
          return true;
        }
        const data = req.method === 'DELETE' ? { action: 'delete' } : await readJson(req, 2048);
        if (!['published', 'hidden', 'pending', 'delete'].includes(data?.action) || (req.method === 'PATCH' && data.action === 'delete')) { failure(req, res, 400, 'invalid_parameters'); return true; }
        if (!store.moderate(adminId, data.action)) failure(req, res, 404, 'not_found'); else sendJson(req, res, 200, { ok: true });
        return true;
      }
      if (req.method === 'GET') {
        const params = validateReviewList(url.searchParams);
        if (!params) failure(req, res, 400, 'invalid_parameters');
        else sendJson(req, res, 200, { ...store.list(params), summary: store.summary(), accepting });
        return true;
      }
      if (!accepting) { failure(req, res, 503, 'reviews_unavailable'); return true; }
      if (limited(req, res, writeBurst(identity))) return true;
      if (url.pathname.endsWith('/helpful')) {
        await readJson(req, 2048);
        if (limited(req, res, store.takeLimit(`vote:${identity}`, 30, 3600000))) return true;
        const result = store.vote(id, digest(`${id}:${clientIp(req)}`));
        if (!result) failure(req, res, 404, 'not_found'); else sendJson(req, res, 200, result);
        return true;
      }
      const data = await readJson(req);
      const review = validateReview(data);
      if (!review || data.website) { failure(req, res, 400, 'invalid_review'); return true; }
      if (limited(req, res, store.takeLimit(`submit:${identity}`, 3, 86400000)) || limited(req, res, store.takeLimit('submit:global', 200, 86400000))) return true;
      const result = store.create({ ...review, fingerprint: digest(`${review.name.toLowerCase()}|${review.body.toLowerCase()}|${review.rating}`) });
      if (result.duplicate) failure(req, res, 409, 'duplicate_review'); else sendJson(req, res, 201, { status: 'pending' });
    } catch (error) {
      const bodyErrors = { body_too_large: 413, unsupported_type: 415, invalid_json: 400 };
      if (bodyErrors[error.message]) failure(req, res, bodyErrors[error.message], 'invalid_review');
      else { log('reviews_error', { endpoint, type: error.message === 'queue_full' ? 'queue_full' : 'storage_error' }); failure(req, res, 503, 'reviews_unavailable'); }
    }
    return true;
  }
  return { handle, close: () => store?.close() };
}

module.exports = { createReviewsApi };
