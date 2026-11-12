-- V3: cadastros, agendamento, ocorrências e fotos finais; preserva o histórico.
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_clients_name ON clients(name);

CREATE TABLE work_orders (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  service TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  planned_start INTEGER NOT NULL,
  planned_end INTEGER NOT NULL,
  expected_minutes INTEGER NOT NULL CHECK(expected_minutes > 0),
  hourly_cents INTEGER NOT NULL CHECK(hourly_cents > 0),
  operator_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed','cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(planned_end > planned_start)
);
CREATE INDEX idx_orders_planned ON work_orders(planned_start, status);

ALTER TABLE jobs ADD COLUMN client_id TEXT REFERENCES clients(id);
ALTER TABLE jobs ADD COLUMN work_order_id TEXT REFERENCES work_orders(id);
ALTER TABLE jobs ADD COLUMN meter_mode TEXT NOT NULL DEFAULT 'timer' CHECK(meter_mode IN ('timer','digital','manual'));
ALTER TABLE jobs ADD COLUMN photo_requirement INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN deleted_at INTEGER;
ALTER TABLE jobs ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE job_pauses (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  CHECK(end_ts >= start_ts)
);
CREATE INDEX idx_job_pauses ON job_pauses(job_id);

CREATE TABLE job_photos (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  file_id TEXT NOT NULL REFERENCES files(id),
  phase TEXT NOT NULL CHECK(phase IN ('start','finish')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  UNIQUE(job_id,file_id)
);
CREATE INDEX idx_photos_job ON job_photos(job_id);

CREATE TABLE job_checks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  detail_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id),
  work_order_id TEXT REFERENCES work_orders(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  resolution TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_ticket_status ON tickets(status, created_at);
