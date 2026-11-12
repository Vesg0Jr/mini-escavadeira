import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto, createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {v3Route} from '../src/v3.js';
import {STARTER_MACHINE_ID} from '../src/machines.js';

globalThis.crypto ||= webcrypto;

function dbMock({client=null,active=null}={}){
 const sqlLog=[];
 const db={
  prepare(sql){
   return {
    bind(...args){return {first: async()=>{
      if(sql.includes('FROM clients'))return client;
      if(sql.includes('FROM rates'))return {id:1,amount_cents:10000};
      if(sql.includes('FROM machines WHERE id='))return {id:args[0],name:'Máquina de teste',status:'available'};
      if(sql.includes('FROM jobs WHERE machine_id='))return active;
      return null;
    },all:async()=>({results:[]}),run:async()=>({success:true})}},
    first: async()=>null
   };
  },
  batch:async statements=>{sqlLog.push(...statements);return statements.map(()=>({success:true}))}
 };
 return {db,sqlLog};
}
const user={id:'user-operator-test',role:'operator',name:'Operador'};
async function run(payload,config={}){
 const m=dbMock(config);
 const request=new Request('https://example.com/api/v3/quick-start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 return {...m, response:await v3Route(request,{DB:m.db},user,Date.now())};
}
test('operador inicia obra imediatamente e cadastra cliente na mesma ação',async()=>{
 const {response,sqlLog}=await run({client_name:'Cliente Teste',client_phone:'(32) 98888-7777',client_service:'Escavação',title:'Obra rápida',start_timing:'now',mode:'digital',machine_ids:[STARTER_MACHINE_ID]});
 assert.equal(response.status,201);
 const json=await response.json();
 assert.equal(json.ok,true);assert.equal(json.scheduled,false);
 assert.ok(sqlLog.length>=5);
});
test('operador escolhe cliente já cadastrado e inicia sem novo cadastro',async()=>{
 const client={id:'46b29c47-0460-4d35-891f-d9c27826e07c',name:'Cliente cadastrado',phone:'32999999999',service:'Terraplanagem'};
 const {response,sqlLog}=await run({client_id:client.id,title:'Escavação',start_timing:'now',machine_ids:[STARTER_MACHINE_ID]},{client});
 assert.equal(response.status,201);
 assert.equal(sqlLog.length,5);
});
test('uma obra pode iniciar duas máquinas com cronômetros e registros separados',async()=>{
 const other='00000000-0000-4000-8000-000000000002';
 const {response,sqlLog}=await run({
   client_name:'Duas máquinas',client_phone:'32999999999',client_service:'Escavação',
   title:'Obra com duas máquinas',start_timing:'now',mode:'digital',
   machine_ids:[STARTER_MACHINE_ID,other]
 });
 assert.equal(response.status,201);
 const data=await response.json();
 assert.equal(data.job_ids.length,2);
 assert.notEqual(data.job_ids[0],data.job_ids[1]);
 assert.equal(sqlLog.length,9); // cliente, obra, dois vínculos, dois jobs, dois segmentos, auditoria
});
test('operador pode programar uma obra futura sem ligar o motor',async()=>{
 const {response,sqlLog}=await run({client_name:'Cliente Programado',client_phone:'32999999999',client_service:'Escavação',title:'Obra agendada',start_timing:'scheduled',planned_start:'2099-01-15T08:00',planned_end:'2099-01-15T11:00',expected_hours:3,machine_ids:[STARTER_MACHINE_ID]});
 assert.equal(response.status,201);
 assert.equal((await response.json()).scheduled,true);
 assert.equal(sqlLog.length,4);
});
test('telefone incompleto é rejeitado e nada é gravado',async()=>{
 await assert.rejects(run({client_name:'Teste',client_phone:'123',client_service:'Obra',title:'Obra'}),/Digite o telefone/);
});
test('não permite ligar a máquina com outra obra aberta',async()=>{
 await assert.rejects(run({client_name:'Teste',client_phone:'32999999999',client_service:'Obra',title:'Obra',machine_ids:[STARTER_MACHINE_ID]},{active:{id:'busy'}}),/já está em uma obra/);
});
test('PNGs oficiais da marca permanecem íntegros',()=>{
 const assets=[
  ['public/formacerta-preto.png','d86558471fa2bcda478d365fe14c9084bb7be2b59cf699eaf33cdf29f95cc7f9'],
  ['public/formacerta-branco.png','4fe89a9c62b0672a938620346038e6a90c0be5eca18542f93790adba6bf54a73']
 ];
 for(const [path,expected] of assets)assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),expected);
});
