import test from 'node:test';
import assert from 'node:assert/strict';
import {manualTotals} from '../src/manual.js';

test('8h até 17h, 60 minutos de pausa: 8h e R$ 800',()=>{
 const t=manualTotals(0,9*3600000,60,null,10000);
 assert.deepEqual(t,{elapsed_minutes:540,pause_minutes:60,worked_minutes:480,amount_cents:80000});
});
test('horas digitadas prevalecem sobre cálculo automático',()=>{
 const t=manualTotals(0,9*3600000,30,'7.5',10000);
 assert.equal(t.worked_minutes,450);
 assert.equal(t.amount_cents,75000);
});
test('meia hora cobrada proporcionalmente',()=>{
 assert.equal(manualTotals(0,30*60000,0,'0.5',10000).amount_cents,5000);
});
test('não deixa cobrar pausa ou horas superiores ao período',()=>{
 assert.throws(()=>manualTotals(0,60*60000,60,null,10000),/Pausas/);
 assert.throws(()=>manualTotals(0,60*60000,15,'2',10000),/não superar/);
});
test('rejeita horários invertidos',()=>{
 assert.throws(()=>manualTotals(60000,0,0,null,10000),/Horários/);
});
