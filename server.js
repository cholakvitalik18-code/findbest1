'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { readJson } = require('./lib/request');
const { staticContent, acceptsGzip } = require('./lib/static-content');
const { createReviewsApi } = require('./lib/reviews-api');
const { createAlertStore } = require('./alerts-store');
const { startSupportBot } = require('./support-bot');
const { parseSearchQuery, isRelevantProduct, normalizeProductKey, calculateDealScore } = require('./lib/search-query');
const { clientIp, createRateLimiter, securityHeaders, validateSearch, allowedHttpUrl } = require('./lib/security');

function loadDotEnv(file = '.env') {
  try {
    for (const raw of fs.readFileSync(path.join(__dirname, file), 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const index = line.indexOf('=');
      if (index < 1) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (_) { /* .env is optional */ }
}
loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const SERPER_API_KEY = process.env.SERPER_API_KEY || process.env.SERPAPI_KEY || '';
const SEARCH_LOCATION = process.env.SEARCH_LOCATION || 'Germany';
const CACHE_TTL = Math.max(30, Number(process.env.CACHE_TTL_SECONDS || 180)) * 1000;
const CACHE_MAX = 150;
const BOT_USER = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
const ALERT_MINUTES = Math.max(60, Number(process.env.ALERT_CHECK_MINUTES || 360));
const cache = new Map();
// Search text is not retained as analytics.
const ALERTS_DATA_DIR = process.env.REVIEWS_DATA_DIR || path.join(__dirname, 'data');
const alertStore = createAlertStore(ALERTS_DATA_DIR);
let ebayToken = null;
let ebayTokenUntil = 0;
const searchLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 24 });
const alertLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 8 });

