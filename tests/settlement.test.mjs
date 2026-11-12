import test from 'node:test';
import assert from 'node:assert/strict';
import {settlementTotals} from '../src/settlement.js';
import {readFileSync} from 'node:fs';

const j=(cents)=>({amount_cents:cents});
const m=(cents,payer_role)=>({amount_cents:cents,payer_role});
const pay=(cents,status,deleted_at=null)=>({amount_cents:cents,status,deleted_at});

test('50% de horas e 50% manutenção paga pelo administrador, abate somente pagamento aprovado',()=>{
 const total=settlementTotals([j(100000)],[m(20000,'admin')],[pay(30000,'approved'),pay(18000,'pending')]);
 assert.equal(total.hours_share_cents,50000);
 assert.equal(total.maintenance_adjustment_cents,10000);
 assert.equal(total.paid_cents,30000);
 assert.equal(total.pending_cents,18000);
 assert.equal(total.balance_cents,30000);
 assert.equal(total.manager_owes_cents,30000);
});
test('manutenção paga pelo gestor é crédito no acerto',()=>{
 const total=settlementTotals([j(10000)],[m(8000,'manager')],[]);
 assert.equal(total.hours_share_cents,5000);
 assert.equal(total.maintenance_adjustment_cents,-4000);
 assert.equal(total.balance_cents,1000);
});
test('crédito pode ultrapassar a dívida, sem criar pagamento negativo',()=>{
 const total=settlementTotals([j(2000)],[m(10000,'manager')],[pay(1000,'approved')]);
 assert.equal(total.balance_cents,-5000);
 assert.equal(total.manager_owes_cents,0);
 assert.equal(total.manager_credit_cents,5000);
});
test('pagamento recusado, pendente e excluído não abate',()=>{
 const total=settlementTotals([j(10000)],[],[pay(1000,'rejected'),pay(1200,'pending'),pay(2000,'approved',Date.now()),pay(700,'approved')]);
 assert.equal(total.paid_cents,700);
 assert.equal(total.pending_cents,1200);
 assert.equal(total.manager_owes_cents,4300);
});
test('pagamentos antigos mantêm aprovado na migração, sem afetar histórico',()=>{
 const sql=readFileSync(new URL('../migrations/0006_payment_approvals.sql',import.meta.url),'utf8');
 assert.match(sql,/DEFAULT 'approved'/);
 assert.match(sql,/status IN \('pending','approved','rejected'\)/);
});
test('somente proprietário aprova no servidor e gerente deve anexar comprovante',()=>{
 const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(source,/if\(user\.role==='manager'\)assert\(fileId,'O comprovante é obrigatório/);
 assert.match(source,/assert\(await isFleetOwner\(env,user\),'Somente o administrador proprietário pode conferir os pagamentos/);
 assert.match(source,/status='pending' AND deleted_at IS NULL/);
});
