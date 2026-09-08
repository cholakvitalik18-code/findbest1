CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 40),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 20 AND 2000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden')),
  created_at TEXT NOT NULL,
  moderated_at TEXT,
  fingerprint TEXT NOT NULL,
  helpful INTEGER NOT NULL DEFAULT 0 CHECK(helpful >= 0)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_reviews_status_date ON reviews(status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_reviews_popular ON reviews(status, helpful DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_duplicate ON reviews(fingerprint, created_at);
CREATE TABLE IF NOT EXISTS review_votes (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  PRIMARY KEY(review_id, voter_hash)
) STRICT;
CREATE TABLE IF NOT EXISTS review_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_review_limits_expiry ON review_limits(expires_at);
PRAGMA user_version = 1;
