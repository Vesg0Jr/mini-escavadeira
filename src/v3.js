// Extensões da plataforma: clientes, agenda, apontamentos, fotos e ocorrências.
const uid=()=>crypto.randomUUID();
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const requireText=(v,label,max=240)=>clean(v,max)||fail(label+' obrigatório.');
const roles=(u,...allowed)=>{if(!allowed.includes(u.role))fail('Sem permissão.',403);};
const all=async (db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results||[];
const one=async (db,sql,...params)=>db.prepare(sql).bind(...params).first();
const goodDate=(value,label)=>{
 const val=clean(value,16);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val))fail(label+' deve conter data e hora.');
 const t=Date.parse(val+':00-03:00');
 if(!Number.isFinite(t)||new Date(t-10800000).toISOString().slice(0,16)!==val)fail(label+' inválido.');
 return t;
};
const meter=(value)=>value===undefined||value===null||String(value).trim()===''?null:((Number(value)>=0&&Number.isFinite(Number(value)))?Number(value):fail('Leitura do horímetro inválida.'));
const json= (value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const body=async request=>{if(!request.headers.get('content-type')?.includes('application/json'))fail('Envie dados JSON.');return request.json().catch(()=>fail('JSON inválido.'));};
async function audit(env,u,action,kind,entity,detail,at){await env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)').bind(uid(),u.id,action,kind,entity,JSON.stringify(detail||{}),at).run();}
async function ownedFile(env,user,fileId){
 const file=await one(env.DB,'SELECT * FROM files WHERE id=?',fileId);
 if(!file||!file.mime_type.startsWith('image/'))fail('Foto não encontrada ou inválida.',400);
 if(user.role==='operator'&&file.uploaded_by!==user.id)fail('Foto não pertence ao seu acesso.',403);
 return file;
}
const idIn=x=>/^[a-f0-9-]{36}$/.test(String(x||''))?x:fail('Identificador inválido.');
async function assignedOrder(env,user,orderId) {
 const x=await one(env.DB,'SELECT * FROM work_orders WHERE id=?',idIn(orderId));
 if(!x)fail('Obra agendada não encontrada.',404);
 if(user.role==='operator'&&x.operator_id&&x.operator_id!==user.id)fail('Obra atribuída a outro operador.',403);
 return x;
}
async function linkedJob(env,user,id){
 const x=await one(env.DB,'SELECT * FROM jobs WHERE id=? AND deleted_at IS NULL',idIn(id));
 if(!x)fail('Registro de obra não encontrado.',404);
 if(user.role==='operator'&&x.operator_id!==user.id)fail('Sem acesso a essa obra.',403);
 return x;
}
export async function v3State(env,user,base){
 const operator=user.role==='operator';
 const [clients,orders,tickets,pauses,photos,checks]=await Promise.all([
  all(env.DB,'SELECT id,name,phone,service,notes,created_at,updated_at FROM clients WHERE deleted_at IS NULL ORDER BY name'),
  operator?all(env.DB,"SELECT * FROM work_orders WHERE (operator_id=? OR operator_id IS NULL) ORDER BY planned_start",user.id):all(env.DB,'SELECT * FROM work_orders ORDER BY planned_start'),
  operator?all(env.DB,'SELECT * FROM tickets WHERE created_by=? ORDER BY created_at DESC',user.id):all(env.DB,'SELECT t.*,u.username AS reporter FROM tickets t JOIN users u ON u.id=t.created_by ORDER BY t.created_at DESC'),
  all(env.DB,'SELECT * FROM job_pauses ORDER BY start_ts ASC'),
  all(env.DB,'SELECT * FROM job_photos ORDER BY created_at ASC'),
  all(env.DB,'SELECT * FROM job_checks ORDER BY created_at ASC')
 ]);
 const permitted=new Set(base.jobs.map(x=>x.id));
 const relevantOrders=operator?orders:orders;
 const visible=operator?tickets.filter(x=>x.created_by===user.id):tickets;
 const mapped=base.jobs.map(j=>({...j,pauses:pauses.filter(p=>p.job_id===j.id),photos:photos.filter(p=>p.job_id===j.id),checks:checks.filter(p=>p.job_id===j.id)}));
 return {...base,jobs:mapped,clients,work_orders:relevantOrders,tickets:visible};
}
export function intervals(rows,now){
 if(!Array.isArray(rows)||rows.length<1||rows.length>30)fail('Informe de 1 a 30 períodos de motor ligado ou pausas.');
 const result=[];let lastEnd=null;let previous=null;let runCount=0;
 for(const row of rows){
  const kind=row.type;
  if(!['run','pause'].includes(kind))fail('Tipo de período inválido.');
  if(previous==='run'&&kind==='run')fail('Adicione a pausa entre dois períodos de motor ligado.');
  const start=goodDate(row.start_at,'Início do período'),end=goodDate(row.end_at,'Fim do período');
  if(end<=start||end-start>24*3600000)fail('Cada intervalo precisa ter início anterior ao fim e no máximo 24 horas.');
  if(lastEnd!==null&&start!==lastEnd)fail('Preencha o intervalo inteiro, sem lacunas ou sobreposições. Adicione uma pausa para o tempo desligado.');
  if(end>now+300000)fail('Não é possível registrar horas futuras como trabalhadas.');
  const reason=kind==='pause'?requireText(row.reason,'Motivo da pausa',350):'';
  if(kind==='run')runCount++;
  result.push({kind,start,end,reason});lastEnd=end;previous=kind;
 }
 if(rows[0].type!=='run'||rows[rows.length-1].type!=='run'||!runCount)fail('A jornada deve começar e terminar com o motor ligado.');
 if(lastEnd-result[0].start>72*3600000)fail('Jornada maior que 72 horas. Divida em obras separadas.');
 return result;
}
export function splitRates(intervals,history){
 if(!history.length)fail('A tarifa da máquina não está configurada.',503);
 const segments=[];
 for(const x of intervals.filter(x=>x.kind==='run')){
  const changes=history.filter(r=>r.effective_at>x.start&&r.effective_at<x.end);
  const ends=[...changes.map(r=>r.effective_at),x.end];let start=x.start;
  for(const end of ends){
   const rate=history.filter(r=>r.effective_at<=start).at(-1)||history[0];
   segments.push({start,end,rate_id:rate.id,cents:rate.amount_cents});
   start=end;
  }
 }
 return segments;
}
export async function v3Route(request,env,user,at){
 const path=new URL(request.url).pathname,method=request.method;
 if(path==='/api/v3/quick-start'&&method==='POST'){
  // Um único envio: o operador pode cadastrar o cliente e iniciar sem agenda prévia.
  const b=await body(request);
  const scheduled=b.start_timing==='scheduled';
  const now=b.start_timing==='now'||b.start_timing===undefined||b.start_timing==='';
  if(!scheduled&&!now)fail('Selecione iniciar agora ou programar.',400);
  let client=null,clientId=b.client_id||null,addClient=false;
  if(clientId){
   client=await one(env.DB,'SELECT * FROM clients WHERE id=? AND deleted_at IS NULL',idIn(clientId));
   if(!client)fail('Cliente não encontrado.',404);
  }else{
   const name=requireText(b.client_name,'Nome do cliente',130),
     phone=requireText(b.client_phone,'Telefone',30),
     service=requireText(b.client_service,'Serviço do cliente',200);
   if(phone.replace(/\D/g,'').length<10)fail('Digite o telefone com DDD.',400);
   clientId=uid();addClient=true;
   client={id:clientId,name,phone,service};
  }
  const title=requireText(b.title,'Nome da obra',130),
    service=clean(b.service,200)||client.service,
    location=clean(b.location,240),notes=clean(b.notes,700);
  const hourly=await one(env.DB,'SELECT * FROM rates ORDER BY effective_at DESC,id DESC LIMIT 1');
  if(!hourly)fail('Configure o valor da hora antes de iniciar.',503);
  const mode=b.mode==='digital'?'digital':'timer',initial=meter(b.start_meter);
  const picture=b.start_file_id?idIn(b.start_file_id):null;
  if(picture)await ownedFile(env,user,picture);
  let start=at,end=at+3600000,minutes=60;
  if(scheduled){
   start=goodDate(b.planned_start,'Início programado');
   end=goodDate(b.planned_end,'Fim programado');
   minutes=b.expected_hours!==undefined&&String(b.expected_hours).trim()!==''?Math.round(Number(b.expected_hours)*60):Math.round((end-start)/60000);
   if(start<at-300000||end<=start||end-start>72*3600000||!Number.isInteger(minutes)||minutes<1||minutes>4320)fail('Confira a data de agendamento e as horas previstas.');
   const collision=await one(env.DB,"SELECT id FROM work_orders WHERE status='scheduled' AND planned_start<? AND planned_end>? LIMIT 1",end,start);
   if(collision)fail('Já existe uma obra agendada nesse horário.',409);
  }else{
   const active=await one(env.DB,"SELECT id FROM jobs WHERE status!='finished' AND deleted_at IS NULL LIMIT 1");
   if(active)fail('Já existe uma obra em execução. Encerre antes de iniciar outra.',409);
  }
  const orderId=uid(),jobId=uid(),operatorId=user.id;
  const operations=[];
  if(addClient)operations.push(env.DB.prepare('INSERT INTO clients(id,name,phone,service,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(client.id,client.name,client.phone,client.service,'Cadastrado durante início rápido',user.id,at,at));
  operations.push(env.DB.prepare("INSERT INTO work_orders(id,client_id,title,service,location,planned_start,planned_end,expected_minutes,hourly_cents,operator_id,status,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,? ,?,?,?,?,?)")
   .bind(orderId,clientId,title,service,location,start,end,minutes,hourly.amount_cents,operatorId,scheduled?'scheduled':'in_progress',notes,user.id,at,at));
  if(!scheduled){
   operations.push(env.DB.prepare("INSERT INTO jobs(id,customer,location,description,operator_id,status,start_meter,start_file_id,started_at,created_by,updated_at,client_id,work_order_id,meter_mode,photo_requirement) VALUES(?,?,?,?,?,'running',?,?,?,?,?,?,?,?,1)")
     .bind(jobId,client.name,location,service,operatorId,initial,picture,at,user.id,at,clientId,orderId,mode));
   operations.push(env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,hourly_cents,rate_id) VALUES(?,?,?,?,?)')
     .bind(uid(),jobId,at,hourly.amount_cents,hourly.id));
   if(picture)operations.push(env.DB.prepare("INSERT INTO job_photos(id,job_id,file_id,phase,created_by,created_at) VALUES(?,?,?,'start',?,?)")
     .bind(uid(),jobId,picture,user.id,at));
  }
  operations.push(env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(uid(),user.id,scheduled?'quick_schedule':'quick_start','work_order',orderId,JSON.stringify({client_id:clientId,client_created:addClient,job_id:scheduled?null:jobId}),at));
  await env.DB.batch(operations);
  return json({ok:true,client_id:clientId,work_order_id:orderId,job_id:scheduled?null:jobId,scheduled},201);
 }
 if(path==='/api/v3/manual-quick'&&method==='POST'){
  // Registro manual iniciado pelo botão principal, sem exigir agendamento prévio.
  const b=await body(request);
  let client=null,clientId=b.client_id||null,newClient=false;
  if(clientId){
   client=await one(env.DB,'SELECT * FROM clients WHERE id=? AND deleted_at IS NULL',idIn(clientId));
   if(!client)fail('Selecione um cliente existente.',404);
  }else{
   const name=requireText(b.client_name,'Nome do cliente',130);
   const phone=requireText(b.client_phone,'Telefone',30);
   const service=requireText(b.client_service,'Serviço',200);
   if(phone.replace(/\D/g,'').length<10)fail('Informe telefone com DDD.');
   clientId=uid();newClient=true;client={id:clientId,name,phone,service};
  }
  const title=requireText(b.title,'Nome da obra',130);
  const service=clean(b.service,200)||client.service;
  const location=clean(b.location,240),notes=clean(b.notes,700);
  const rows=intervals(b.rows,at),start=rows[0].start,end=rows.at(-1).end;
  const conflict=await one(env.DB,"SELECT id FROM jobs WHERE deleted_at IS NULL AND started_at<? AND (finished_at IS NULL OR finished_at>?) LIMIT 1",end,start);
  if(conflict)fail('Já existe uma obra registrada no mesmo horário.',409);
  const images=b.photo_ids;
  if(!Array.isArray(images)||new Set(images).size<3||images.length<3||images.length>12)fail('Para encerrar, anexe pelo menos 3 fotos diferentes.');
  for(const photo of images)await ownedFile(env,user,idIn(photo));
  const history=await all(env.DB,'SELECT * FROM rates ORDER BY effective_at ASC,id ASC');
  const segments=splitRates(rows,history);
  const initial=meter(b.start_meter),final=meter(b.end_meter);
  if(initial!==null&&final!==null&&final<initial)fail('Leitura final menor que inicial.');
  const minutes=segments.reduce((sum,x)=>sum+(x.end-x.start)/60000,0);
  const pauseMinutes=rows.filter(x=>x.kind==='pause').reduce((sum,x)=>sum+(x.end-x.start)/60000,0);
  const orderId=uid(),jobId=uid();
  const ops=[];
  if(newClient)ops.push(env.DB.prepare('INSERT INTO clients(id,name,phone,service,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(clientId,client.name,client.phone,client.service,'Cadastrado durante lançamento manual',user.id,at,at));
  ops.push(env.DB.prepare("INSERT INTO work_orders(id,client_id,title,service,location,planned_start,planned_end,expected_minutes,hourly_cents,operator_id,status,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'completed',?,?,?,?)")
   .bind(orderId,clientId,title,service,location,start,end,Math.round(minutes),segments[0].cents,user.id,notes,user.id,at,at));
  ops.push(env.DB.prepare("INSERT INTO jobs(id,customer,location,description,operator_id,status,start_meter,end_meter,start_file_id,end_file_id,started_at,finished_at,created_by,updated_at,entry_mode,manual_pause_minutes,client_id,work_order_id,meter_mode,photo_requirement) VALUES(?,?,?,?,?,'finished',?,?,?,?,?,?,?,?,'manual',?,?,?,? ,1)")
   .bind(jobId,client.name,location,service,user.id,initial,final,null,images[0],start,end,user.id,at,Math.round(pauseMinutes),clientId,orderId,'manual'));
  for(const x of segments)ops.push(env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,end_ts,hourly_cents,rate_id) VALUES(?,?,?,?,?,?)')
    .bind(uid(),jobId,x.start,x.end,x.cents,x.rate_id));
  for(const x of rows.filter(x=>x.kind==='pause'))ops.push(env.DB.prepare('INSERT INTO job_pauses(id,job_id,start_ts,end_ts,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(uid(),jobId,x.start,x.end,x.reason,user.id,at));
  for(const photo of images)ops.push(env.DB.prepare("INSERT INTO job_photos(id,job_id,file_id,phase,created_by,created_at) VALUES(?,?,?,'finish',?,?)")
    .bind(uid(),jobId,photo,user.id,at));
  ops.push(env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
   .bind(uid(),user.id,'quick_manual','job',jobId,JSON.stringify({client_id:clientId,client_created:newClient,order_id:orderId,minutes,pause_minutes:pauseMinutes}),at));
  await env.DB.batch(ops);
  const amount=Math.round(segments.reduce((sum,x)=>sum+(x.end-x.start)*x.cents/3600000,0));
  return json({ok:true,id:jobId,worked_minutes:minutes,amount_cents:amount},201);
 }
 if(path==='/api/v3/clients'&&method==='POST'){
  roles(user,'admin','manager','operator');const b=await body(request);
  const name=requireText(b.name,'Nome do cliente',130),phone=requireText(b.phone,'Telefone',30),service=requireText(b.service,'Serviço',200);
  if(phone.replace(/\D/g,'').length<10)fail('Telefone precisa ter DDD e número.');
  const id=uid();await env.DB.prepare('INSERT INTO clients(id,name,phone,service,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
   .bind(id,name,phone,service,clean(b.notes,700),user.id,at,at).run();
  await audit(env,user,'create','client',id,{name},at);return json({ok:true,id},201);
 }
 const clientMatch=path.match(/^\/api\/v3\/clients\/([a-f0-9-]{36})$/);
 if(clientMatch&&(method==='PUT'||method==='DELETE')){
  roles(user,'admin','manager');const id=clientMatch[1];
  const c=await one(env.DB,'SELECT * FROM clients WHERE id=? AND deleted_at IS NULL',id);
  if(!c)fail('Cliente não encontrado.',404);
  if(method==='DELETE'){
   roles(user,'admin');
   const active=await one(env.DB,"SELECT 1 FROM work_orders WHERE client_id=? AND status IN ('scheduled','in_progress') LIMIT 1",id);
   if(active)fail('Cancele as obras pendentes antes de excluir o cliente.',409);
   await env.DB.prepare('UPDATE clients SET deleted_at=?,updated_at=? WHERE id=?').bind(at,at,id).run();
   await audit(env,user,'delete','client',id,{name:c.name},at);return json({ok:true});
  }
  const b=await body(request),name=requireText(b.name,'Nome',130),phone=requireText(b.phone,'Telefone',30),service=requireText(b.service,'Serviço',200);
  if(phone.replace(/\D/g,'').length<10)fail('Telefone inválido.');
  await env.DB.prepare('UPDATE clients SET name=?,phone=?,service=?,notes=?,updated_at=? WHERE id=?').bind(name,phone,service,clean(b.notes,700),at,id).run();
  await audit(env,user,'update','client',id,{name,phone},at);return json({ok:true});
 }
 if(path==='/api/v3/orders'&&method==='POST'){
  roles(user,'admin','manager');const b=await body(request);
  const client=await one(env.DB,'SELECT * FROM clients WHERE id=? AND deleted_at IS NULL',idIn(b.client_id));
  if(!client)fail('Selecione um cliente cadastrado.',400);
  const start=goodDate(b.planned_start,'Início agendado'),end=goodDate(b.planned_end,'Fim agendado');
  if(end<=start||end-start>72*3600000)fail('A previsão precisa ter duração entre 1 minuto e 72 horas.');
  const planned=Number(b.expected_hours);
  const minutes=b.expected_hours!==''&&b.expected_hours!==undefined?Math.round(planned*60):Math.round((end-start)/60000);
  if(!Number.isInteger(minutes)||minutes<1||minutes>72*60)fail('Horas previstas inválidas.');
  const assigned=b.operator_id? idIn(b.operator_id):null;
  if(assigned){
   const op=await one(env.DB,'SELECT id FROM users WHERE id=? AND active=1',assigned);
   if(!op)fail('Operador não encontrado.');
  }
  if(start<at-300000)fail('A data programada já passou. Escolha uma data futura.');
  const conflict=await one(env.DB,"SELECT id FROM work_orders WHERE status='scheduled' AND planned_start<? AND planned_end>? LIMIT 1",end,start);
  if(conflict&&b.allow_overlap!==true)fail('Já existe uma obra agendada nesse período. Ajuste o horário.',409);
  const tariff=await one(env.DB,'SELECT amount_cents FROM rates ORDER BY effective_at DESC,id DESC LIMIT 1');
  if(!tariff)fail('Tarifa não configurada.');
  const id=uid(),service=clean(b.service,200)||client.service;
  const title=requireText(b.title,'Nome da obra',130);
  await env.DB.prepare("INSERT INTO work_orders(id,client_id,title,service,location,planned_start,planned_end,expected_minutes,hourly_cents,operator_id,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,client.id,title,service,clean(b.location,240),start,end,minutes,tariff.amount_cents,assigned,clean(b.notes,700),user.id,at,at).run();
  await audit(env,user,'schedule','work_order',id,{client:client.name,start,end,expected_minutes:minutes,rate:tariff.amount_cents},at);
  return json({ok:true,id,expected_cents:Math.round(minutes*tariff.amount_cents/60)},201);
 }
 const orderMatch=path.match(/^\/api\/v3\/orders\/([a-f0-9-]{36})$/);
 if(orderMatch&&(method==='PUT'||method==='DELETE')){
  roles(user,'admin','manager');const id=orderMatch[1],old=await assignedOrder(env,user,id);
  if(old.status!=='scheduled')fail('Somente agendamentos ainda não iniciados podem ser alterados.',409);
  if(method==='DELETE'){
   await env.DB.prepare("UPDATE work_orders SET status='cancelled',updated_at=? WHERE id=?").bind(at,id).run();
   await audit(env,user,'cancel','work_order',id,{},at);return json({ok:true});
  }
  const b=await body(request),start=goodDate(b.planned_start,'Início'),end=goodDate(b.planned_end,'Fim');
  if(end<=start||end-start>72*3600000)fail('Horários inválidos.');
  if(start<at-300000)fail('Escolha uma data futura para reagendar.');
  const hours=Number(b.expected_hours),minutes=Math.round(hours*60);
  if(!Number.isFinite(hours)||minutes<1||minutes>4320)fail('Horas previstas inválidas.');
  const op=b.operator_id?idIn(b.operator_id):null;
  if(op&&!await one(env.DB,'SELECT id FROM users WHERE id=? AND active=1',op))fail('Operador inválido.');
  await env.DB.prepare('UPDATE work_orders SET title=?,service=?,location=?,planned_start=?,planned_end=?,expected_minutes=?,operator_id=?,notes=?,updated_at=? WHERE id=?')
   .bind(requireText(b.title,'Nome da obra',130),requireText(b.service,'Serviço',200),clean(b.location,240),start,end,minutes,op,clean(b.notes,700),at,id).run();
  await audit(env,user,'reschedule','work_order',id,{start,end,minutes},at);return json({ok:true});
 }
 if(path==='/api/v3/start'&&method==='POST'){
  const b=await body(request),order=await assignedOrder(env,user,b.work_order_id);
  if(order.status!=='scheduled')fail('Esta obra não está disponível para iniciar.',409);
  const existing=await one(env.DB,"SELECT id FROM jobs WHERE status!='finished' AND deleted_at IS NULL LIMIT 1");
  if(existing)fail('Há uma máquina em operação. Encerre a obra anterior primeiro.',409);
  const client=await one(env.DB,'SELECT * FROM clients WHERE id=?',order.client_id);
  const owner=user.role==='operator'?user.id:order.operator_id||user.id;
  if(user.role==='operator'&&order.operator_id&&order.operator_id!==user.id)fail('Obra de outro operador.',403);
  const mode=b.mode==='digital'?'digital':'timer';
  const initial=meter(b.start_meter);
  const photo=b.start_file_id? idIn(b.start_file_id):null;
  if(photo)await ownedFile(env,user,photo);
  const tariff=await one(env.DB,'SELECT * FROM rates ORDER BY effective_at DESC,id DESC LIMIT 1');
  if(!tariff)fail('Tarifa não encontrada.',503);
  const id=uid();
  await env.DB.batch([
   env.DB.prepare("INSERT INTO jobs(id,customer,location,description,operator_id,status,start_meter,start_file_id,started_at,created_by,updated_at,client_id,work_order_id,meter_mode,photo_requirement) VALUES(?,?,?,?,?,'running',?,?,?,?,?,?,?,?,1)")
     .bind(id,client.name,order.location,order.service,owner,initial,photo,at,user.id,at,client.id,order.id,mode),
   env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,hourly_cents,rate_id) VALUES(?,?,?,?,?)').bind(uid(),id,at,tariff.amount_cents,tariff.id),
   env.DB.prepare("UPDATE work_orders SET status='in_progress',updated_at=? WHERE id=?").bind(at,order.id)
  ]);
  if(photo)await env.DB.prepare("INSERT INTO job_photos(id,job_id,file_id,phase,created_by,created_at) VALUES(?,?,?,'start',?,?)").bind(uid(),id,photo,user.id,at).run();
  await audit(env,user,'start','job',id,{order_id:order.id,mode},at);
  return json({ok:true,id},201);
 }
 if(path==='/api/v3/manual'&&method==='POST'){
  const b=await body(request),order=await assignedOrder(env,user,b.work_order_id);
  if(order.status!=='scheduled')fail('Obra já iniciada, encerrada ou cancelada.',409);
  const rows=intervals(b.rows,at),start=rows[0].start,end=rows.at(-1).end;
  const conflict=await one(env.DB,"SELECT id FROM jobs WHERE deleted_at IS NULL AND started_at<? AND (finished_at IS NULL OR finished_at>?) LIMIT 1",end,start);
  if(conflict)fail('Já há outra obra com horários sobrepostos.',409);
  const images=b.photo_ids;
  if(!Array.isArray(images)||new Set(images).size<3||images.length<3||images.length>12)fail('Anexe pelo menos 3 fotos diferentes para finalizar a obra.');
  for(const id of images)await ownedFile(env,user,idIn(id));
  const history=await all(env.DB,'SELECT * FROM rates ORDER BY effective_at ASC,id ASC');
  const segs=splitRates(rows,history),initial=meter(b.start_meter),final=meter(b.end_meter);
  if(initial!==null&&final!==null&&final<initial)fail('Leitura final menor que inicial.');
  const cli=await one(env.DB,'SELECT * FROM clients WHERE id=?',order.client_id);
  const owner=user.role==='operator'?user.id:order.operator_id||user.id,id=uid();
  const inputs=[
   env.DB.prepare("INSERT INTO jobs(id,customer,location,description,operator_id,status,start_meter,end_meter,start_file_id,end_file_id,started_at,finished_at,created_by,updated_at,entry_mode,manual_pause_minutes,client_id,work_order_id,meter_mode,photo_requirement) VALUES(?,?,?,?,?,'finished',?,?,?,?,?,?,?,?, 'manual',?,?,?,?,1)")
   .bind(id,cli.name,order.location,order.service,owner,initial,final,null,images[0],start,end,user.id,at,
     rows.filter(r=>r.kind==='pause').reduce((sum,r)=>sum+(r.end-r.start)/60000,0),cli.id,order.id,'manual'),
   env.DB.prepare("UPDATE work_orders SET status='completed',updated_at=? WHERE id=?").bind(at,order.id)
  ];
  for(const seg of segs)inputs.push(env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,end_ts,hourly_cents,rate_id) VALUES(?,?,?,?,?,?)').bind(uid(),id,seg.start,seg.end,seg.cents,seg.rate_id));
  for(const pause of rows.filter(r=>r.kind==='pause'))inputs.push(env.DB.prepare('INSERT INTO job_pauses(id,job_id,start_ts,end_ts,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(uid(),id,pause.start,pause.end,pause.reason,user.id,at));
  for(const img of images)inputs.push(env.DB.prepare("INSERT INTO job_photos(id,job_id,file_id,phase,created_by,created_at) VALUES(?,?,?,'finish',?,?)").bind(uid(),id,img,user.id,at));
  await env.DB.batch(inputs);
  const minutes=segs.reduce((sum,r)=>sum+(r.end-r.start)/60000,0),amount=Math.round(segs.reduce((sum,r)=>sum+(r.end-r.start)*r.cents/3600000,0));
  await audit(env,user,'manual_timeline','job',id,{order_id:order.id,minutes,pause_minutes:(end-start)/60000-minutes,amount_cents:amount},at);
  return json({ok:true,id,worked_minutes:minutes,amount_cents:amount},201);
 }
 const motor=path.match(/^\/api\/v3\/jobs\/([a-f0-9-]{36})\/(pause|resume)$/);
 if(motor&&method==='POST'){
  const job=await linkedJob(env,user,motor[1]),action=motor[2];
  if(action==='pause'){
   if(job.status!=='running')fail('O motor já está desligado.',409);
   const b=await body(request),reason=requireText(b.reason,'Motivo da pausa',350);
   await env.DB.batch([
    env.DB.prepare('UPDATE work_segments SET end_ts=? WHERE job_id=? AND end_ts IS NULL').bind(at,job.id),
    env.DB.prepare("UPDATE jobs SET status='paused',updated_at=? WHERE id=?").bind(at,job.id),
    env.DB.prepare('INSERT INTO job_checks(id,job_id,detail_json,created_by,created_at) VALUES(?,?,?,?,?)').bind(uid(),job.id,JSON.stringify({kind:'pause',reason,start_ts:at}),user.id,at)
   ]);
   await audit(env,user,'pause','job',job.id,{reason},at);
   return json({ok:true});
  }
  if(job.status!=='paused')fail('O motor precisa estar desligado para retomar.',409);
  const last=await one(env.DB,"SELECT * FROM job_checks WHERE job_id=? AND detail_json LIKE '%\"kind\":\"pause\"%' ORDER BY created_at DESC LIMIT 1",job.id);
  const lastPeriod=await one(env.DB,'SELECT end_ts FROM work_segments WHERE job_id=? AND end_ts IS NOT NULL ORDER BY end_ts DESC LIMIT 1',job.id);
  let reason='Pausa operacional';
  if(last){try{reason=JSON.parse(last.detail_json)?.reason||reason}catch{}}
  const start=lastPeriod?.end_ts||at;
  const rate=await one(env.DB,'SELECT * FROM rates ORDER BY effective_at DESC,id DESC LIMIT 1');
  const queries=[
   env.DB.prepare("UPDATE jobs SET status='running',updated_at=? WHERE id=?").bind(at,job.id),
   env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,hourly_cents,rate_id) VALUES(?,?,?,?,?)').bind(uid(),job.id,at,rate.amount_cents,rate.id)
  ];
  if(at>start)queries.push(env.DB.prepare('INSERT INTO job_pauses(id,job_id,start_ts,end_ts,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(uid(),job.id,start,at,reason,user.id,at));
  await env.DB.batch(queries);
  await audit(env,user,'resume','job',job.id,{pause_minutes:Math.round((at-start)/60000)},at);
  return json({ok:true});
 }
 const finish=path.match(/^\/api\/v3\/jobs\/([a-f0-9-]{36})\/finish$/);
 if(finish&&method==='POST'){
  const job=await linkedJob(env,user,finish[1]),b=await body(request);
  if(job.status==='finished')fail('Obra já encerrada.',409);
  const images=b.photo_ids;
  if(!Array.isArray(images)||images.length<3||images.length>12||new Set(images).size!==images.length)fail('O encerramento exige no mínimo 3 fotos diferentes.');
  for(const file of images)await ownedFile(env,user,idIn(file));
  const final=meter(b.end_meter);
  if(final!==null&&job.start_meter!==null&&final<job.start_meter)fail('Leitura final menor que inicial.');
  const check=b.manual_review?JSON.stringify(b.manual_review):null;
  if(check&&check.length>4000)fail('Conferência manual muito extensa.');
  const updates=[
   env.DB.prepare('UPDATE work_segments SET end_ts=? WHERE job_id=? AND end_ts IS NULL').bind(at,job.id),
   env.DB.prepare("UPDATE jobs SET status='finished',end_meter=?,end_file_id=?,finished_at=?,updated_at=? WHERE id=?").bind(final,images[0],at,at,job.id)
  ];
  for(const file of images)updates.push(env.DB.prepare("INSERT OR IGNORE INTO job_photos(id,job_id,file_id,phase,created_by,created_at) VALUES(?,?,?,'finish',?,?)").bind(uid(),job.id,file,user.id,at));
  if(job.work_order_id)updates.push(env.DB.prepare("UPDATE work_orders SET status='completed',updated_at=? WHERE id=?").bind(at,job.work_order_id));
  if(check)updates.push(env.DB.prepare('INSERT INTO job_checks(id,job_id,detail_json,created_by,created_at) VALUES(?,?,?,?,?)').bind(uid(),job.id,check,user.id,at));
  await env.DB.batch(updates);
  await audit(env,user,'finish_photos','job',job.id,{photos:images.length,has_manual_review:!!check},at);
  return json({ok:true});
 }
 const adminJob=path.match(/^\/api\/v3\/jobs\/([a-f0-9-]{36})\/(reopen|delete)$/);
 if(adminJob&&method==='POST'){
  roles(user,'admin');const job=await linkedJob(env,user,adminJob[1]),action=adminJob[2];
  const b=await body(request),reason=requireText(b.reason,'Justificativa',350);
  if(action==='reopen'){
   if(job.status!=='finished')fail('Obra já está aberta.',409);
   const other=await one(env.DB,"SELECT id FROM jobs WHERE status!='finished' AND deleted_at IS NULL LIMIT 1");
   if(other)fail('Existe outra obra em andamento. Encerre antes de reabrir.',409);
   await env.DB.prepare("UPDATE jobs SET status='paused',finished_at=NULL,reopened_count=reopened_count+1,updated_at=? WHERE id=?").bind(at,job.id).run();
   if(job.work_order_id)await env.DB.prepare("UPDATE work_orders SET status='in_progress',updated_at=? WHERE id=?").bind(at,job.work_order_id).run();
  }else{
   if(job.status==='running')await env.DB.prepare('UPDATE work_segments SET end_ts=? WHERE job_id=? AND end_ts IS NULL').bind(at,job.id).run();
   await env.DB.prepare("UPDATE jobs SET status='finished',finished_at=COALESCE(finished_at,?),deleted_at=?,updated_at=? WHERE id=?").bind(at,at,at,job.id).run();
   if(job.work_order_id)await env.DB.prepare("UPDATE work_orders SET status='cancelled',updated_at=? WHERE id=?").bind(at,job.work_order_id).run();
  }
  await audit(env,user,action,'job',job.id,{reason},at);
  return json({ok:true});
 }
 if(path==='/api/v3/tickets'&&method==='POST'){
  const b=await body(request),subject=requireText(b.subject,'Assunto',130),description=requireText(b.description,'Descrição',1200);
  const jobId=b.job_id?idIn(b.job_id):null,orderId=b.work_order_id?idIn(b.work_order_id):null;
  if(jobId)await linkedJob(env,user,jobId);
  if(orderId)await assignedOrder(env,user,orderId);
  const id=uid();
  await env.DB.prepare('INSERT INTO tickets(id,job_id,work_order_id,subject,description,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
   .bind(id,jobId,orderId,subject,description,user.id,at,at).run();
  await audit(env,user,'ticket_open','ticket',id,{subject,jobId,orderId},at);return json({ok:true,id},201);
 }
 const ticket=path.match(/^\/api\/v3\/tickets\/([a-f0-9-]{36})\/resolve$/);
 if(ticket&&method==='POST'){
  roles(user,'admin','manager');const b=await body(request),resolution=requireText(b.resolution,'Solução',700);
  const t=await one(env.DB,'SELECT * FROM tickets WHERE id=?',ticket[1]);
  if(!t)fail('Chamado inexistente.',404);
  await env.DB.prepare("UPDATE tickets SET status='resolved',resolution=?,updated_at=? WHERE id=?").bind(resolution,at,t.id).run();
  await audit(env,user,'ticket_resolve','ticket',t.id,{resolution},at);return json({ok:true});
 }
 return null;
}
