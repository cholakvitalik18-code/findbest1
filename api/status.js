'use strict';
const { sendJson, methodGuard } = require('./_lib/respond');

module.exports = (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return;
  sendJson(res, 200, {
    googleShopping: Boolean(process.env.SERPER_API_KEY || process.env.SERPAPI_KEY),
    ebay: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
    telegram: false,
    alerts: false
  });
};
