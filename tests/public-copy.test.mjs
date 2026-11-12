import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const features=readFileSync(new URL('../public/features.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');

test('login e recuperação não exibem serviços e parâmetros técnicos',()=>{
 const publicUi=app+'\n'+features;
 for(const expression of [
  /Cloudflare/i,/\bD1\b/,/\bR2\b/,/ADMIN_SETUP_KEY/,/ADMIN_RECOVERY_KEY/,
  /Secret ADMIN/i,/migrações aplicadas/i,/consulte os logs/i,
  /gerar código seguro/i,/v3-generate-code/
 ])assert.doesNotMatch(publicUi,expression);
});

test('mensagens de falha são adequadas a usuários',()=>{
 assert.match(app,/Não foi possível abrir o sistema/);
 assert.match(api,/Serviço temporariamente indisponível/);
 assert.doesNotMatch(api,/return error\('Falha interna ao processar a solicitação\. Consulte os logs\.'/);
});

test('recuperação continua permitindo código e nova senha',()=>{
 assert.match(features,/name="recovery_code"/);
 assert.match(features,/name="new_password"/);
 assert.match(features,/\/recover-password/);
 assert.doesNotMatch(features,/name="username" value="admin\.geral"/);
});
