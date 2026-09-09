PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss', 'wechat')),
  name TEXT NOT NULL,
  canonical_url TEXT,
  avatar_url TEXT,
  external_id TEXT,
  provider_key TEXT NOT NULL,
  provider_meta_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('active','rate_limited','needs_auth','parse_error','unavailable','disabled')),
  last_synced_at TEXT,
  next_sync_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sources_provider_external
ON sources(provider_key, external_id)
WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_sources_next_sync ON sources(next_sync_at);
CREATE INDEX IF NOT EXISTS ix_sources_status ON sources(status);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  external_id TEXT,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  content_hash TEXT,
  content_status TEXT NOT NULL CHECK (content_status IN ('pending','ready','partial','unavailable','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_articles_source_external
ON articles(source_id, external_id)
WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_articles_source_url
ON articles(source_id, canonical_url);

CREATE INDEX IF NOT EXISTS ix_articles_published ON articles(published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_articles_source_published ON articles(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS ix_articles_content_status ON articles(content_status);

CREATE TABLE IF NOT EXISTS article_contents (
  article_id TEXT PRIMARY KEY,
  document_json TEXT,
  raw_snapshot_path TEXT,
  parser TEXT,
  parser_version TEXT,
  parse_confidence REAL CHECK (parse_confidence IS NULL OR (parse_confidence >= 0 AND parse_confidence <= 1)),
  parse_diagnostics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  provider_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','success','failed')),
  new_articles INTEGER NOT NULL DEFAULT 0,
  updated_articles INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_sync_logs_source_started ON sync_logs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_sync_logs_created ON sync_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS media_cache (
  id TEXT PRIMARY KEY,
  original_url TEXT NOT NULL UNIQUE,
  local_path TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  etag TEXT,
  last_modified TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','ready','failed')),
  last_accessed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_media_lru ON media_cache(last_accessed_at);
CREATE INDEX IF NOT EXISTS ix_media_status ON media_cache(status);
