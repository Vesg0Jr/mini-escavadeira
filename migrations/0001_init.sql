PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','operator')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  changed_by TEXT,
  changed_at INTEGER NOT NULL
);
CREATE TABLE rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  effective_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  operator_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('running','paused','finished')),
  start_meter REAL NOT NULL CHECK(start_meter >= 0),
  end_meter REAL,
  start_file_id TEXT NOT NULL REFERENCES files(id),
  end_file_id TEXT REFERENCES files(id),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL,
  CHECK(end_meter IS NULL OR end_meter >= start_meter)
);
-- Existe uma única mini escavadeira: jamais duas obras abertas ao mesmo tempo.
CREATE UNIQUE INDEX idx_single_open_job ON jobs((1)) WHERE status != 'finished';
CREATE INDEX idx_jobs_started ON jobs(started_at);
CREATE TABLE work_segments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  start_ts INTEGER NOT NULL,
  end_ts INTEGER,
  hourly_cents INTEGER NOT NULL CHECK(hourly_cents > 0),
  rate_id INTEGER REFERENCES rates(id),
  CHECK(end_ts IS NULL OR end_ts >= start_ts)
);
CREATE INDEX idx_segment_job ON work_segments(job_id);
CREATE UNIQUE INDEX idx_one_open_segment_per_job ON work_segments(job_id) WHERE end_ts IS NULL;
CREATE TABLE job_adjustments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  delta_ms INTEGER NOT NULL,
  delta_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE maintenance (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  payer_role TEXT NOT NULL CHECK(payer_role IN ('admin','manager')),
  expense_date TEXT NOT NULL,
  file_id TEXT REFERENCES files(id),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_maintenance_date ON maintenance(expense_date);
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  paid_minutes INTEGER NOT NULL DEFAULT 0 CHECK(paid_minutes >= 0),
  payment_date TEXT NOT NULL,
  file_id TEXT REFERENCES files(id),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE TABLE login_limits (
 username TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL DEFAULT 0,
 first_attempt_at INTEGER NOT NULL,
 locked_until INTEGER NOT NULL DEFAULT 0
);
