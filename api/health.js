'use strict';
const { sendJson, methodGuard } = require('./_lib/respond');

module.exports = (req, res) => {
  if (!methodGuard(req, res, ['GET', 'HEAD'])) return;
  sendJson(res, 200, { status: 'ok', uptime: Math.round(process.uptime()), at: new Date().toISOString() });
};
