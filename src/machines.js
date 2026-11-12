// Frota FormaCerta — máquinas exclusivas do proprietário e várias por obra.
const uid=()=>crypto.randomUUID();
const bad=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const str=(v,max=160)=>String(v??'').trim().slice(0,max);
const one=(db,sql,...values)=>db.prepare(sql).bind(...values).first();
const all=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results||[];
const ident=(v)=>/^[a-f0-9-]{36}$/i.test(String(v||''))?v:bad('Máquina inválida.');
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const body=async request=>{if(!request.headers.get('Content-Type')?.includes('application/json'))bad('Envie JSON.');return request.json().catch(()=>bad('JSON inválido.'));};
export const STARTER_MACHINE_ID='2f78cb86-9c4d-4e30-81a5-19bc394148d0';

export async function isFleetOwner(env,user) {
 if(user.role!=='admin')return false;
 const founder=await one(env.DB,"SELECT id FROM users WHERE role='admin' ORDER BY created_at,id LIMIT 1");
 return founder?.id===user.id;
}
async function ownerOnly(env,user){
 if(!await isFleetOwner(env,user))bad('Somente o administrador proprietário pode cadastrar, editar ou excluir máquinas.',403);
}
export async function machineState(env,user,base) {
 const [machines,links,owner]=await Promise.all([
  all(env.DB,`SELECT m.*,u.name AS created_by_name,
    (SELECT COUNT(*) FROM jobs j WHERE j.machine_id=m.id AND j.deleted_at IS NULL AND j.status!='finished') AS open_jobs,
    (SELECT COALESCE(SUM((SELECT COALESCE(SUM(MAX(0,COALESCE(s.end_ts,?)-s.start_ts)),0) FROM work_segments s WHERE s.job_id=j.id)),0)
      FROM jobs j WHERE j.machine_id=m.id AND j.deleted_at IS NULL) AS worked_ms
    FROM machines m LEFT JOIN users u ON u.id=m.created_by
    WHERE m.deleted_at IS NULL ORDER BY m.code`,Date.now()),
  all(env.DB,'SELECT work_order_id,machine_id FROM work_order_machines ORDER BY added_at'),
  isFleetOwner(env,user)
 ]);
 const ids=user.role==='operator'?new Set(base.work_orders?.map(o=>o.id)||[]):null;
 const orderMachines=ids?links.filter(x=>ids.has(x.work_order_id)):links;
 return {...base,machines:machines.map(m=>({...m,photo_path:m.photo_path==='/machines/mini-01.webp'?'/api/v4/machines/seed-photo':m.photo_path,open_jobs:Number(m.open_jobs||0),worked_ms:Number(m.worked_ms||0),
  availability:m.status==='available'?(Number(m.open_jobs)>0?'in_use':'available'):m.status})),
  order_machines:orderMachines,
  fleet_owner:owner};
}
export async function selectedMachines(env,provided,{start=null,end=null,excludeOrder=null,requireIdle=false}={}) {
 let ids;
 if(Array.isArray(provided)){ids=provided.map(ident);}
 else if(typeof provided==='string'&&provided)ids=[ident(provided)];
 else ids=[];
 if(ids.length===0) {
  const allAvailable=await all(env.DB,"SELECT id FROM machines WHERE deleted_at IS NULL AND status='available'");
  if(allAvailable.length!==1)bad('Escolha uma ou mais máquinas disponíveis.');
  ids=[allAvailable[0].id];
 }
 if(ids.length>25||new Set(ids).size!==ids.length)bad('Selecione máquinas diferentes (máximo de 25).');
 const selected=[];
 for(const id of ids){
  const m=await one(env.DB,'SELECT * FROM machines WHERE id=? AND deleted_at IS NULL',id);
  if(!m||m.status!=='available')bad('A máquina selecionada está inativa ou em manutenção.',409);
  if(requireIdle){
   const busy=await one(env.DB,"SELECT id FROM jobs WHERE machine_id=? AND status!='finished' AND deleted_at IS NULL LIMIT 1",id);
   if(busy)bad(m.name+' já está em uma obra. Escolha outra máquina.',409);
  }
  if(start!==null&&end!==null){
   const conflict=await one(env.DB,`SELECT wo.id FROM work_orders wo
      JOIN work_order_machines wm ON wm.work_order_id=wo.id
      WHERE wm.machine_id=? AND wo.status IN ('scheduled','in_progress')
       AND wo.planned_start<? AND wo.planned_end>?
       AND (? IS NULL OR wo.id!=?) LIMIT 1`,id,end,start,excludeOrder,excludeOrder);
   if(conflict)bad('A máquina '+m.name+' já está agendada neste horário.',409);
  }
  selected.push(m);
 }
 return selected;
}
export function orderMachineRows(db,orderId,machines,userId,at) {
 return machines.map(m=>db.prepare('INSERT INTO work_order_machines(work_order_id,machine_id,added_at,added_by) VALUES(?,?,?,?)')
    .bind(orderId,m.id,at,userId));
}
export async function assignedMachine(env,orderId,machineId) {
 const id=ident(machineId);
 const m=await one(env.DB,`SELECT m.* FROM machines m
   JOIN work_order_machines wm ON wm.machine_id=m.id
   WHERE wm.work_order_id=? AND m.id=? AND m.deleted_at IS NULL AND m.status='available'`,orderId,id);
 if(!m)bad('Selecione uma máquina vinculada e disponível nesta obra.',409);
 const already=await one(env.DB,`SELECT id FROM jobs
   WHERE machine_id=? AND status!='finished' AND deleted_at IS NULL LIMIT 1`,id);
 if(already)bad('Esta máquina já está em operação.',409);
 return m;
}
export async function updateOrderStatus(env,orderId,at) {
 if(!orderId)return;
 // Concluída só quando todas as máquinas alocadas tiveram sua jornada registrada e encerrada.
 const result=await one(env.DB,`SELECT
   (SELECT COUNT(*) FROM work_order_machines WHERE work_order_id=?) AS assigned,
   (SELECT COUNT(DISTINCT machine_id) FROM jobs WHERE work_order_id=? AND deleted_at IS NULL AND status='finished') AS finished,
   (SELECT COUNT(*) FROM jobs WHERE work_order_id=? AND deleted_at IS NULL AND status!='finished') AS active,
   (SELECT COUNT(*) FROM jobs WHERE work_order_id=? AND deleted_at IS NULL) AS total`,orderId,orderId,orderId,orderId);
 const status=result.active>0?'in_progress':
   result.assigned>0&&result.finished>=result.assigned?'completed':
   result.total>0?'in_progress':'scheduled';
 await env.DB.prepare("UPDATE work_orders SET status=?,updated_at=? WHERE id=? AND status!='cancelled'").bind(status,at,orderId).run();
 return status;
}
export async function machineRoutes(request,env,user,at) {
 const path=new URL(request.url).pathname,method=request.method;
 if(path==='/api/v4/machines/seed-photo'&&method==='GET'){
  const obj=await env.FILES.get('machines/mini-01.webp');
  if(!obj)return new Response(null,{status:404});
  return new Response(obj.body,{status:200,headers:{'Content-Type':'image/webp','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
 }
 if(path==='/api/v4/machines'&&method==='POST'){
  await ownerOnly(env,user);const b=await body(request);
  const name=str(b.name,140),code=str(b.code,40).toUpperCase(),machine_type=str(b.machine_type||'Mini escavadeira',120);
  if(!name||!/^[A-Z0-9._-]{2,40}$/.test(code))bad('Informe o nome e um código válido da máquina.');
  if(!['available','maintenance','inactive'].includes(b.status||'available'))bad('Status inválido.');
  const photoFile=b.photo_file_id?ident(b.photo_file_id):null;
  if(photoFile){
   const photo=await one(env.DB,'SELECT mime_type FROM files WHERE id=?',photoFile);
   if(!photo||!photo.mime_type.startsWith('image/'))bad('Envie uma foto válida.');
  }
  const initial=b.initial_meter===null||b.initial_meter===''||b.initial_meter===undefined?null:Number(b.initial_meter);
  if(initial!==null&&(!Number.isFinite(initial)||initial<0))bad('Horímetro inicial inválido.');
  const id=uid();
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO machines(id,code,name,machine_type,status,initial_meter,photo_file_id,notes,created_by,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
     .bind(id,code,name,machine_type,b.status||'available',initial,photoFile,str(b.notes,1000),user.id,at,at),
   env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
     .bind(uid(),user.id,'create','machine',id,JSON.stringify({name,code,status:b.status||'available'}),at)
  ]);
  return json({ok:true,id},201);
 }
 const match=path.match(/^\/api\/v4\/machines\/([0-9a-f-]{36})$/);
 if(match&&(method==='PUT'||method==='DELETE')){
  await ownerOnly(env,user);const id=ident(match[1]);
  const m=await one(env.DB,'SELECT * FROM machines WHERE id=? AND deleted_at IS NULL',id);
  if(!m)bad('Máquina não encontrada.',404);
  const busy=await one(env.DB,`SELECT 1 FROM jobs WHERE machine_id=? AND deleted_at IS NULL AND status!='finished' LIMIT 1`,id);
  const booked=await one(env.DB,`SELECT 1 FROM work_orders wo
    JOIN work_order_machines wm ON wm.work_order_id=wo.id
    WHERE wm.machine_id=? AND wo.status IN ('scheduled','in_progress') LIMIT 1`,id);
  if(method==='DELETE'){
   if(busy||booked)bad('Máquina vinculada a uma obra aberta ou agendada. Encerre/reagende antes de excluir.',409);
   await env.DB.prepare('UPDATE machines SET deleted_at=?,status=?,updated_at=? WHERE id=?').bind(at,'inactive',at,id).run();
   await env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
     .bind(uid(),user.id,'delete','machine',id,JSON.stringify({name:m.name}),at).run();
   return json({ok:true});
  }
  const b=await body(request);
  const name=str(b.name,140),code=str(b.code,40).toUpperCase(),type=str(b.machine_type||'Mini escavadeira',120),status=b.status||'available';
  if(!name||!/^[A-Z0-9._-]{2,40}$/.test(code))bad('Nome ou código inválido.');
  if(!['available','maintenance','inactive'].includes(status))bad('Status inválido.');
  if((busy||booked)&&status!=='available')bad('Desvincule a máquina das obras abertas e agendadas antes de mudar seu status.',409);
  const photoId=b.photo_file_id?ident(b.photo_file_id):null;
  if(photoId){
   const photo=await one(env.DB,'SELECT mime_type FROM files WHERE id=?',photoId);
   if(!photo||!photo.mime_type.startsWith('image/'))bad('Foto inválida.');
  }
  const initial=b.initial_meter===null||b.initial_meter===''||b.initial_meter===undefined?null:Number(b.initial_meter);
  if(initial!==null&&(!Number.isFinite(initial)||initial<0))bad('Horímetro inválido.');
  await env.DB.batch([
   env.DB.prepare('UPDATE machines SET name=?,code=?,machine_type=?,status=?,initial_meter=?,photo_file_id=?,notes=?,updated_at=? WHERE id=?')
    .bind(name,code,type,status,initial,photoId||m.photo_file_id,str(b.notes,1000),at,id),
   env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(uid(),user.id,'update','machine',id,JSON.stringify({name,code,status}),at)
  ]);
  return json({ok:true});
 }
 return null;
}
