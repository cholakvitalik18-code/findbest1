'use strict';
// Ported from server.js's live-search pipeline, unchanged in behaviour.
// Runs inside a Vercel function: the in-memory cache and eBay token cache below
// only last as long as one warm function instance - weaker than the always-on
// Node process this was ported from, but harmless (worst case: a few extra
// upstream calls).

const { parseSearchQuery, isRelevantProduct, normalizeProductKey, calculateDealScore } = require('./search-query');
const { allowedHttpUrl } = require('./security');

const SERPER_API_KEY = process.env.SERPER_API_KEY || process.env.SERPAPI_KEY || '';
const SEARCH_LOCATION = process.env.SEARCH_LOCATION || 'Germany';
const CACHE_TTL = Math.max(30, Number(process.env.CACHE_TTL_SECONDS || 180)) * 1000;
const CACHE_MAX = 150;
const cache = new Map();
let ebayToken = null;
let ebayTokenUntil = 0;

function log(event, details = {}) { console.log(JSON.stringify({ event, ...details, at: new Date().toISOString() })); }
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

module.exports = { liveSearch, SERPER_API_KEY };
