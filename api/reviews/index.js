'use strict';
const { sendJson, methodGuard } = require('../_lib/respond');

// Reviews need a database with a persistent connection - Vercel functions have
// no local disk, so node:sqlite (used by lib/reviews-store.js on the Node/Render
// build) can't work here. This mirrors the app's own existing degrade path: the
// same 503 it already returns when no persistent storage is configured.
// TODO once Turso credentials are available: replace this with a real store
// backed by @libsql/client, reusing lib/reviews-validation.js as-is.
module.exports = (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  sendJson(res, 503, { error: 'Unable to complete this request. Please try again.', code: 'reviews_unavailable' });
};
