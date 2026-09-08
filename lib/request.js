'use strict';

function readJson(req, maxBytes = 12000) {
  return new Promise((resolve, reject) => {
    let size = 0, finished = false;
    const chunks = [];
    const fail = message => { if (!finished) { finished = true; reject(new Error(message)); } };
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) { req.resume(); fail('unsupported_type'); return; }
    if (Number(req.headers['content-length']) > maxBytes) { req.resume(); fail('body_too_large'); return; }
    req.on('data', chunk => { size += chunk.length; if (size > maxBytes) { chunks.length = 0; fail('body_too_large'); } else if (!finished) chunks.push(chunk); });
    req.on('end', () => { if (finished) return; try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); finished = true; resolve(body); } catch { fail('invalid_json'); } });
    req.on('aborted', () => fail('aborted'));
    req.on('error', () => fail('request_error'));
  });
}

module.exports = { readJson };
