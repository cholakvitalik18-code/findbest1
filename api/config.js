'use strict';
const { sendJson, methodGuard } = require('./_lib/respond');

// Telegram support/alerts aren't wired up on this deployment yet (the bot needs
// a webhook + a database - see DEPLOY_VERCEL_RU.md), so this stays off rather
// than pointing users at a bot that won't answer.
module.exports = (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return;
  sendJson(res, 200, { telegramBotUsername: null, alertsEnabled: false });
};
