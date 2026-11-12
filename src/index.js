import {segmentAmountCents,segmentDurationMs,maintenanceShares,summarizeJobs} from './math.js';
import {hashPassword} from './password.js';
import {manualTotals} from './manual.js';
import {v3State,v3Route} from './v3.js';

const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const LOGIN_DAYS = 14;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const COOKIE = 'mini_sess';
const error = (msg,status=400) => new Response(JSON.stringify({error:msg}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const json = (data,status=200,extra={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
const id = () => crypto.randomUUID();
const nowMs = () => Date.now();
const text = (value,max=240) => String(value??'').trim().slice(0,max);
const requireString = (value,label,max=240) => {const v=text(value,max);if(!v)throw new HttpError(`${label} é obrigatório.`);return v;};
const amountCents = (v) => {const n=Number(v);if(!Number.isFinite(n)||n<=0||n>1000000)throw new HttpError('Valor inválido.');return Math.round(n*100);};
const nonNegative = (v,label) => {const n=Number(v);if(!Number.isFinite(n)||n<0||n>10000000)throw new HttpError(`${label} inválido.`);return n;};
const optionalMeter = (v,label) => v===null||v===undefined||String(v).trim()==='' ? null : nonNegative(v,label);
function brasiliaDateTime(v,label){
 const raw=String(v??'').trim();
 assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw),label+' deve ter data e hora.');
 const ms=Date.parse(raw+':00-03:00');
 assert(Number.isFinite(ms)&&new Date(ms-3*3600000).toISOString().slice(0,16)===raw,label+' inválido.');
 return ms;
}
const dateValue = (v) => {const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(new Date(s+'T12:00:00Z').getTime()))throw new HttpError('Data inválida.');return s;};
const safeDate = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
class HttpError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function assert(condition,msg,status=400){if(!condition)throw new HttpError(msg,status);}
async function sha256(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function sameOrigin(request){const origin=request.headers.get('Origin');if(origin && origin!==new URL(request.url).origin)throw new HttpError('Origem não autorizada.',403);}
async function bodyJson(request){if(!request.headers.get('Content-Type')?.includes('application/json'))throw new HttpError('Envie JSON.');try{return await request.json();}catch{throw new HttpError('JSON inválido.');}}
function validatePassword(p){assert(typeof p==='string'&&p.length>=10&&p.length<=128,'Senha deve ter de 10 a 128 caracteres.');return p;}
function publicUser(u){return {id:u.id,name:u.name,username:u.username,role:u.role,active:!!u.active,created_at:u.created_at};}
async function auth(request,env){
 const val=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!val||!/^[-\w]{30,}$/.test(val))return null;
 const hash=await sha256(val);
 const user=await env.DB.prepare(`SELECT u.* FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).bind(hash,nowMs()).first();
 return user||null;
}
async function issueSession(env,u){
 const token=`${id().replaceAll('-','')}${id().replaceAll('-','')}`;
 await env.DB.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await sha256(token),u.id,nowMs()+DAY_MS*LOGIN_DAYS,nowMs()).run();
 return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAY_MS*LOGIN_DAYS/1000}`;
}
function requireRole(user,...roles){assert(user&&roles.includes(user.role),'Sem permissão para esta ação.',403);}
async function log(env,u,action,type,entity,details={}) {
 return env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
  .bind(id(),u.id,action,type,entity,JSON.stringify(details),nowMs()).run();
}
async function firstRate(env){return await env.DB.prepare('SELECT * FROM rates ORDER BY effective_at DESC,id DESC LIMIT 1').first();}
async function checkFile(env,fileId,user){
 const f=await env.DB.prepare('SELECT * FROM files WHERE id=?').bind(fileId).first();
 assert(f,'Arquivo inexistente.',404);
 assert(user.role!=='operator'||f.uploaded_by===user.id,'Arquivo sem permissão.',403);
 return f;
}
async function fetchAll(db,query,...args){return (await db.prepare(query).bind(...args).all()).results||[];}
async function getJob(env,jobId,user){
 const job=await env.DB.prepare('SELECT * FROM jobs WHERE id=? AND deleted_at IS NULL').bind(jobId).first();
 assert(job,'Obra não encontrada.',404);
 assert(user.role!=='operator'||job.operator_id===user.id,'Sem acesso à obra.',403);
 return job;
}
function csv(rows,headers){
 const escape=(v)=>'"'+String(v??'').replaceAll('"','""')+'"';
 return '\ufeff'+[headers.map(([label])=>escape(label)).join(';'),...rows.map(row=>headers.map(([,key])=>escape(row[key])).join(';'))].join('\r\n');
}
function getDay(ms){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
function dateToMs(day){return Date.parse(day+'T03:00:00Z');}
function chartFor(jobs,days=7,at=nowMs()){
 const today=getDay(at);
 const first=dateToMs(today)-(days-1)*DAY_MS;
 const bars=Array.from({length:days},(_,i)=>({date:getDay(first+i*DAY_MS),ms:0,raw_cents:0}));
 for(const j of jobs)for(const s of j.segments){
   const a=s.start_ts;const b=s.end_ts??at;
   for(let i=0;i<days;i++){
    const start=first+i*DAY_MS, end=start+DAY_MS;
    const overlap=Math.max(0,Math.min(end,b)-Math.max(start,a));
    bars[i].ms+=overlap;
    bars[i].raw_cents+=overlap*s.hourly_cents/HOUR_MS;
   }
 }
 return bars.map(b=>({date:b.date,hours:+(b.ms/HOUR_MS).toFixed(2),amount_cents:Math.round(b.raw_cents)}));
}
async function state(env,user){
 const at=nowMs();const operator=user.role==='operator';
 const jobsRaw=operator
   ? await fetchAll(env.DB,'SELECT * FROM jobs WHERE operator_id=? AND deleted_at IS NULL ORDER BY started_at DESC',user.id)
   : await fetchAll(env.DB,'SELECT * FROM jobs WHERE deleted_at IS NULL ORDER BY started_at DESC');
 const ids=jobsRaw.map(x=>x.id);
 let segments=[],adjustments=[];
 if(ids.length){
  // Carregar todos; filtrar por chaves depois evita limite de placeholders SQLite.
  segments=await fetchAll(env.DB,'SELECT * FROM work_segments ORDER BY start_ts ASC');
  adjustments=await fetchAll(env.DB,'SELECT * FROM job_adjustments ORDER BY created_at ASC');
  if(operator){const permitted=new Set(ids);segments=segments.filter(s=>permitted.has(s.job_id));adjustments=adjustments.filter(s=>permitted.has(s.job_id));}
 }
 const jobs=summarizeJobs(jobsRaw,segments,adjustments,at);
 const rate=await firstRate(env);
 const base={me:publicUser(user),current_rate_cents:rate?.amount_cents||10000,server_now:at,jobs,chart:chartFor(jobs)};
 if(operator)return v3State(env,user,base);
 const [maintenance,payments,users]=await Promise.all([
   fetchAll(env.DB,'SELECT * FROM maintenance WHERE deleted_at IS NULL ORDER BY expense_date DESC, created_at DESC'),
   fetchAll(env.DB,'SELECT * FROM payments WHERE deleted_at IS NULL ORDER BY payment_date DESC, created_at DESC'),
   fetchAll(env.DB,'SELECT id,name,username,role,active,created_at FROM users ORDER BY created_at ASC')
 ]);
 const shares=maintenanceShares(maintenance);
 const totalCents=jobs.reduce((s,j)=>s+j.amount_cents,0);
 const totalMs=jobs.reduce((s,j)=>s+j.duration_ms,0);
 const paidCents=payments.reduce((s,p)=>s+p.amount_cents,0);
 const paidMinutes=payments.reduce((s,p)=>s+p.paid_minutes,0);
 const summary={total_ms:totalMs,earned_cents:totalCents,received_cents:paidCents,remaining_cents:totalCents-paidCents,paid_minutes:paidMinutes,unpaid_minutes:Math.max(0,Math.round(totalMs/60000)-paidMinutes),jobs_finished:jobs.filter(j=>j.status==='finished').length,maintenance:shares};
 const extras={maintenance,payments,users,summary};
 if(user.role==='admin')extras.audit=await fetchAll(env.DB,`SELECT a.*,u.name actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100`);
 return v3State(env,user,{...base,...extras});
}
async function uploadFile(request,env,user){
 const contentType=request.headers.get('Content-Type')||'';
 assert(contentType.includes('multipart/form-data'),'Envie um arquivo pelo formulário.');
 const length=Number(request.headers.get('Content-Length')||0);
 assert(length<=MAX_FILE_BYTES+4096,'Arquivo acima de 8 MB.',413);
 const data=await request.formData();
 const f=data.get('file');assert(f instanceof File,'Selecione um arquivo.');
 assert(f.size>0&&f.size<=MAX_FILE_BYTES,'Arquivo deve ter no máximo 8 MB.',413);
 const bytes=await f.arrayBuffer();const signature=new Uint8Array(bytes.slice(0,12));
 const signatureType=(signature[0]===0xff&&signature[1]===0xd8&&signature[2]===0xff)?'image/jpeg':
 (signature[0]===137&&signature[1]===80&&signature[2]===78&&signature[3]===71)?'image/png':
 (String.fromCharCode(...signature.slice(0,4))==='RIFF'&&String.fromCharCode(...signature.slice(8,12))==='WEBP')?'image/webp':
 (String.fromCharCode(...signature.slice(0,4))==='%PDF')?'application/pdf':null;
 assert(signatureType,'Apenas JPG, PNG, WEBP ou PDF são aceitos.');
 assert(user.role!=='operator'||signatureType!=='application/pdf','Operador pode anexar apenas fotos.');
 const fileId=id();const key=`uploads/${fileId}`;
 await env.FILES.put(key,bytes,{httpMetadata:{contentType:signatureType}});
 await env.DB.prepare('INSERT INTO files(id,r2_key,original_name,mime_type,size_bytes,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?)')
  .bind(fileId,key,text(f.name,180),signatureType,f.size,user.id,nowMs()).run();
 return json({id:fileId,url:`/api/files/${fileId}`,name:text(f.name,180)} ,201);
}
async function fileResponse(env,user,fileId){
 const f=await env.DB.prepare('SELECT * FROM files WHERE id=?').bind(fileId).first();assert(f,'Arquivo não encontrado.',404);
 if(user.role==='operator'){
  const ok=await env.DB.prepare(`SELECT 1 FROM jobs WHERE operator_id=? AND (start_file_id=? OR end_file_id=?) LIMIT 1`).bind(user.id,fileId,fileId).first();
  assert(f.uploaded_by===user.id||ok,'Sem acesso ao arquivo.',403);
 }
 const obj=await env.FILES.get(f.r2_key);assert(obj,'Arquivo não encontrado no armazenamento.',404);
 return new Response(obj.body,{headers:{'Content-Type':f.mime_type,'Content-Disposition':`inline; filename="arquivo-${f.id}.${f.mime_type==='application/pdf'?'pdf':f.mime_type==='image/png'?'png':f.mime_type==='image/webp'?'webp':'jpg'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
async function handler(request,env){
 if(!env.DB||!env.FILES)throw new HttpError('Configure os bindings D1 (DB) e R2 (FILES).',503);
 const url=new URL(request.url);const path=url.pathname;const method=request.method; const at=nowMs();
 if(method!=='GET'&&method!=='HEAD')sameOrigin(request);
 if(path==='/api/health'&&method==='GET')return json({ok:true,application:'Gestão Mini Escavadeira',version:'1.0.0'});
 if(path==='/api/bootstrap'&&method==='GET'){
  const count=await env.DB.prepare('SELECT COUNT(*) n FROM users').first();return json({needs_setup:count.n===0});
 }
 if(path==='/api/setup'&&method==='POST'){
  let stage='verificar cadastro inicial';
  try {
   const exists=await env.DB.prepare('SELECT COUNT(*) n FROM users').first();assert(exists.n===0,'O administrador já foi configurado.',403);
   stage='validar chave e formulário';
   const b=await bodyJson(request);assert(env.ADMIN_SETUP_KEY&&env.ADMIN_SETUP_KEY.length>=16,'Chave de instalação não configurada no Cloudflare.',503);assert(typeof b.setup_key==='string'&&b.setup_key===env.ADMIN_SETUP_KEY,'Chave de instalação incorreta.',403);const name=requireString(b.name,'Nome',100);const username=requireString(b.username,'Usuário',60).toLowerCase();validatePassword(b.password);
   assert(/^[a-z0-9._-]{3,60}$/.test(username),'Usuário deve usar letras, números, ponto, hífen ou sublinhado.');
   stage='proteger senha';
   const uId=id(),salt=id(),pass=await hashPassword(b.password,salt);
   stage='gravar usuário no banco D1';
   const res=await env.DB.prepare(`INSERT INTO users(id,name,username,role,password_hash,password_salt,active,created_at)
     SELECT ?,?,?,'admin',?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM users)`).bind(uId,name,username,pass,salt,at).run();
   assert(res.meta.changes===1,'O administrador já foi configurado.',409);
   stage='registrar tarifa inicial';
   await env.DB.prepare('INSERT INTO rates(amount_cents,effective_at,created_by) VALUES(10000,?,?)').bind(at,uId).run();
   stage='iniciar sessão';
   const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uId).first();
   return json({ok:true,me:publicUser(user)},201,{'Set-Cookie':await issueSession(env,user)});
  } catch (e) {
   if(e instanceof HttpError)throw e;
   console.error('Setup admin falhou na etapa:',stage,e);
   throw new HttpError('Falha durante a etapa: '+stage+'. Consulte os logs da Cloudflare.',500);
  }
 }
 if(path==='/api/login'&&method==='POST'){
  const b=await bodyJson(request);const username=text(b.username,60).toLowerCase();const password=String(b.password||'');
  const limit=await env.DB.prepare('SELECT * FROM login_limits WHERE username=?').bind(username).first();
  assert(!(limit&&limit.locked_until>at),'Muitas tentativas. Tente novamente em 15 minutos.',429);
  const user=await env.DB.prepare('SELECT * FROM users WHERE username=? AND active=1').bind(username).first();
  const good=user&&await hashPassword(password,user.password_salt)===user.password_hash;
  if(!good){
   const next=(limit&&at-limit.first_attempt_at<15*60000)?limit.attempts+1:1;
   const first=(limit&&at-limit.first_attempt_at<15*60000)?limit.first_attempt_at:at;
   await env.DB.prepare(`INSERT INTO login_limits(username,attempts,first_attempt_at,locked_until) VALUES(?,?,?,?)
      ON CONFLICT(username) DO UPDATE SET attempts=excluded.attempts,first_attempt_at=excluded.first_attempt_at,locked_until=excluded.locked_until`)
       .bind(username,next,first,next>=8?at+15*60000:0).run();
   throw new HttpError('Usuário ou senha incorretos.',401);
  }
  await env.DB.prepare('DELETE FROM login_limits WHERE username=?').bind(username).run();
  return json({ok:true,me:publicUser(user)},200,{'Set-Cookie':await issueSession(env,user)});
 }
 // Recuperação somente por código temporário de uso único emitido pelo administrador da infraestrutura.
 // A requisição é pública, mas requer um token aleatório forte, cujo hash está armazenado no D1.
 if(path==='/api/recover-password'&&method==='POST'){
  const b=await bodyJson(request);
  const username=text(b.username,60).toLowerCase();
  const token=String(b.recovery_code||'').trim().toLowerCase();
  assert(/^[a-f0-9]{64}$/.test(token),'Código de recuperação inválido ou expirado.',400);
  assert(/^[a-z0-9._-]{3,60}$/.test(username),'Código de recuperação inválido ou expirado.',400);
  validatePassword(b.new_password);
  assert(b.new_password===b.confirm_password,'As senhas não conferem.',400);
  const tokenHash=await sha256(token);
  const record=await env.DB.prepare(`SELECT t.user_id,u.username FROM password_reset_tokens t
    JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.used_at IS NULL
    AND t.expires_at>? AND u.username=? AND u.active=1`).bind(tokenHash,at,username).first();
  assert(record,'Código de recuperação inválido ou expirado.',400);
  const salt=id(),pass=await hashPassword(b.new_password,salt);
  const statements=[
   env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=? WHERE id=? AND EXISTS
      (SELECT 1 FROM password_reset_tokens WHERE token_hash=? AND user_id=? AND used_at IS NULL AND expires_at>?)`)
      .bind(pass,salt,record.user_id,tokenHash,record.user_id,at),
   env.DB.prepare('UPDATE password_reset_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL').bind(at,tokenHash),
   env.DB.prepare('DELETE FROM user_sessions WHERE user_id=?').bind(record.user_id),
   env.DB.prepare('DELETE FROM login_limits WHERE username=?').bind(username),
   env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(id(),record.user_id,'password_recovered','user',record.user_id,JSON.stringify({method:'one_time_token'}),at)
  ];
  const results=await env.DB.batch(statements);
  assert(results[0].meta.changes===1&&results[1].meta.changes===1,'Código de recuperação já utilizado.',409);
  return json({ok:true,message:'Senha redefinida. Entre com sua nova senha.'});
 }
 const user=await auth(request,env);assert(user,'Faça login para continuar.',401);
 if(path==='/api/logout'&&method==='POST'){
  const token=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(token)await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash=?').bind(await sha256(token)).run();
  return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`});
 }
 if(path==='/api/state'&&method==='GET')return json(await state(env,user));
 if(path==='/api/me/password'&&method==='POST'){
  const b=await bodyJson(request);
  const current=String(b.current_password||'');
  validatePassword(b.new_password);
  assert(b.new_password===b.confirm_password,'As senhas não conferem.');
  const valid=await hashPassword(current,user.password_salt)===user.password_hash;
  assert(valid,'Senha atual incorreta.',403);
  assert(current!==b.new_password,'Escolha uma senha diferente da atual.');
  const salt=id(),pass=await hashPassword(b.new_password,salt);
  await env.DB.batch([
   env.DB.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').bind(pass,salt,user.id),
   env.DB.prepare('DELETE FROM user_sessions WHERE user_id=?').bind(user.id),
   env.DB.prepare('DELETE FROM login_limits WHERE username=?').bind(user.username),
   env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(id(),user.id,'password_changed','user',user.id,JSON.stringify({method:'current_password'}),at)
  ]);
  return json({ok:true,message:'Senha alterada. Entre novamente.'},200,{
   'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  });
 }

 if(method==='POST'&&(path==='/api/jobs'||path==='/api/jobs/manual'))throw new HttpError('Use o novo fluxo com cliente e obra cadastrados no Calendário. O apontamento manual está em Operação.',409);
 const v3Response=await v3Route(request,env,user,at);
 if(v3Response)return v3Response;
 if(path==='/api/upload'&&method==='POST')return uploadFile(request,env,user);
 const matchFile=path.match(/^\/api\/files\/([a-f0-9-]{36})$/);
 if(matchFile&&method==='GET')return fileResponse(env,user,matchFile[1]);
 if(path==='/api/jobs/manual'&&method==='POST'){
  const b=await bodyJson(request);
  const customer=requireString(b.customer,'Cliente / obra',130);
  const location=text(b.location,240),description=text(b.description,1200);
  const operatorId=user.role==='operator'?user.id:requireString(b.operator_id,'Responsável',40);
  const operator=await env.DB.prepare('SELECT id FROM users WHERE id=? AND role=? AND active=1').bind(operatorId,'operator').first();
  const own=operatorId===user.id&&user.role!=='operator';
  assert(operator||own,'Selecione um operador válido.');
  const startMs=brasiliaDateTime(b.start_at,'Hora inicial');
  const endMs=brasiliaDateTime(b.end_at,'Hora final');
  assert(endMs<=at+5*60000,'A hora final não pode estar no futuro.');
  const startMeter=optionalMeter(b.start_meter,'Horímetro inicial'),endMeter=optionalMeter(b.end_meter,'Horímetro final');
  assert(startMeter===null||endMeter===null||endMeter>=startMeter,'Horímetro final menor que inicial.');
  const fileId=b.start_file_id?requireString(b.start_file_id,'Anexo',60):null;
  if(fileId){const f=await checkFile(env,fileId,user);assert(f.mime_type.startsWith('image/'),'Use uma imagem como anexo da obra.');}
  const existing=await env.DB.prepare('SELECT id FROM jobs WHERE started_at < ? AND (finished_at IS NULL OR finished_at > ?) LIMIT 1').bind(endMs,startMs).first();
  assert(!existing,'Já existe uma obra registrada nesse intervalo. Confira o histórico para não duplicar a cobrança.',409);
  const rate=await env.DB.prepare('SELECT * FROM rates WHERE effective_at <= ? ORDER BY effective_at DESC, id DESC LIMIT 1').bind(startMs).first() ||
    await env.DB.prepare('SELECT * FROM rates ORDER BY effective_at ASC,id ASC LIMIT 1').first();
  assert(rate,'Configure a tarifa antes de registrar.',503);
  let totals;
  try{totals=manualTotals(startMs,endMs,b.pause_minutes??0,b.manual_hours,rate.amount_cents)}
  catch(e){throw new HttpError(e.message)}
  const manualOverride=b.manual_hours!==null&&b.manual_hours!==undefined&&String(b.manual_hours).trim()!==''?totals.worked_minutes:null;
  const jobId=id();
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO jobs(id,customer,location,description,operator_id,status,start_meter,end_meter,start_file_id,started_at,finished_at,created_by,updated_at,entry_mode,manual_pause_minutes,manual_override_minutes)
    VALUES(?,?,?,?,?,'finished',?,?,?,?,?,?,?,'manual',?,?)`).bind(jobId,customer,location,description,operatorId,startMeter,endMeter,fileId,startMs,endMs,user.id,at,totals.pause_minutes,manualOverride),
   env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,end_ts,hourly_cents,rate_id) VALUES(?,?,?,?,?,?)')
     .bind(id(),jobId,startMs,startMs+totals.worked_minutes*60000,rate.amount_cents,rate.id),
   env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)')
     .bind(id(),user.id,'register_manual_hours','job',jobId,JSON.stringify({start_at:startMs,end_at:endMs,pause_minutes:totals.pause_minutes,worked_minutes:totals.worked_minutes,manual_override:manualOverride!==null,rate_cents:rate.amount_cents,amount_cents:totals.amount_cents}),at)
  ]);
  return json({ok:true,id:jobId,worked_minutes:totals.worked_minutes,amount_cents:totals.amount_cents},201);
 }
 if(path==='/api/jobs'&&method==='POST'){
  const b=await bodyJson(request);const customer=requireString(b.customer,'Cliente',130);
  const location=text(b.location,240),description=text(b.description,1200);
  const operatorId=user.role==='operator'?user.id:requireString(b.operator_id,'Operador',40);
  const op=await env.DB.prepare('SELECT id FROM users WHERE id=? AND role=? AND active=1').bind(operatorId,'operator').first();
  // Admin/gestor podem registrar obra operando pessoalmente, por meio do próprio usuário.
  const ownRole=operatorId===user.id&&user.role!=='operator';
  assert(op||ownRole,'Selecione um operador válido.');
  const startMeter=optionalMeter(b.start_meter,'Horímetro inicial');
  const fileId=b.start_file_id?requireString(b.start_file_id,'Foto inicial',60):null;
  if(fileId){const f=await checkFile(env,fileId,user);assert(f.mime_type.startsWith('image/'),'A foto inicial precisa ser uma imagem.');}
  const existing=await env.DB.prepare(`SELECT 1 FROM jobs WHERE status!='finished' LIMIT 1`).first();
  assert(!existing,'Já existe uma obra aberta. Pause, retome ou encerre antes de iniciar outra.',409);
  const rate=await firstRate(env);assert(rate,'Configure a tarifa antes de iniciar.',503);
  const jobId=id(),segId=id();
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO jobs(id,customer,location,description,operator_id,status,start_meter,start_file_id,started_at,created_by,updated_at) VALUES(?,?,?,?,?,'running',?,?,?,?,?)`).bind(jobId,customer,location,description,operatorId,startMeter,fileId,at,user.id,at),
   env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,hourly_cents,rate_id) VALUES(?,?,?,?,?)').bind(segId,jobId,at,rate.amount_cents,rate.id),
   env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)').bind(id(),user.id,'start','job',jobId,JSON.stringify({start_meter:startMeter,rate_cents:rate.amount_cents}),at)
  ]);
  return json({ok:true,id:jobId},201);
 }
 const jobAction=path.match(/^\/api\/jobs\/([a-f0-9-]{36})\/(pause|resume|finish|adjust)$/);
 if(jobAction&&method==='POST'){
  const job=await getJob(env,jobAction[1],user),action=jobAction[2];const b=action==='finish'||action==='adjust'?await bodyJson(request):{};
  if(action==='pause'){
   assert(job.status==='running','A máquina não está ligada.',409);
   await env.DB.batch([
    env.DB.prepare('UPDATE work_segments SET end_ts=? WHERE job_id=? AND end_ts IS NULL').bind(at,job.id),
    env.DB.prepare(`UPDATE jobs SET status='paused',updated_at=? WHERE id=?`).bind(at,job.id)
   ]);await log(env,user,'pause','job',job.id);return json({ok:true});
  }
  if(action==='resume'){
   assert(job.status==='paused','A máquina não está pausada.',409);
   const rate=await firstRate(env);
   await env.DB.batch([
    env.DB.prepare(`UPDATE jobs SET status='running',updated_at=? WHERE id=?`).bind(at,job.id),
    env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,hourly_cents,rate_id) VALUES(?,?,?,?,?)').bind(id(),job.id,at,rate.amount_cents,rate.id)
   ]);await log(env,user,'resume','job',job.id,{rate_cents:rate.amount_cents});return json({ok:true});
  }
  if(action==='finish'){
   assert(job.status!=='finished','Obra já encerrada.',409);
   assert(!job.photo_requirement,'Finalize esta obra pelo formulário de 3 fotos.',409);
   const endMeter=optionalMeter(b.end_meter,'Horímetro final');
   assert(endMeter===null||job.start_meter===null||endMeter>=job.start_meter,'Horímetro final não pode ser menor que o inicial.');
   const fId=b.end_file_id?requireString(b.end_file_id,'Foto final',60):null;
   if(fId){const f=await checkFile(env,fId,user);assert(f.mime_type.startsWith('image/'),'Foto final deve ser uma imagem.');}
   await env.DB.batch([
    env.DB.prepare('UPDATE work_segments SET end_ts=? WHERE job_id=? AND end_ts IS NULL').bind(at,job.id),
    env.DB.prepare(`UPDATE jobs SET status='finished',end_meter=?,end_file_id=?,finished_at=?,updated_at=? WHERE id=?`).bind(endMeter,fId,at,at,job.id)
   ]);await log(env,user,'finish','job',job.id,{end_meter:endMeter});return json({ok:true});
  }
  if(action==='adjust'){
   requireRole(user,'admin');const minutes=Number(b.delta_minutes);assert(Number.isInteger(minutes)&&minutes!==0&&Math.abs(minutes)<100000,'Informe minutos positivos ou negativos.');
   const reason=requireString(b.reason,'Justificativa',500);
   const initial=await env.DB.prepare('SELECT hourly_cents FROM work_segments WHERE job_id=? ORDER BY start_ts ASC LIMIT 1').bind(job.id).first();
   const amount=Math.round(minutes*initial.hourly_cents/60);
   const adjustmentId=id();
   await env.DB.prepare('INSERT INTO job_adjustments(id,job_id,delta_ms,delta_cents,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(adjustmentId,job.id,minutes*60000,amount,reason,user.id,at).run();
   await log(env,user,'adjust_hours','job',job.id,{delta_minutes:minutes,delta_cents:amount,reason});return json({ok:true});
  }
 }
 if(path==='/api/rates'&&method==='POST'){
  requireRole(user,'admin');const b=await bodyJson(request);const cents=amountCents(b.hourly_amount);
  const rate=await firstRate(env);assert(cents!==rate.amount_cents,'Novo valor deve ser diferente do atual.');
  const active=await fetchAll(env.DB,`SELECT w.id,w.job_id FROM work_segments w JOIN jobs j ON j.id=w.job_id WHERE w.end_ts IS NULL AND j.status='running'`);
  const statements=[env.DB.prepare('INSERT INTO rates(amount_cents,effective_at,created_by) VALUES(?,?,?)').bind(cents,at,user.id)];
  for(const s of active){
   statements.push(env.DB.prepare('UPDATE work_segments SET end_ts=? WHERE id=?').bind(at,s.id));
   statements.push(env.DB.prepare('INSERT INTO work_segments(id,job_id,start_ts,hourly_cents,rate_id) VALUES(?,?,?,?,(SELECT MAX(id) FROM rates))').bind(id(),s.job_id,at,cents));
  }
  statements.push(env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)').bind(id(),user.id,'change_rate','rate',String(cents),JSON.stringify({before_cents:rate.amount_cents,after_cents:cents}),at));
  await env.DB.batch(statements);return json({ok:true,rate_cents:cents});
 }
 if(path==='/api/maintenance'&&(method==='POST')){
  requireRole(user,'admin','manager');const b=await bodyJson(request);
  const category=requireString(b.category,'Categoria',70),description=requireString(b.description,'Descrição',500),cents=amountCents(b.amount),date=dateValue(b.expense_date),payer=b.payer_role;
  assert(['admin','manager'].includes(payer),'Selecione quem pagou.');
  if(b.file_id)await checkFile(env,b.file_id,user);
  const item=id();await env.DB.prepare('INSERT INTO maintenance(id,category,description,amount_cents,payer_role,expense_date,file_id,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .bind(item,category,description,cents,payer,date,b.file_id||null,text(b.notes,700),user.id,at,at).run();
  await log(env,user,'create','maintenance',item,{amount_cents:cents,payer});return json({ok:true,id:item},201);
 }
 const maintPath=path.match(/^\/api\/maintenance\/([a-f0-9-]{36})$/);
 if(maintPath&&(method==='PUT'||method==='DELETE')){
  requireRole(user,'admin','manager');const existing=await env.DB.prepare('SELECT * FROM maintenance WHERE id=? AND deleted_at IS NULL').bind(maintPath[1]).first();assert(existing,'Manutenção não encontrada.',404);
  if(method==='DELETE'){
   requireRole(user,'admin');await env.DB.prepare('UPDATE maintenance SET deleted_at=?,updated_at=? WHERE id=?').bind(at,at,maintPath[1]).run();
   await log(env,user,'delete','maintenance',maintPath[1],{prior:existing});return json({ok:true});
  }
  const b=await bodyJson(request);const category=requireString(b.category,'Categoria',70),description=requireString(b.description,'Descrição',500),cents=amountCents(b.amount),date=dateValue(b.expense_date);
  assert(['admin','manager'].includes(b.payer_role),'Selecione quem pagou.');if(b.file_id)await checkFile(env,b.file_id,user);
  await env.DB.prepare('UPDATE maintenance SET category=?,description=?,amount_cents=?,payer_role=?,expense_date=?,file_id=?,notes=?,updated_at=? WHERE id=?')
   .bind(category,description,cents,b.payer_role,date,b.file_id||null,text(b.notes,700),at,maintPath[1]).run();
  await log(env,user,'update','maintenance',maintPath[1],{before:existing,after:b});return json({ok:true});
 }
 if(path==='/api/payments'&&method==='POST'){
  requireRole(user,'admin','manager');const b=await bodyJson(request);const cents=amountCents(b.amount),minutes=Number(b.paid_minutes||0),date=dateValue(b.payment_date);
  assert(Number.isInteger(minutes)&&minutes>=0&&minutes<1e8,'Horas pagas inválidas.');
  if(b.file_id)await checkFile(env,b.file_id,user);
  const pid=id();await env.DB.prepare('INSERT INTO payments(id,amount_cents,paid_minutes,payment_date,file_id,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(pid,cents,minutes,date,b.file_id||null,text(b.notes,700),user.id,at,at).run();
  await log(env,user,'create','payment',pid,{amount_cents:cents,paid_minutes:minutes});return json({ok:true,id:pid},201);
 }
 const payPath=path.match(/^\/api\/payments\/([a-f0-9-]{36})$/);
 if(payPath&&(method==='PUT'||method==='DELETE')){
  requireRole(user,'admin','manager');const existing=await env.DB.prepare('SELECT * FROM payments WHERE id=? AND deleted_at IS NULL').bind(payPath[1]).first();assert(existing,'Pagamento não encontrado.',404);
  if(method==='DELETE'){
   requireRole(user,'admin');await env.DB.prepare('UPDATE payments SET deleted_at=?,updated_at=? WHERE id=?').bind(at,at,payPath[1]).run();
   await log(env,user,'delete','payment',payPath[1],{prior:existing});return json({ok:true});
  }
  const b=await bodyJson(request);const cents=amountCents(b.amount),minutes=Number(b.paid_minutes||0),date=dateValue(b.payment_date);
  assert(Number.isInteger(minutes)&&minutes>=0&&minutes<1e8,'Horas pagas inválidas.');if(b.file_id)await checkFile(env,b.file_id,user);
  await env.DB.prepare('UPDATE payments SET amount_cents=?,paid_minutes=?,payment_date=?,file_id=?,notes=?,updated_at=? WHERE id=?')
   .bind(cents,minutes,date,b.file_id||null,text(b.notes,700),at,payPath[1]).run();
  await log(env,user,'update','payment',payPath[1],{before:existing,after:b});return json({ok:true});
 }
 if(path==='/api/users'&&method==='POST'){
  requireRole(user,'admin');const b=await bodyJson(request);
  const name=requireString(b.name,'Nome',100),username=requireString(b.username,'Usuário',60).toLowerCase(),role=b.role;
  assert(/^[a-z0-9._-]{3,60}$/.test(username),'Usuário inválido.');assert(['admin','manager','operator'].includes(role),'Perfil inválido.');
  validatePassword(b.password);const salt=id(),p=await hashPassword(b.password,salt),uid=id();
  await env.DB.prepare('INSERT INTO users(id,name,username,role,password_hash,password_salt,active,created_by,created_at) VALUES(?,?,?,?,?,?,1,?,?)')
   .bind(uid,name,username,role,p,salt,user.id,at).run();
  await log(env,user,'create','user',uid,{name,username,role});return json({ok:true,id:uid},201);
 }
 const userPath=path.match(/^\/api\/users\/([a-f0-9-]{36})$/);
 if(userPath&&method==='PUT'){
  requireRole(user,'admin');const old=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userPath[1]).first();assert(old,'Usuário não encontrado.',404);
  const b=await bodyJson(request),name=requireString(b.name,'Nome',100),username=requireString(b.username,'Usuário',60).toLowerCase();
  assert(/^[a-z0-9._-]{3,60}$/.test(username),'Usuário inválido.');assert(['admin','manager','operator'].includes(b.role),'Perfil inválido.');
  const active=b.active===false?0:1;
  assert(old.id!==user.id||active===1&&b.role==='admin','Você não pode desativar ou retirar seu próprio acesso de administrador.');
  if(b.password){validatePassword(b.password);const salt=id(),pass=await hashPassword(b.password,salt);
   await env.DB.prepare('UPDATE users SET name=?,username=?,role=?,active=?,password_hash=?,password_salt=? WHERE id=?').bind(name,username,b.role,active,pass,salt,old.id).run();
   await env.DB.prepare('DELETE FROM user_sessions WHERE user_id=?').bind(old.id).run();
  }else await env.DB.prepare('UPDATE users SET name=?,username=?,role=?,active=? WHERE id=?').bind(name,username,b.role,active,old.id).run();
  await log(env,user,'update','user',old.id,{name,username,role:b.role,active,password_changed:!!b.password});return json({ok:true});
 }
 if(path==='/api/export'&&method==='GET'){
  requireRole(user,'admin','manager');const data=await state(env,user);const type=url.searchParams.get('type');let rows,headers;
  if(type==='jobs'){
   rows=data.jobs.map(j=>({...j,horas:(j.duration_ms/3600000).toFixed(3),valor:(j.amount_cents/100).toFixed(2),inicio:new Date(j.started_at).toISOString(),fim:j.finished_at?new Date(j.finished_at).toISOString():'',horimetro_inicial:j.start_meter,horimetro_final:j.end_meter??''}));
   headers=[['Cliente','customer'],['Local','location'],['Serviço','description'],['Situação','status'],['Início (UTC)','inicio'],['Fim (UTC)','fim'],['Horas','horas'],['Valor (R$)','valor'],['Horímetro inicial','horimetro_inicial'],['Horímetro final','horimetro_final']];
  }else if(type==='maintenance'){
   rows=data.maintenance.map(x=>({...x,valor:(x.amount_cents/100).toFixed(2)}));headers=[['Data','expense_date'],['Categoria','category'],['Descrição','description'],['Valor (R$)','valor'],['Quem pagou','payer_role'],['Observações','notes']];
  }else if(type==='payments'){
   rows=data.payments.map(x=>({...x,valor:(x.amount_cents/100).toFixed(2),horas:(x.paid_minutes/60).toFixed(2)}));headers=[['Data','payment_date'],['Valor (R$)','valor'],['Horas pagas','horas'],['Observações','notes']];
  }else throw new HttpError('Tipo de exportação inválido.');
  return new Response(csv(rows,headers),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="mini-${type}.csv"`,'Cache-Control':'no-store'}});
 }
 throw new HttpError('Endereço não encontrado.',404);
}
export default {async fetch(request,env){
 try{
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  return await handler(request,env);
 }catch(e){
  if(e instanceof HttpError)return error(e.message,e.status);
  if(e?.status&&e.status>=400&&e.status<=499)return error(e.message,e.status);
  const message=String(e?.message||'');
  console.error('API error',e);
  if(message.includes('UNIQUE constraint failed'))return error('Já existe um registro com esses dados ou uma obra em andamento.',409);
  if(message.includes('FOREIGN KEY constraint failed'))return error('Referência inexistente.',400);
  return error('Falha interna ao processar a solicitação. Consulte os logs.',500);
 }
}};
