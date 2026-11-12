#!/usr/bin/env node
// Teste não destrutivo do site publicado. Não cria usuários nem altera dados.
const raw = process.env.SMOKE_URL || process.argv[2];
if (!raw) {
  console.error('Uso: node scripts/smoke-test.mjs https://SEU-WORKER.workers.dev');
  process.exit(2);
}
let base;
try {
  const parsed = new URL(raw);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Protocolo inválido');
  base = parsed.origin;
} catch {
  console.error('URL inválida: informe o endereço do Worker.');
  process.exit(2);
}
const checks = [
  { name: 'API health + bindings D1 e R2', path: '/api/health',
    validate: (response, body) => response.status === 200 && body?.ok === true },
  { name: 'Migração inicial do D1 / bootstrap', path: '/api/bootstrap',
    validate: (response, body) => response.status === 200 && typeof body?.needs_setup === 'boolean' },
  { name: 'Site inicial', path: '/',
    validate: (response, body) => response.status === 200 && typeof body === 'string' && body.includes('MiniGestão') },
  { name: 'JavaScript da interface', path: '/app.js',
    validate: (response, body) => response.status === 200 && typeof body === 'string' && body.length > 1000 },
  { name: 'CSS da interface', path: '/styles.css',
    validate: (response, body) => response.status === 200 && typeof body === 'string' && body.length > 1000 },
  { name: 'Agenda e cadastros (JavaScript)', path: '/features.js',
    validate: (response, body) => response.status === 200 && typeof body === 'string' && body.includes('v3Calendar') && body.includes('v3Clients') },
  { name: 'Menu responsivo (CSS)', path: '/features.css',
    validate: (response, body) => response.status === 200 && typeof body === 'string' && body.includes('v3-burger') },
  { name: 'Logo FormaCerta', path: '/formacerta.svg',
    validate: (response, body) => response.status === 200 && typeof body === 'string' && body.includes('FormaCerta') },
  { name: 'Proteção sem login', path: '/api/state',
    validate: (response, body) => response.status === 401 && typeof body?.error === 'string' }
];
let failures = 0;
for (const check of checks) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(base + check.path, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Accept': check.path.startsWith('/api/') ? 'application/json' : '*/*' }
      });
    } finally { clearTimeout(timeout); }
    const text = await response.text();
    let body = text;
    if (check.path.startsWith('/api/')) {
      try { body = JSON.parse(text); } catch { body = null; }
    }
    const ok = check.validate(response, body);
    console.log((ok ? 'PASSOU' : 'FALHOU') + ' - ' + check.name + ' (HTTP ' + response.status + ')');
    if (!ok) {
      failures++;
      console.error('  Trecho da resposta: ' + text.slice(0, 220).replace(/\s+/g, ' '));
    }
  } catch (err) {
    failures++;
    console.error('FALHOU - ' + check.name + ': ' + err.message);
  }
}
console.log('Resultado: ' + (checks.length - failures) + '/' + checks.length + ' verificações aprovadas.');
process.exitCode = failures ? 1 : 0;
