-- Códigos de recuperação de senha: apenas hash, expiração e uso único.
-- Nenhuma senha ou código em texto puro é armazenado no D1.
CREATE TABLE password_reset_tokens (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL,
 used_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_password_reset_user_expiry ON password_reset_tokens(user_id,expires_at);