function log(event, details = {}) { console.log(JSON.stringify({ event, ...details, at: new Date().toISOString() })); }
function sendJson(req, res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, { ...securityHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}
function publicError(req, res, statusCode, message, code) { return sendJson(req, res, statusCode, { error: message, code }); }
function slugify(value) { return String(value || '').trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function sourceLinks(query) { const encoded = encodeURIComponent(query), slug = slugify(query) || 'suche'; return [{ source: 'Kleinanzeigen', url: `https://www.kleinanzeigen.de/s-${slug}/k0` }, { source: 'eBay', url: `https://www.ebay.de/sch/i.html?_nkw=${encoded}` }, { source: 'MediaMarkt', url: `https://www.mediamarkt.de/de/search.html?query=${encoded}` }, { source: 'SATURN', url: `https://www.saturn.de/de/search.html?query=${encoded}` }]; }
function priceNumber(value) { const direct = Number(value?.extractedPrice ?? value?.extracted_price); if (Number.isFinite(direct)) return direct; const match = String(value?.price || '').replace(/\./g, '').replace(',', '.').match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
function normalizePriceText(value) { if (value?.price) return String(value.price).slice(0, 50); const price = priceNumber(value); return Number.isFinite(price) ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price) : ''; }

async function fetchWithTimeout(url, options = {}, { timeoutMs = 8000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' }); if (response.status >= 500 && attempt < retries) continue; return response; }
    catch (error) { lastError = error; if (attempt === retries) throw error; }
    finally { clearTimeout(timer); }
  }
  throw lastError || new Error('Request failed');
}

async function searchGoogleShopping(query, location) {
  if (!SERPER_API_KEY) return { configured: false, items: [] };
  const response = await fetchWithTimeout('https://google.serper.dev/shopping', { method: 'POST', headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ q: query, gl: 'de', hl: 'de', location: location || SEARCH_LOCATION }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error || data.message) throw new Error('provider_error');
  const rows = Array.isArray(data.shopping) ? data.shopping : [];
  return { configured: true, items: rows.map((item, index) => ({
    id: `shopping-${String(item.productId || item.link || index).slice(0, 240)}`, provider: 'Google Shopping via Serper', source: String(item.source || 'Магазин').slice(0, 100), title: String(item.title || 'Товар').slice(0, 240), price: normalizePriceText(item), priceValue: priceNumber(item), oldPrice: String(item.oldPrice || '').slice(0, 50), condition: String(item.condition || '').slice(0, 80), delivery: String(item.delivery || '').slice(0, 100), rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null, reviews: Number.isFinite(Number(item.ratingCount ?? item.reviews)) ? Number(item.ratingCount ?? item.reviews) : null, image: allowedHttpUrl(item.imageUrl || item.thumbnail), url: allowedHttpUrl(item.link || item.productLink), multipleSources: false
  })).filter(item => item.url) };
}
async function getEbayToken() {
  const clientId = process.env.EBAY_CLIENT_ID || '', clientSecret = process.env.EBAY_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  if (ebayToken && Date.now() < ebayTokenUntil - 60_000) return ebayToken;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetchWithTimeout('https://api.ebay.com/identity/v1/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('provider_error');
  ebayToken = data.access_token; ebayTokenUntil = Date.now() + Number(data.expires_in || 7200) * 1000; return ebayToken;
}
async function searchEbay(query) {
  const token = await getEbayToken(); if (!token) return { configured: false, items: [] };
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search'); url.searchParams.set('q', query); url.searchParams.set('limit', '50'); url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE}');
  const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE', Accept: 'application/json' } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error('provider_error');
  return { configured: true, items: (data.itemSummaries || []).map((item, index) => ({ id: `ebay-${String(item.itemId || index).slice(0, 240)}`, provider: 'eBay Browse API', source: 'eBay', title: String(item.title || 'eBay item').slice(0, 240), price: item.price ? `${item.price.value} ${item.price.currency || 'EUR'}` : '', priceValue: item.price ? Number(item.price.value) : null, oldPrice: '', condition: String(item.condition || '').slice(0, 80), delivery: '', rating: null, reviews: null, image: allowedHttpUrl(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl), url: allowedHttpUrl(item.itemAffiliateWebUrl || item.itemWebUrl), multipleSources: false })).filter(item => item.url) };
}
function dedupeAndRank(items, intent) {
  const relevant = items.filter(item => isRelevantProduct(item, intent)); const candidates = relevant.length ? relevant : items; const seen = new Set(); const prices = candidates.filter(item => item.priceValue != null && item.priceValue !== '').map(item => Number(item.priceValue)).filter(Number.isFinite);
  return candidates.map(item => { const tokens = intent.product.toLowerCase().split(/\s+/).filter(Boolean); const matched = tokens.filter(token => item.title.toLowerCase().includes(token)).length; return { ...item, normalizedProduct: normalizeProductKey(item), relevanceScore: tokens.length ? matched / tokens.length : 0.5 }; }).filter(item => { const key = `${item.source.toLowerCase()}|${item.normalizedProduct}|${item.priceValue ?? item.price}`; if (seen.has(key)) return false; seen.add(key); return true; }).map(item => ({ ...item, dealScore: calculateDealScore(item, { prices }) })).sort((a, b) => b.dealScore - a.dealScore).slice(0, 80);
}
function getCached(key) { const entry = cache.get(key); if (!entry || entry.expiresAt <= Date.now()) { cache.delete(key); return null; } return entry.data; }
function saveCache(key, data) { if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL }); }
async function liveSearch(query, location = '') {
  const intent = parseSearchQuery(query), providerQuery = intent.original, key = `${providerQuery.toLowerCase()}|${location.toLowerCase()}`, cached = getCached(key); if (cached) return { ...cached, cached: true };
  const warnings = [], providers = {}, all = []; const [google, ebay] = await Promise.allSettled([searchGoogleShopping(providerQuery, location), searchEbay(providerQuery)]);
  if (google.status === 'fulfilled') { providers.googleShopping = google.value.configured; all.push(...google.value.items); } else { providers.googleShopping = Boolean(SERPER_API_KEY); warnings.push('Google Shopping temporarily unavailable.'); log('provider_error', { provider: 'google' }); }
  if (ebay.status === 'fulfilled') { providers.ebay = ebay.value.configured; all.push(...ebay.value.items); } else { providers.ebay = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET); warnings.push('eBay temporarily unavailable.'); log('provider_error', { provider: 'ebay' }); }
  const data = { query: intent.original, parsedQuery: intent, location: location || SEARCH_LOCATION, live: all.length > 0, items: dedupeAndRank(all, intent), sourceLinks: sourceLinks(providerQuery), providers, warnings, generatedAt: new Date().toISOString(), cached: false };
  if (!warnings.length) saveCache(key, data); return data;
}

