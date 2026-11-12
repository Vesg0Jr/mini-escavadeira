-- V5: múltiplas máquinas vinculadas às obras e controle de horas individual.
CREATE TABLE machines (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  machine_type TEXT NOT NULL DEFAULT 'Mini escavadeira',
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','maintenance','inactive')),
  initial_meter REAL CHECK(initial_meter IS NULL OR initial_meter >= 0),
  photo_file_id TEXT REFERENCES files(id),
  photo_path TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_machines_active ON machines(status,deleted_at);

CREATE TABLE work_order_machines (
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  machine_id TEXT NOT NULL REFERENCES machines(id),
  added_at INTEGER NOT NULL,
  added_by TEXT REFERENCES users(id),
  PRIMARY KEY(work_order_id,machine_id)
);
CREATE INDEX idx_order_machines_machine ON work_order_machines(machine_id,work_order_id);

INSERT INTO machines(id,code,name,machine_type,status,photo_path,notes,created_at,updated_at)
VALUES('2f78cb86-9c4d-4e30-81a5-19bc394148d0','MINI-01',
 'MINI ESCAVADEIRA 1.500 TONELADAS','Mini escavadeira','available',
 '/machines/mini-01.webp','Máquina inicial cadastrada no FormaCerta',strftime('%s','now')*1000,strftime('%s','now')*1000);

ALTER TABLE jobs ADD COLUMN machine_id TEXT REFERENCES machines(id);
UPDATE jobs SET machine_id='2f78cb86-9c4d-4e30-81a5-19bc394148d0' WHERE machine_id IS NULL;

INSERT OR IGNORE INTO work_order_machines(work_order_id,machine_id,added_at)
SELECT id,'2f78cb86-9c4d-4e30-81a5-19bc394148d0',created_at FROM work_orders;

DROP INDEX IF EXISTS idx_single_open_job;
CREATE UNIQUE INDEX idx_machine_open_job
 ON jobs(machine_id) WHERE machine_id IS NOT NULL AND status!='finished' AND deleted_at IS NULL;
CREATE INDEX idx_jobs_machine_started ON jobs(machine_id,started_at);

-- Jornada individual por máquina numa mesma obra; evita duas sessões abertas da mesma máquina na obra.
CREATE UNIQUE INDEX idx_order_machine_open_job
 ON jobs(work_order_id,machine_id) WHERE status!='finished' AND deleted_at IS NULL AND work_order_id IS NOT NULL AND machine_id IS NOT NULL;
