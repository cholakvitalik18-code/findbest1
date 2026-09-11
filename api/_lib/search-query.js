'use strict';
// Verbatim copy of lib/search-query.js for the Vercel deployment (api/ functions
// can't reach outside their own tree at build time in every setup, so this is
// kept as a self-contained duplicate rather than a relative ../../lib import).
// Keep this in sync with lib/search-query.js if that file changes.

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const ACCESSORY_WORDS = /\b(case|cover|hülle|huelle|schutzfolie|screen protector|ladegerät|charger|kabel|cable|etui|tasche)\b/i;

function cleanText(value, maxLength = 120) {
  return String(value ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseSearchQuery(raw) {
  const original = cleanText(raw);
  let remaining = original;
  let maxPrice = null;
  let minPrice = null;
  let location = '';

  const maxMatch = remaining.match(/(?:до|under|bis|unter|max(?:imum)?|≤)\s*€?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|euro|eur|евро)?/i);
  if (maxMatch) {
    maxPrice = Number(maxMatch[1].replace(',', '.'));
    remaining = remaining.replace(maxMatch[0], ' ');
  }

  const minMatch = remaining.match(/(?:от|ab|min(?:imum)?|≥)\s*€?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|euro|eur|евро)?/i);
  if (minMatch) {
    minPrice = Number(minMatch[1].replace(',', '.'));
    remaining = remaining.replace(minMatch[0], ' ');
  }

  const locationMatch = remaining.match(/(?:\s+(?:в|in|near|bei|рядом\s+с)\s+)([A-Za-zÄÖÜäöüßÀ-ÿА-Яа-яЁё'\- ]{2,40})$/i);
  if (locationMatch) {
    location = cleanText(locationMatch[1], 40);
    remaining = remaining.slice(0, locationMatch.index).trim();
  }

  const product = cleanText(remaining || original);
  const storage = product.match(/\b(\d{2,4})\s?(gb|tb)\b/i)?.[0] || '';
  const ram = product.match(/\b(\d{1,3})\s?gb\s?ram\b/i)?.[0] || '';
  const gpu = product.match(/\b(?:rtx|rx)\s?\d{3,4}\b/i)?.[0] || '';
  const condition = /\b(neu|new|gebraucht|used|refurbished|восстановлен|б\/у)\b/i.exec(product)?.[0] || '';

  return {
    original,
    product,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : null,
    minPrice: Number.isFinite(minPrice) ? minPrice : null,
    currency: 'EUR',
    location,
    storage,
    ram,
    gpu,
    condition
  };
}

function tokenise(value) {
  return cleanText(value, 180).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token => token.length > 1);
}

function isRelevantProduct(item, intent) {
  const title = cleanText(item.title, 240);
  const queryTokens = tokenise(intent.product);
  if (!queryTokens.length) return true;
  const titleLower = title.toLowerCase();
  const matched = queryTokens.filter(token => titleLower.includes(token)).length;
  if (matched === 0) return false;
  if (!ACCESSORY_WORDS.test(intent.product) && ACCESSORY_WORDS.test(title)) return false;
  if (intent.storage && !new RegExp(intent.storage.replace(/\s/g, '\\s?'), 'i').test(title)) return false;
  if (intent.gpu && !new RegExp(intent.gpu.replace(/\s/g, '\\s?'), 'i').test(title)) return false;
  return true;
}

function normalizeProductKey(item) {
  const title = cleanText(item.title, 240).toLowerCase()
    .replace(/\b(apple|samsung|sony|microsoft|new|neu|gebraucht|used|refurbished|black|weiß|white|schwarz)\b/g, ' ')
    .replace(/\b(\d+)\s+(gb|tb)\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
  return title.slice(0, 140);
}

function calculateDealScore(item, context = {}) {
  const price = item.priceValue == null || item.priceValue === '' ? NaN : Number(item.priceValue);
  const prices = (context.prices || []).filter(Number.isFinite).sort((a, b) => a - b);
  const min = prices[0];
  const max = prices[prices.length - 1];
  const priceScore = Number.isFinite(price) && Number.isFinite(min)
    ? (max === min ? 1 : Math.max(0, Math.min(1, 1 - (price - min) / (max - min)))) : 0.25;
  const rating = item.rating == null || item.rating === '' ? NaN : Number(item.rating);
  const ratingScore = Number.isFinite(rating) ? Math.max(0, Math.min(1, rating / 5)) : 0.5;
  const deliveryScore = /free|kostenlos|бесплат/i.test(String(item.delivery || '')) ? 1 : 0.55;
  const relevanceScore = Number(item.relevanceScore);
  const relevance = Number.isFinite(relevanceScore) ? Math.max(0, Math.min(1, relevanceScore)) : 0.6;
  return Number((priceScore * 0.48 + relevance * 0.28 + ratingScore * 0.16 + deliveryScore * 0.08).toFixed(3));
}

module.exports = { cleanText, parseSearchQuery, isRelevantProduct, normalizeProductKey, calculateDealScore };
