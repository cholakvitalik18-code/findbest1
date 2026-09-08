'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { randomUUID } = crypto;

// Price alerts live in their own SQLite database so they survive redeploys and
// concurrent writes. On Render this sits on the persistent disk via
// REVIEWS_DATA_DIR; locally it is <root>/data/alerts.sqlite.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  query TEXT NOT NULL,
  max_price REAL NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  chat_id TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL,
  connected_at TEXT,
  last_checked_at TEXT,
  last_notified_at TEXT,
  last_notified_price REAL,
  last_notified_item_id TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(active, chat_id);
CREATE INDEX IF NOT EXISTS idx_alerts_token ON alerts(token);
PRAGMA user_version = 1;
`;

const FIELDS = [
  'id', 'token', 'query', 'max_price AS maxPrice', 'location', 'chat_id AS chatId',
  'active', 'created_at AS createdAt', 'connected_at AS connectedAt',
  'last_checked_at AS lastCheckedAt', 'last_notified_at AS lastNotifiedAt',
  'last_notified_price AS lastNotifiedPrice', 'last_notified_item_id AS lastNotifiedItemId'
].join(', ');

// camelCase patch keys that callers are allowed to persist through update().
const UPDATABLE = {
  chatId: 'chat_id',
  active: 'active',
  lastCheckedAt: 'last_checked_at',
  lastNotifiedAt: 'last_notified_at',
  lastNotifiedPrice: 'last_notified_price',
  lastNotifiedItemId: 'last_notified_item_id'
};

function createAlertStore(dataDir = path.join(__dirname, 'data')) {
  const { DatabaseSync } = require('node:sqlite');
  const memory = dataDir === ':memory:';
  const file = memory ? ':memory:' : path.join(dataDir, 'alerts.sqlite');
  if (!memory) fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version > 1) { db.close(); throw new Error('unsupported_schema'); }
  if (version < 1) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(SCHEMA); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (!memory) {
    try { fs.chmodSync(file, 0o600); } catch (_) { /* best effort */ }
    importLegacyJson(db, path.join(dataDir, 'alerts.json'));
  }

  const get = id => db.prepare(`SELECT ${FIELDS} FROM alerts WHERE id = ?`).get(id) || null;

  return {
    close: () => db.close(),
    create({ query, maxPrice, location = '' }) {
      const id = randomUUID();
      const token = crypto.randomBytes(8).toString('hex');
      db.prepare('INSERT INTO alerts (id, token, query, max_price, location, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, token, String(query).trim(), Number(maxPrice), String(location || '').trim(), new Date().toISOString());
      return get(id);
    },
    bind(token, chatId) {
      const row = db.prepare('SELECT id FROM alerts WHERE token = ? AND active = 1').get(token);
      if (!row) return null;
      db.prepare('UPDATE alerts SET chat_id = ?, connected_at = ? WHERE id = ?')
        .run(String(chatId), new Date().toISOString(), row.id);
      return get(row.id);
    },
    listActive() {
      return db.prepare(`SELECT ${FIELDS} FROM alerts WHERE active = 1 AND chat_id IS NOT NULL`).all();
    },
    listByChat(chatId) {
      return db.prepare(`SELECT ${FIELDS} FROM alerts WHERE active = 1 AND chat_id = ? ORDER BY created_at`).all(String(chatId));
    },
    disable(id, chatId) {
      return db.prepare('UPDATE alerts SET active = 0 WHERE id = ? AND chat_id = ?').run(id, String(chatId)).changes > 0;
    },
    update(id, patch = {}) {
      const sets = [], values = [];
      for (const [key, column] of Object.entries(UPDATABLE)) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) { sets.push(`${column} = ?`); values.push(patch[key]); }
      }
      if (sets.length) db.prepare(`UPDATE alerts SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
      return get(id);
    }
  };
}

// One-time migration from the old data/alerts.json file. Best effort: a broken or
// missing file must never stop the server from starting.
function importLegacyJson(db, jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) return;
    if (db.prepare('SELECT count(*) AS n FROM alerts').get().n === 0) {
      const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const insert = db.prepare(`INSERT OR IGNORE INTO alerts
        (id, token, query, max_price, location, chat_id, active, created_at, connected_at, last_checked_at, last_notified_at, last_notified_price, last_notified_item_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const r of Array.isArray(rows) ? rows : []) {
          if (!r || !r.id || !r.token) continue;
          insert.run(
            String(r.id), String(r.token), String(r.query || '').trim(), Number(r.maxPrice) || 0,
            String(r.location || '').trim(), r.chatId != null ? String(r.chatId) : null,
            r.active === false ? 0 : 1, String(r.createdAt || new Date().toISOString()),
            r.connectedAt || null, r.lastCheckedAt || null, r.lastNotifiedAt || null,
            r.lastNotifiedPrice != null ? Number(r.lastNotifiedPrice) : null, r.lastNotifiedItemId || null
          );
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    fs.renameSync(jsonPath, `${jsonPath}.imported`);
  } catch (_) { /* legacy import is best effort */ }
}

module.exports = { createAlertStore };
