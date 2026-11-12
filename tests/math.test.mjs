import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentAmountCents, segmentDurationMs, maintenanceShares,summarizeJobs} from '../src/math.js';
test('15 minutos a R$100/h são R$25',()=>{
 assert.equal(segmentAmountCents([{start_ts:0,end_ts:15*60_000,hourly_cents:10_000}]),2500);
});
test('pausa não cobra e alteração de tarifa respeita corte',()=>{
 const a=[{start_ts:0,end_ts:3_600_000,hourly_cents:10000},{start_ts:7_200_000,end_ts:9_000_000,hourly_cents:12000}];
 assert.equal(segmentDurationMs(a),5_400_000);
 assert.equal(segmentAmountCents(a),16000);
});
test('segmento ativo usa horário atual',()=>{
 assert.equal(segmentAmountCents([{start_ts:0,end_ts:null,hourly_cents:10000}],1_800_000),5000);
});
test('gestor adiantou R$800, admin deve R$400',()=>{
 const x=maintenanceShares([{amount_cents:80000,payer_role:'manager'}]);
 assert.equal(x.admin_owes_manager_cents,40000);assert.equal(x.manager_share_cents,40000);
});
test('ajuste auditável soma às horas sem afetar segmentos',()=>{
 const x=summarizeJobs([{id:'1'}],[{job_id:'1',start_ts:0,end_ts:3600000,hourly_cents:10000}],[{job_id:'1',delta_ms:600000,delta_cents:1667}]);
 assert.equal(x[0].amount_cents,11667);assert.equal(x[0].duration_ms,4200000);
});
