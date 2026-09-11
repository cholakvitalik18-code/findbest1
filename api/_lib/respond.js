'use strict';

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}

function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) { sendJson(res, 405, { code: 'method_not_allowed' }, { Allow: allowed.join(', ') }); return false; }
  return true;
}

module.exports = { sendJson, methodGuard };
