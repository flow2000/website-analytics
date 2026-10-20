-- D1 数据库结构（dev 分支）
-- 执行：wrangler d1 execute website-analytics-dev-db --remote --file=src/schema.sql

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,            -- access_mode / access_password_hash / access_password_salt /
  value TEXT NOT NULL,             -- totp_secret / totp_pending_secret / cookie_secret / updated_at
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  zone_id TEXT,
  status TEXT DEFAULT 'active',
  added_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain);

CREATE TABLE IF NOT EXISTS daily_stats (
  domain TEXT NOT NULL,
  date TEXT NOT NULL,              -- UTC 日期 YYYY-MM-DD
  requests INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  uniques INTEGER DEFAULT 0,
  bytes INTEGER DEFAULT 0,
  threats INTEGER DEFAULT 0,
  cached_requests INTEGER DEFAULT 0,
  cached_bytes INTEGER DEFAULT 0,
  encrypted_requests INTEGER DEFAULT 0,
  encrypted_bytes INTEGER DEFAULT 0,
  visits INTEGER DEFAULT 0,
  waf_events INTEGER DEFAULT 0,
  ip_class TEXT,                   -- JSON {"key":{requests:..}}
  ssl_protocols TEXT,
  threat_pathing TEXT,
  countries TEXT,
  statuses TEXT,
  content_types TEXT,
  browsers TEXT,
  devices TEXT,
  PRIMARY KEY (domain, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,           -- report.json 全文（schema v3.0）
  generated_at TEXT,
  version TEXT
);