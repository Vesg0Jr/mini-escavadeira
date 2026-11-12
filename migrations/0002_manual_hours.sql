-- Permite leituras/fotos opcionais e registra obras lançadas manualmente.
-- Preserva os IDs das obras existentes e suas referências em work_segments/ajustes.
PRAGMA defer_foreign_keys = ON;

-- Salvamos as tabelas-filhas porque DROP TABLE jobs registra uma violação
-- temporária mesmo com defer_foreign_keys=ON se houver linhas referenciadas.
CREATE TABLE _backup_work_segments_0002 AS SELECT * FROM work_segments;
CREATE TABLE _backup_job_adjustments_0002 AS SELECT * FROM job_adjustments;
DELETE FROM work_segments;
DELETE FROM job_adjustments;

CREATE TABLE jobs_new (
  id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  operator_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('running','paused','finished')),
  start_meter REAL CHECK(start_meter IS NULL OR start_meter >= 0),
  end_meter REAL CHECK(end_meter IS NULL OR end_meter >= 0),
  start_file_id TEXT REFERENCES files(id),
  end_file_id TEXT REFERENCES files(id),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL,
  entry_mode TEXT NOT NULL DEFAULT 'timer' CHECK(entry_mode IN ('timer','manual')),
  manual_pause_minutes INTEGER NOT NULL DEFAULT 0 CHECK(manual_pause_minutes >= 0),
  manual_override_minutes INTEGER CHECK(manual_override_minutes IS NULL OR manual_override_minutes > 0),
  CHECK(start_meter IS NULL OR end_meter IS NULL OR end_meter >= start_meter)
);

INSERT INTO jobs_new (
  id,customer,location,description,operator_id,status,start_meter,end_meter,
  start_file_id,end_file_id,started_at,finished_at,created_by,updated_at
)
SELECT id,customer,location,description,operator_id,status,start_meter,end_meter,
  start_file_id,end_file_id,started_at,finished_at,created_by,updated_at FROM jobs;

DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
INSERT INTO work_segments SELECT * FROM _backup_work_segments_0002;
INSERT INTO job_adjustments SELECT * FROM _backup_job_adjustments_0002;
DROP TABLE _backup_work_segments_0002;
DROP TABLE _backup_job_adjustments_0002;
CREATE UNIQUE INDEX idx_single_open_job ON jobs((1)) WHERE status != 'finished';
CREATE INDEX idx_jobs_started ON jobs(started_at);
