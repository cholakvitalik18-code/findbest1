'use strict';
const { sendJson, methodGuard } = require('../_lib/respond');

// Price alerts need the Telegram bot (webhook, not the old long-polling loop -
// that can't run on a serverless function) and a database for the alert rows.
// Neither is wired up yet on this deployment. The frontend already has a
// graceful "alerts unavailable" state for this exact response.
// TODO once ready: POST /api/telegram webhook + Turso-backed alert store.
module.exports = (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return;
  sendJson(res, 503, { error: 'Price alerts are temporarily unavailable.', code: 'alerts_unavailable' });
};
