'use strict';
const { sendJson, methodGuard } = require('../../_lib/respond');

// See api/reviews/index.js - no database wired up yet on this deployment.
module.exports = (req, res) => {
  if (!methodGuard(req, res, ['PATCH', 'DELETE'])) return;
  sendJson(res, 503, { error: 'Unable to complete this request. Please try again.', code: 'reviews_unavailable' });
};
