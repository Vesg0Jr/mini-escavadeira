import test from 'node:test';
import assert from 'node:assert/strict';
import {settlementTotals} from '../src/settlement.js';
import {readFileSync} from 'node:fs';

const j=(cents)=>({amount_cents:cents});
const m=(cents,payer_role)=>({amount_cents:cents,payer_role});
const pay=(cents,status,deleted_at=null)=>({amount_cents:cents,status,deleted_at});

test('valor integral da locação é devido por Renan, só manutenção é 50/50; abate pagamento aprovado',()=>{
 const total=settlementTotals([j(100000)],[m(20000,'admin')],[pay(30000,'approved'),pay(18000,'pending')]);
 assert.equal(total.hours_share_cents,100000);
 assert.equal(total.rental_due_cents,100000);
 assert.equal(total.maintenance_adjustment_cents,10000);
 assert.equal(total.paid_cents,30000);
 assert.equal(total.pending_cents,18000);
 assert.equal(total.balance_cents,80000);
 assert.equal(total.manager_owes_cents,80000);
});
test('manutenção paga pelo gestor é crédito no acerto',()=>{
 const total=settlementTotals([j(10000)],[m(8000,'manager')],[]);
 assert.equal(total.hours_share_cents,10000);
 assert.equal(total.maintenance_adjustment_cents,-4000);
 assert.equal(total.balance_cents,6000);
});
test('crédito pode ultrapassar a dívida, sem criar pagamento negativo',()=>{
 const total=settlementTotals([j(2000)],[m(10000,'manager')],[pay(4000,'approved')]);
 assert.equal(total.balance_cents,-7000);
 assert.equal(total.manager_owes_cents,0);
 assert.equal(total.manager_credit_cents,7000);
});
test('pagamento recusado, pendente e excluído não abate',()=>{
 const total=settlementTotals([j(10000)],[],[pay(1000,'rejected'),pay(1200,'pending'),pay(2000,'approved',Date.now()),pay(700,'approved')]);
 assert.equal(total.paid_cents,700);
 assert.equal(total.pending_cents,1200);
 assert.equal(total.manager_owes_cents,9300);
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

test('locação 14h a R$100/h gera R$1400 a receber, sem dividir por dois',()=>{
 const total=settlementTotals([j(140000)],[],[]);
 assert.equal(total.rental_due_cents,140000);
 assert.equal(total.manager_owes_cents,140000);
});
