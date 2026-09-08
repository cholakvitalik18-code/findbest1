'use strict';

const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { gzip } = require('node:zlib');
const { promisify } = require('node:util');
const compress = promisify(gzip);
const cache = new Map();
const MAX_BYTES = 16 * 1024 * 1024;
let usedBytes = 0;

async function staticContent(file, compressible) {
  const stat = await fs.stat(file);
  const signature = `${stat.mtimeMs}:${stat.size}`;
  const old = cache.get(file);
  if (old?.signature === signature) return old;
  const body = await fs.readFile(file);
  const zipped = compressible && body.length > 1024 ? await compress(body) : null;
  const entry = { signature, body, zipped, tag: createHash('sha256').update(body).digest('base64url').slice(0, 24), bytes: body.length + (zipped?.length || 0) };
  if (old) { usedBytes -= old.bytes; cache.delete(file); }
  while (cache.size && (cache.size >= 64 || usedBytes + entry.bytes > MAX_BYTES)) {
    const key = cache.keys().next().value;
    usedBytes -= cache.get(key).bytes; cache.delete(key);
  }
  if (entry.bytes <= MAX_BYTES) { cache.set(file, entry); usedBytes += entry.bytes; }
  return entry;
}

function acceptsGzip(header = '') {
  return String(header).split(',').some(value => {
    const [encoding, ...params] = value.trim().split(';');
    if (encoding.toLowerCase() !== 'gzip') return false;
    const quality = params.find(x => /^\s*q\s*=/i.test(x));
    return quality === undefined || Number(quality.split('=')[1]) > 0;
  });
}

module.exports = { staticContent, acceptsGzip };
