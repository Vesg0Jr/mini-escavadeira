import test from 'node:test';
import assert from 'node:assert/strict';
import {intervals,splitRates} from '../src/v3.js';

const dt=(time)=>'2026-11-10T'+time;
const rows=[
 {type:'run',start_at:dt('08:00'),end_at:dt('12:00')},
 {type:'pause',start_at:dt('12:00'),end_at:dt('13:00'),reason:'Almoço'},
 {type:'pause',start_at:dt('13:00'),end_at:dt('13:10'),reason:'Abastecimento'},
 {type:'run',start_at:dt('13:10'),end_at:dt('18:00')}
];
const now=Date.parse(dt('19:00')+':00-03:00');

test('duas pausas consecutivas ficam registradas e não são faturadas',()=>{
 const p=intervals(rows,now);
 const minutes=p.filter(x=>x.kind==='run').reduce((v,x)=>v+(x.end-x.start)/60000,0);
 assert.equal(minutes,530);
 assert.equal(p.filter(x=>x.kind==='pause').length,2);
 assert.equal(p.filter(x=>x.kind==='pause').map(x=>x.reason).join(','),'Almoço,Abastecimento');
});
test('a tarifa da hora é proporcional e preserva mudanças históricas',()=>{
 const p=intervals(rows,now);
 const base=Date.parse(dt('07:00')+':00-03:00');
 const rateChange=Date.parse(dt('13:00')+':00-03:00');
 const segs=splitRates(p,[{id:1,effective_at:base,amount_cents:10000},{id:2,effective_at:rateChange,amount_cents:12000}]);
 const sum=Math.round(segs.reduce((n,s)=>n+(s.end-s.start)*s.cents/3600000,0));
 assert.equal(sum,98000);
});
test('horários sobrepostos ou pausas sem motivo são bloqueados',()=>{
 assert.throws(()=>intervals([{...rows[0]}, {...rows[1],reason:''},...rows.slice(2)],now),/Motivo/);
 assert.throws(()=>intervals([{...rows[0]}, {...rows[1],start_at:dt('11:30')},...rows.slice(2)],now),/sem lacunas/);
});
test('não permite cobrar motor ligado no futuro',()=>{
 assert.throws(()=>intervals([{type:'run',start_at:dt('20:00'),end_at:dt('23:00')}],now),/horas futuras/);
});
