'use strict';

function validateReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { name, body, rating } = value;
  if (typeof name !== 'string' || typeof body !== 'string' || !Number.isInteger(rating) || rating < 1 || rating > 5 || value.consent !== true) return null;
  if (name.length > 40 || body.length > 2000 || /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(name) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(body)) return null;
  const cleanName = name.trim().normalize('NFC'), cleanBody = body.trim().normalize('NFC');
  if ([...cleanName].length < 2 || [...cleanBody].length < 20 || !/[\p{L}\p{N}]/u.test(cleanName) || !/[\p{L}\p{N}]/u.test(cleanBody)) return null;
  // Preserve the author's text. It is rendered as text, never as HTML.
  return { name: cleanName, body: cleanBody, rating };
}

function validateReviewList(params, admin = false) {
  const sort = params.get('sort') || 'newest', page = params.get('page') || '1';
  const status = admin ? params.get('status') || 'pending' : 'published';
  if (!['newest', 'popular'].includes(sort) || !/^\d{1,5}$/.test(page) || Number(page) < 1 || Number(page) > 10000 || !['pending', 'published', 'hidden'].includes(status)) return null;
  return { sort, page: Number(page), status };
}

module.exports = { validateReview, validateReviewList };
