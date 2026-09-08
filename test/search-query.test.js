'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSearchQuery, isRelevantProduct, calculateDealScore } = require('../lib/search-query');

test('parses Russian budget query without losing product', () => {
  const q = parseSearchQuery('iPhone 15 до 500 евро');
  assert.equal(q.product, 'iPhone 15');
  assert.equal(q.maxPrice, 500);
});

test('parses German budget and GPU', () => {
  const q = parseSearchQuery('Gaming Laptop RTX 4060 unter 1000 Euro');
  assert.equal(q.maxPrice, 1000);
  assert.equal(q.gpu.toLowerCase(), 'rtx 4060');
});

test('lowers relevance for accessories when product is requested', () => {
  const q = parseSearchQuery('iPhone 15');
  assert.equal(isRelevantProduct({ title: 'iPhone 15 128 GB' }, q), true);
  assert.equal(isRelevantProduct({ title: 'iPhone 15 case protective cover' }, q), false);
});

test('deal score favors cheaper otherwise similar offer', () => {
  const context = { prices: [470, 579] };
  assert.ok(calculateDealScore({ priceValue: 470, rating: 4.5 }, context) > calculateDealScore({ priceValue: 579, rating: 4.5 }, context));
});
