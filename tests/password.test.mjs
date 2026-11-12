import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {hashPassword, PBKDF2_ITERATIONS} from '../src/password.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test('PBKDF2 respeita limite de 100.000 iterações do Cloudflare Workers', () => {
  assert.equal(PBKDF2_ITERATIONS, 100000);
});

test('senha gera hash consistente com sal individual, sem armazenar senha pura', async () => {
  const hash = await hashPassword('Senha-de-teste!2026', 'sal-de-teste');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, 'Senha-de-teste!2026');
  assert.equal(hash, await hashPassword('Senha-de-teste!2026', 'sal-de-teste'));
  assert.notEqual(hash, await hashPassword('Senha-de-teste!2026', 'outro-sal'));
  assert.notEqual(hash, await hashPassword('Senha-diferente!2026', 'sal-de-teste'));
});
