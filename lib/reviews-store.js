'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createReviewsStore(filename) {
  const { DatabaseSync } = require('node:sqlite');
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) { db.close(); throw new Error('unsupported_schema'); }
  if (version < 1) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(fs.readFileSync(path.join(__dirname, '../db/001-reviews.sql'), 'utf8')); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
  db.exec('PRAGMA optimize');
  const fields = 'id, name, rating, body, created_at AS createdAt, helpful';
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function takeLimit(bucket, max, windowMs, now = Date.now()) {
    return transaction(() => {
      db.prepare('DELETE FROM review_limits WHERE expires_at <= ?').run(now);
      const row = db.prepare('SELECT count, expires_at FROM review_limits WHERE bucket = ?').get(bucket);
      if (row && row.count >= max) return { allowed: false, retryAfter: Math.max(1, Math.ceil((row.expires_at - now) / 1000)) };
      if (!row && db.prepare('SELECT count(*) AS n FROM review_limits').get().n >= 10000) return { allowed: false, retryAfter: 60 };
      db.prepare('INSERT INTO review_limits VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1').run(bucket, now + windowMs);
      return { allowed: true };
    });
  }
  return {
    close: () => db.close(),
    takeLimit,
    list({ sort = 'newest', page = 1, status = 'published' } = {}) {
      const order = sort === 'popular' ? 'helpful DESC, created_at DESC, id' : 'created_at DESC, id';
      const total = db.prepare('SELECT count(*) AS n FROM reviews WHERE status = ?').get(status).n;
      const rows = db.prepare(`SELECT ${fields}, status FROM reviews WHERE status = ? ORDER BY ${order} LIMIT 10 OFFSET ?`).all(status, (page - 1) * 10);
      return { items: rows, total, page, pages: Math.ceil(total / 10) };
    },
    summary() {
      const stats = db.prepare("SELECT count(*) AS total, avg(rating) AS average FROM reviews WHERE status = 'published'").get();
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const row of db.prepare("SELECT rating, count(*) AS n FROM reviews WHERE status = 'published' GROUP BY rating").all()) distribution[row.rating] = row.n;
      return { ...stats, average: stats.average === null ? null : Math.round(stats.average * 10) / 10, distribution };
    },
    create({ name, rating, body, fingerprint }) {
      return transaction(() => {
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        if (db.prepare('SELECT id FROM reviews WHERE fingerprint = ? AND created_at > ? LIMIT 1').get(fingerprint, yesterday)) return { duplicate: true };
        if (db.prepare("SELECT count(*) AS n FROM reviews WHERE status = 'pending'").get().n >= 1000 || db.prepare('SELECT count(*) AS n FROM reviews').get().n >= 100000) throw new Error('queue_full');
        const id = randomUUID();
        db.prepare('INSERT INTO reviews(id, name, rating, body, created_at, fingerprint) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, rating, body, new Date().toISOString(), fingerprint);
        return { id, status: 'pending' };
      });
    },
    vote(id, voterHash) {
      return transaction(() => {
        if (!db.prepare("SELECT id FROM reviews WHERE id = ? AND status = 'published'").get(id)) return null;
        // One anonymous network identity per review. Not a verified-person vote.
        const added = db.prepare('INSERT OR IGNORE INTO review_votes VALUES (?, ?)').run(id, voterHash).changes;
        if (added) db.prepare('UPDATE reviews SET helpful = helpful + 1 WHERE id = ?').run(id);
        return { helpful: db.prepare('SELECT helpful FROM reviews WHERE id = ?').get(id).helpful, alreadyVoted: !added };
      });
    },
    moderate(id, action) {
      if (action === 'delete') return db.prepare('DELETE FROM reviews WHERE id = ?').run(id).changes > 0;
      if (!['published', 'hidden', 'pending'].includes(action)) throw new Error('invalid_action');
      return db.prepare('UPDATE reviews SET status = ?, moderated_at = ? WHERE id = ?').run(action, new Date().toISOString(), id).changes > 0;
    }
  };
}

module.exports = { createReviewsStore };
