import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedMachines,isFleetOwner,orderMachineRows,STARTER_MACHINE_ID} from '../src/machines.js';

const another='bcfa0430-771f-44f1-bc92-81124b915f0a';
function mock({owner='admin1',busy=null,conflict=null,second=true}={}){
 const machines=[
  {id:STARTER_MACHINE_ID,name:'MINI ESCAVADEIRA 1.500 TONELADAS',status:'available'},
  ...(second?[{id:another,name:'MINI 02',status:'available'}]:[])
 ];
 const sqls=[];
 const db={prepare(sql){
  return {bind(...args){
   sqls.push({sql,args});
   return {
    first:async()=>{
     if(sql.includes("FROM users WHERE role='admin'"))return {id:owner};
     if(sql.includes('SELECT * FROM machines WHERE id='))return machines.find(m=>m.id===args[0])||null;
     if(sql.includes('FROM jobs WHERE machine_id='))return busy&&args[0]===busy?{id:'job'}:null;
     if(sql.includes('SELECT wo.id FROM work_orders'))return conflict&&args[0]===conflict?{id:'order'}:null;
     return null;
    },
    all:async()=>({results:sql.includes("SELECT id FROM machines WHERE deleted_at")?machines.map(x=>({id:x.id})):[]}),
    run:async()=>({meta:{changes:1}})
   };
  }};
 }};
 return {env:{DB:db},sqls};
}
test('somente o primeiro administrador é proprietário da frota',async()=>{
 const {env}=mock();
 assert.equal(await isFleetOwner(env,{id:'admin1',role:'admin'}),true);
 assert.equal(await isFleetOwner(env,{id:'admin2',role:'admin'}),false);
 assert.equal(await isFleetOwner(env,{id:'operator',role:'operator'}),false);
});
test('seleciona duas máquinas únicas para mesma obra',async()=>{
 const {env}=mock();
 const result=await selectedMachines(env,[STARTER_MACHINE_ID,another],{requireIdle:true});
 assert.deepEqual(result.map(m=>m.id),[STARTER_MACHINE_ID,another]);
 assert.equal(result.length,2);
});
test('impede duas seleções da mesma máquina',async()=>{
 const {env}=mock();
 await assert.rejects(selectedMachines(env,[STARTER_MACHINE_ID,STARTER_MACHINE_ID]),/máquinas diferentes/);
});
test('uma máquina ocupada não bloqueia a outra',async()=>{
 const {env}=mock({busy:STARTER_MACHINE_ID});
 await assert.rejects(selectedMachines(env,[STARTER_MACHINE_ID],{requireIdle:true}),/já está em uma obra/);
 const available=await selectedMachines(env,[another],{requireIdle:true});
 assert.equal(available[0].id,another);
});
test('a mesma máquina não pode ser agendada em duas obras sobrepostas',async()=>{
 const {env}=mock({conflict:another});
 await assert.rejects(selectedMachines(env,[another],{start:1,end:3}),/já está agendada/);
 assert.equal((await selectedMachines(env,[STARTER_MACHINE_ID],{start:1,end:3})).length,1);
});
test('uma única máquina é selecionada automaticamente para instalações antigas',async()=>{
 const {env}=mock({second:false});
 assert.equal((await selectedMachines(env,null)).length,1);
});