const bot = startSupportBot({ token: process.env.TELEGRAM_BOT_TOKEN || '', ownerId: process.env.TELEGRAM_OWNER_ID || '', brand: 'FindBest.de', onAlertConnect: async (chatId, token) => alertStore.bind(token, chatId), listAlerts: async chatId => alertStore.listByChat(chatId), disableAlert: async (id, chatId) => alertStore.disable(id, chatId) });
async function checkAlerts() {
  if (!bot.enabled || !SERPER_API_KEY) return; const groups = new Map(); for (const alert of alertStore.listActive()) { const key = `${alert.query}|${alert.location}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(alert); }
  for (const alerts of groups.values()) { const first = alerts[0]; try { const data = await liveSearch(first.query, first.location ? `${first.location}, Germany` : ''); const offers = data.items.filter(item => item.priceValue != null && item.priceValue !== '' && Number.isFinite(Number(item.priceValue))).sort((a, b) => Number(a.priceValue) - Number(b.priceValue)); for (const alert of alerts) { alertStore.update(alert.id, { lastCheckedAt: new Date().toISOString() }); const hit = offers.find(item => Number(item.priceValue) <= Number(alert.maxPrice)); if (!hit || (alert.lastNotifiedItemId === hit.id && Number(alert.lastNotifiedPrice) <= Number(hit.priceValue))) continue; await bot.sendMessage(alert.chatId, `🔥 FindBest.de нашёл цену ниже лимита!\n\n${hit.title}\nЦена: ${hit.price || `€${hit.priceValue}`}\nВаш лимит: €${alert.maxPrice}\nИсточник: ${hit.source}`, { reply_markup: { inline_keyboard: [[{ text: 'Открыть предложение ↗', url: hit.url }]] } }); alertStore.update(alert.id, { lastNotifiedPrice: Number(hit.priceValue), lastNotifiedItemId: hit.id, lastNotifiedAt: new Date().toISOString() }); } } catch (_) { log('alert_check_error'); } }
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const publicPages = new Set(['index.html', 'results.html', 'favorites.html', 'reviews.html', 'admin-reviews.html', 'robots.txt', 'sitemap.xml', 'favicon.ico']);
function serveStatic(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) return publicError(req, res, 405, 'Method not allowed.', 'method_not_allowed');
  let relative;
  try { relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, ''); }
  catch { return publicError(req, res, 400, 'Invalid request.', 'invalid_path'); }
  const asset = /^assets\/(?:category-art|css|js)\/[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|svg|css|js)$/.test(relative);
  if (!publicPages.has(relative) && !asset) return publicError(req, res, 404, 'Page not found.', 'not_found');
  const file = path.resolve(__dirname, relative), base = path.resolve(__dirname) + path.sep;
  fs.realpath(file, async (pathError, real) => {
    if (pathError || !real.startsWith(base)) return publicError(req, res, 404, 'Page not found.', 'not_found');
    try {
      const ext = path.extname(file).toLowerCase(), isHtml = ext === '.html';
      const compressible = ['.html', '.js', '.css', '.xml', '.txt', '.svg'].includes(ext);
      const entry = await staticContent(real, compressible);
      const zipped = entry.zipped && acceptsGzip(req.headers['accept-encoding']);
      const body = zipped ? entry.zipped : entry.body;
      const etag = '"' + entry.tag + (zipped ? '-gzip' : '') + '"';
      const headers = { ...securityHeaders(req, isHtml), 'Content-Type': mime[ext] || 'application/octet-stream', ETag: etag,
        'Cache-Control': isHtml ? 'no-cache' : ['.png', '.webp', '.jpg', '.jpeg'].includes(ext) ? 'public, max-age=86400' : 'public, max-age=0, must-revalidate',
        ...(compressible ? { Vary: 'Accept-Encoding' } : {}),
        ...(zipped ? { 'Content-Encoding': 'gzip' } : {}),
        ...(relative === 'admin-reviews.html' ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) };
      if (String(req.headers['if-none-match'] || '').split(',').some(value => value.trim().replace(/^W\//, '') === etag)) {
        res.writeHead(304, headers); return res.end();
      }
      res.writeHead(200, { ...headers, 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { return publicError(req, res, 404, 'Page not found.', 'not_found'); }
  });
}
const reviewsApi = createReviewsApi({ root: __dirname, sendJson, log });
const server = http.createServer(async (req, res) => {
  try {
    if ((req.url || '').length > 2048) return publicError(req, res, 414, 'Request too long.', 'invalid_request');
    const requestUrl = new URL(req.url || '/', 'http://findbest.internal'), ip = clientIp(req);
    if (await reviewsApi.handle(req, res, requestUrl)) return;
    if (requestUrl.pathname === '/api/health') { if (!['GET', 'HEAD'].includes(req.method)) return publicError(req, res, 405, 'Method not allowed.', 'method_not_allowed'); return sendJson(req, res, 200, { status: 'ok', uptime: Math.round(process.uptime()), at: new Date().toISOString() }); }
    if (requestUrl.pathname === '/api/config') { if (req.method !== 'GET') return publicError(req, res, 405, 'Method not allowed.', 'method_not_allowed'); return sendJson(req, res, 200, { telegramBotUsername: BOT_USER || null, alertsEnabled: Boolean(BOT_USER && bot.enabled) }); }
    if (requestUrl.pathname === '/api/status') { if (req.method !== 'GET') return publicError(req, res, 405, 'Method not allowed.', 'method_not_allowed'); return sendJson(req, res, 200, { googleShopping: Boolean(SERPER_API_KEY), ebay: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET), telegram: bot.enabled, alerts: Boolean(BOT_USER && bot.enabled) }); }
    if (requestUrl.pathname === '/api/search') {
      if (req.method !== 'GET') return publicError(req, res, 405, 'Method not allowed.', 'method_not_allowed'); const limited = searchLimit(`search:${ip}`); if (!limited.allowed) return sendJson(req, res, 429, { error: 'Too many requests. Please try again in a moment.', code: 'rate_limited' }, { 'Retry-After': String(limited.retryAfter) }); const check = validateSearch(requestUrl.searchParams.get('q'), requestUrl.searchParams.get('location')); if (!check.ok) return publicError(req, res, 400, check.error, 'invalid_query'); const started = Date.now();
      try { const data = await liveSearch(check.query, check.location); if (!SERPER_API_KEY && !(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET)) data.setupRequired = true; log('search', { status: 200, latencyMs: Date.now() - started, cached: data.cached, itemCount: data.items.length }); return sendJson(req, res, 200, data); } catch (_) { log('search_error', { latencyMs: Date.now() - started }); return publicError(req, res, 503, 'Search temporarily unavailable. Please try again.', 'search_unavailable'); }
    }
    if (requestUrl.pathname === '/api/alerts/create') {
      if (req.method !== 'POST') return publicError(req, res, 405, 'Method not allowed.', 'method_not_allowed'); const limited = alertLimit(`alert:${ip}`); if (!limited.allowed) return sendJson(req, res, 429, { error: 'Too many requests. Please try again in a moment.', code: 'rate_limited' }, { 'Retry-After': String(limited.retryAfter) }); if (!BOT_USER || !bot.enabled) return publicError(req, res, 503, 'Price alerts are temporarily unavailable.', 'alerts_unavailable');
      try { const body = await readJson(req); const check = validateSearch(body.query, body.location); const maxPrice = Number(body.maxPrice); if (!check.ok || !Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice > 1_000_000) return publicError(req, res, 400, 'Check the product name and target price.', 'invalid_alert'); const alert = alertStore.create({ query: check.query, maxPrice, location: check.location }); return sendJson(req, res, 201, { id: alert.id, telegramUrl: `https://t.me/${BOT_USER}?start=alert_${alert.token}` }); } catch (error) { return publicError(req, res, error.message === 'body_too_large' ? 413 : 400, 'Invalid request.', 'invalid_request'); }
    }
    return serveStatic(req, res, requestUrl.pathname);
  } catch (_) { log('unexpected_server_error'); return publicError(req, res, 500, 'Something went wrong. Please try again.', 'server_error'); }
});
server.requestTimeout = 15_000; server.headersTimeout = 20_000;
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => log('server_started', { port: PORT, googleShopping: Boolean(SERPER_API_KEY), ebay: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) }));
  setTimeout(() => checkAlerts().catch(() => {}), 60_000).unref();
  setInterval(() => checkAlerts().catch(() => {}), ALERT_MINUTES * 60 * 1000).unref();
}
server.on('close', () => { reviewsApi.close(); alertStore.close(); });
module.exports = { server, dedupeAndRank, liveSearch };
