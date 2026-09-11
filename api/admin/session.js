'use strict';
const { sendJson, methodGuard } = require('../_lib/respond');

// See api/reviews/index.js - no database wired up yet on this deployment, so
// there is nothing to authenticate against. admin-reviews.html shows this as
// "unavailable" rather than an infinite login prompt.
module.exports = (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST', 'DELETE'])) return;
  sendJson(res, 503, { error: 'Unable to complete this request. Please try again.', code: 'reviews_unavailable' });
};
