-- Cada pagamento enviado pelo gestor aguarda conferência do proprietário.
-- Pagamentos históricos continuam aprovados para preservar os valores anteriores.
ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
  CHECK(status IN ('pending','approved','rejected'));
ALTER TABLE payments ADD COLUMN reviewed_by TEXT REFERENCES users(id);
ALTER TABLE payments ADD COLUMN reviewed_at INTEGER;
ALTER TABLE payments ADD COLUMN review_notes TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_payments_review ON payments(status,created_at);
