'use strict';
const { sendJson, methodGuard } = require('./_lib/respond');
const { createRateLimiter, clientIp, validateSearch } = require('./_lib/security');
const { liveSearch, SERPER_API_KEY } = require('./_lib/search-engine');

const searchLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 24 });

module.exports = async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return;
  const limited = searchLimit(`search:${clientIp(req)}`);
  if (!limited.allowed) return sendJson(res, 429, { error: 'Too many requests. Please try again in a moment.', code: 'rate_limited' }, { 'Retry-After': String(limited.retryAfter) });

  const url = new URL(req.url, 'http://findbest.internal');
  const check = validateSearch(url.searchParams.get('q'), url.searchParams.get('location'));
  if (!check.ok) return sendJson(res, 400, { error: check.error, code: 'invalid_query' });

  const started = Date.now();
  try {
    const data = await liveSearch(check.query, check.location);
    const ebayConfigured = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
    if (!SERPER_API_KEY && !ebayConfigured) data.setupRequired = true;
    console.log(JSON.stringify({ event: 'search', status: 200, latencyMs: Date.now() - started, cached: data.cached, itemCount: data.items.length }));
    sendJson(res, 200, data);
  } catch (_) {
    console.log(JSON.stringify({ event: 'search_error', latencyMs: Date.now() - started }));
    sendJson(res, 503, { error: 'Search temporarily unavailable. Please try again.', code: 'search_unavailable' });
  }
};
