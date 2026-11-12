/* MiniGestão v3 - Clientes, Calendário, Operação e Dashboard diário */
const v3ui={selectedDay:today(),month:today().slice(0,7),sidebarCollapsed:false,mobileOpen:false,chosenOrder:null};
const originalNav=navItems;
navItems=function(role){
 const list=originalNav(role);
 const extras=role==='operator'?[['calendar','▦','Agenda'],['tickets','♧','Chamados']]:
   [['clients','♙','Clientes'],['calendar','▦','Calendário'],['tickets','♧','Chamados']];
 const ix=list.findIndex(item=>item[0]==='jobs');
 list.splice(ix+1,0,...extras);
 return list;
};
Object.assign(titleMap,{
 clients:['Clientes','Cadastro de nome, telefone e serviço'],
 calendar:['Calendário de obras','Programação da máquina e previsões de receita'],
 tickets:['Chamados e ocorrências','Esquecimentos, informações pendentes e soluções']
});
const originalRender=render;
render=function(){
 originalRender();
 const sidebar=document.querySelector('.sidebar'),brand=document.querySelector('.brand'),header=document.querySelector('.topline');
 if(!sidebar||!brand||!header)return;
 sidebar.classList.toggle('v3-collapsed',v3ui.sidebarCollapsed);
 sidebar.classList.toggle('v3-open',v3ui.mobileOpen);
 brand.innerHTML='<img class="v3-logo" src="/formacerta.webp" alt="FormaCerta" />'+
  '<button type="button" class="v3-side-toggle" data-action="v3-collapse" title="Recolher ou expandir menu" aria-label="Alternar barra lateral">☷</button>';
 const title=header.querySelector('h1');
 if(title)header.insertAdjacentHTML('afterbegin','<button type="button" class="v3-burger" data-action="v3-mobile-menu" aria-label="Abrir ou fechar menu">☰</button>');
 if(v3ui.mobileOpen)sidebar.insertAdjacentHTML('afterend','<button class="v3-backdrop" data-action="v3-mobile-menu" aria-label="Fechar menu"></button>');
 const newButton=header.querySelector('[data-action="start-form"]');
 if(newButton){newButton.dataset.action='v3-start-form';newButton.textContent='+ Iniciar obra';}
 document.querySelectorAll('.sidebar .nav button').forEach(b=>{
  const label=b.textContent.trim();b.title=label;
  const icon=b.querySelector('span');if(icon){const text=b.childNodes[b.childNodes.length-1];if(text?.nodeType===3)text.textContent=label;}
 });
};
const originalRenderPage=renderPage;
renderPage=function(){
 if(state.view==='clients')return v3Clients();
 if(state.view==='calendar')return v3Calendar();
 if(state.view==='tickets')return v3Tickets();
 if(state.view==='jobs')return v3Jobs();
 return originalRenderPage();
};
const originalRangeMetrics=rangeMetrics;
rangeMetrics=function(){
 if(state.range!=='day')return originalRangeMetrics();
 const start=Date.parse(v3ui.selectedDay+'T03:00:00Z'),end=start+86400000;
 let ms=0,raw=0;
 for(const j of state.data.jobs)for(const segment of j.segments){
  const a=Math.max(segment.start_ts,start);
  const b=Math.min(segment.end_ts??Date.now()-state.serverOffset,end);
  const delta=Math.max(0,b-a);ms+=delta;raw+=delta*segment.hourly_cents/3600000;
 }
 return {ms,cents:Math.round(raw)};
};
function v3SelectedSchedule(){
 const base=Date.parse(v3ui.selectedDay+'T03:00:00Z'),end=base+86400000;
 const orders=(state.data.work_orders||[]).filter(o=>o.status==='scheduled'&&o.planned_start<end&&o.planned_end>base);
 return {orders,minutes:orders.reduce((n,o)=>n+o.expected_minutes,0),cents:orders.reduce((n,o)=>n+Math.round(o.expected_minutes*o.hourly_cents/60),0)};
}
const originalDashboard=renderDashboard;
renderDashboard=function(){
 const day=v3ui.selectedDay,forecast=v3SelectedSchedule(),stat=rangeMetrics();
 const filters='<section class="v3-filter"><div><strong>Consultar um dia específico</strong><div class="muted small">Escolha qualquer data, inclusive quintas-feiras anteriores.</div></div>'+
 '<div class="v3-filter-controls"><input aria-label="Selecionar data do dashboard" id="v3-dashboard-day" type="date" value="'+esc(day)+'"/>'+
 '<button class="button light sm" data-action="v3-show-day">Ver dia escolhido</button>'+
 '<button class="button light sm" data-nav="calendar">Abrir calendário</button></div></section>';
 let html=originalDashboard();
 html=html.replace('<div class="filtergroup" style="margin-bottom:17px">',filters+'<div class="filtergroup" style="margin-bottom:17px">');
 const upcoming='<div class="cards v3-forecasts">'+
  metric('Previsão de horas agendadas',hrs(forecast.minutes*60000),'Dia '+dateOnly(day))+
  metric('Previsão de entradas',money(forecast.cents),'Tarifa prevista dos agendamentos')+
  metric('Obras programadas',String(forecast.orders.length),'Para o dia selecionado')+
  metric('Horas registradas neste dia',hrs(stat.ms),'Tempo efetivamente trabalhado')+
  '</div>';
 html=html.replace('<div class="split"><section class="panel">',upcoming+'<div class="split"><section class="panel">');
 if(state.range==='day'){
  const start=Date.parse(day+'T03:00:00Z'),end=start+86400000;
  const jobs=state.data.jobs.filter(j=>j.started_at<end&&(j.finished_at??Date.now())>start);
  html+='<section class="panel"><div class="panel-head"><h2>Obras do dia '+dateOnly(day)+'</h2><button class="button light sm" data-nav="calendar">Consultar agenda</button></div>'+jobTable(jobs)+'</section>';
 }
 html+='<section class="panel"><div class="panel-head"><h2>Agenda de '+dateOnly(day)+'</h2><button class="button primary sm" data-action="v3-order-form">+ Agendar obra</button></div>'+v3OrdersTable(forecast.orders)+'</section>';
 return html;
};
function v3Select(name,items,selected='',required=true){
 return '<div class="field"><label>'+esc(name)+'</label><select name="'+esc(items.field||'')+'" '+(required?'required':'')+'>'+
  items.options.map(item=>'<option value="'+esc(item[0])+'" '+(String(item[0])===String(selected)?'selected':'')+'>'+esc(item[1])+'</option>').join('')+'</select></div>';
}
function v3Control(label,name,value,attributes=''){
 return '<div class="field"><label>'+esc(label)+'</label><input name="'+esc(name)+'" value="'+esc(value??'')+'" '+attributes+' /></div>';
}
function v3Text(label,name,value=''){
 return '<div class="field wide"><label>'+esc(label)+'</label><textarea name="'+esc(name)+'">'+esc(value)+'</textarea></div>';
}
function v3Form(kind,body,button='Salvar'){
 return '<form id="v3-form" data-kind="'+kind+'"><div class="form-grid">'+body+'</div><div class="modal-footer">'+
 '<button class="button light" type="button" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">'+button+'</button></div></form>';
}
function v3PeopleChoices(){
 return (state.data.clients||[]).map(x=>[x.id,x.name+' · '+x.phone+' · '+x.service]);
}
function v3OrderChoices(){
 const a=state.data.work_orders||[];
 return a.filter(o=>o.status==='scheduled').map(o=>{
  const c=(state.data.clients||[]).find(c=>c.id===o.client_id);
  return [o.id,o.title+' · '+(c?.name||'Cliente')+' · '+datePt(o.planned_start)];
 });
}
function v3NoChoices(message){
 return '<div class="notice warn">'+esc(message)+'</div>';
}
function v3Clients(){
 if(state.data.me.role==='operator')return '<section class="panel"><h2>Clientes vinculados às obras</h2>'+
  v3ClientsTable()+'</section>';
 return '<section class="panel"><div class="panel-head"><h2>Clientes cadastrados</h2>'+
 '<button class="button primary sm" data-action="v3-client-form">+ Novo cliente</button></div>'+v3ClientsTable()+'</section>';
}
function v3ClientsTable(){
 const clients=state.data.clients||[];
 if(!clients.length)return empty('Cadastre o primeiro cliente para poder agendar obras.');
 return '<div class="tblwrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Serviço</th><th>Ações</th></tr></thead><tbody>'+
 clients.map(c=>'<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(c.phone)+'</td><td>'+esc(c.service)+'</td><td>'+
 (state.data.me.role==='operator'?'—':'<button class="button light sm" data-action="v3-client-form" data-id="'+c.id+'">Editar</button> '+
 (state.data.me.role==='admin'?'<button class="button light sm" data-action="v3-client-delete" data-id="'+c.id+'">Excluir</button>':''))+
 '</td></tr>').join('')+'</tbody></table></div>';
}
function v3OrdersTable(orders){
 if(!orders.length)return empty('Nenhuma obra agendada nesse período.');
 return '<div class="tblwrap"><table><thead><tr><th>Data e hora</th><th>Cliente</th><th>Obra / Serviço</th><th>Horas</th><th>Previsto</th><th></th></tr></thead><tbody>'+
 orders.map(o=>{
 const client=(state.data.clients||[]).find(c=>c.id===o.client_id);
 return '<tr><td>'+datePt(o.planned_start)+'<br><span class="muted small">Até '+datePt(o.planned_end)+'</span></td><td>'+
 esc(client?.name||'—')+'</td><td><strong>'+esc(o.title)+'</strong><br><span class="muted small">'+esc(o.service)+'</span></td><td>'+
 hrs(o.expected_minutes*60000)+'</td><td>'+money(Math.round(o.expected_minutes*o.hourly_cents/60))+'</td><td>'+
 (o.status==='scheduled'?'<div class="row-actions"><button class="button primary sm" data-action="v3-start-form" data-id="'+o.id+'">Iniciar</button>'+
 (state.data.me.role!=='operator'?'<button class="button light sm" data-action="v3-order-form" data-id="'+o.id+'">Editar</button>':'')+'</div>':'<span class="badge">'+esc(o.status)+'</span>')+
 '</td></tr>';
 }).join('')+'</tbody></table></div>';
}
function v3Calendar(){
 const month=v3ui.month;
 const first=new Date(month+'-01T12:00:00Z'),year=first.getUTCFullYear(),m=first.getUTCMonth();
 const days=new Date(Date.UTC(year,m+1,0)).getUTCDate();
 const weekday=(new Date(Date.UTC(year,m,1)).getUTCDay()+6)%7;
 const orders=(state.data.work_orders||[]).filter(o=>o.status==='scheduled');
 const header='<section class="panel"><div class="panel-head"><h2>Calendário de '+first.toLocaleDateString('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'})+'</h2>'+
 '<div class="row-actions"><button class="button light sm" data-action="v3-prev-month">← Anterior</button><button class="button light sm" data-action="v3-next-month">Próximo →</button>'+
 (state.data.me.role==='operator'?'':'<button class="button primary sm" data-action="v3-order-form">+ Agendar obra</button>')+'</div></div>';
 const cells=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(x=>'<div class="v3-weekday">'+x+'</div>');
 for(let i=0;i<weekday;i++)cells.push('<div class="v3-day empty-day"></div>');
 for(let d=1;d<=days;d++){
  const day=month+'-'+String(d).padStart(2,'0');
  const a=Date.parse(day+'T03:00:00Z'),b=a+86400000;
  const matches=orders.filter(o=>o.planned_start<b&&o.planned_end>a);
  cells.push('<button class="v3-day '+(day===v3ui.selectedDay?'selected':'')+'" data-action="v3-calendar-day" data-id="'+day+'">'+
   '<strong>'+d+'</strong>'+(matches.length?'<small>'+matches.length+' obra(s)</small>':'<small>—</small>')+'</button>');
 }
 const upcoming=v3SelectedSchedule();
 return header+'<div class="v3-calendar-grid">'+cells.join('')+'</div></section>'+
 '<div class="cards">'+metric('Agendado em '+dateOnly(v3ui.selectedDay),String(upcoming.orders.length),'Obras do dia')+
 metric('Horas previstas',hrs(upcoming.minutes*60000),'Soma das estimativas')+
 metric('Receita prevista',money(upcoming.cents),'Estimativa, não pagamento recebido')+
 metric('Preço/hora atual',money(state.data.current_rate_cents),'Novos agendamentos')+'</div>'+
 '<section class="panel"><div class="panel-head"><h2>Obras agendadas para '+dateOnly(v3ui.selectedDay)+'</h2><button class="button light sm" data-action="v3-show-day">Ver no dashboard</button></div>'+v3OrdersTable(upcoming.orders)+'</section>';
}
function v3Tickets(){
 const issues=state.data.tickets||[];
 return '<section class="panel"><div class="panel-head"><h2>Chamados e ocorrências</h2><button class="button primary sm" data-action="v3-ticket-form">+ Abrir chamado</button></div>'+
 '<p class="muted small">Use quando esquecer uma leitura do horímetro, uma pausa ou precisar justificar divergências. Gestor e administrador conseguem acompanhar e resolver.</p>'+
 (issues.length?'<div class="tblwrap"><table><thead><tr><th>Abertura</th><th>Assunto</th><th>Descrição</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+
 issues.map(x=>'<tr><td>'+datePt(x.created_at)+'</td><td><strong>'+esc(x.subject)+'</strong></td><td>'+esc(x.description)+'</td><td><span class="badge">'+(x.status==='open'?'Aberto':'Resolvido')+'</span></td><td>'+
 (state.data.me.role!=='operator'&&x.status==='open'?'<button class="button light sm" data-action="v3-ticket-resolve" data-id="'+x.id+'">Resolver</button>':'—')+'</td></tr>').join('')+'</tbody></table></div>':empty('Nenhum chamado aberto'))+'</section>';
}
function v3Jobs(){
 const orders=(state.data.work_orders||[]).filter(o=>o.status==='scheduled');
 const jobs=state.data.jobs||[],admin=state.data.me.role==='admin';
 return '<section class="panel"><div class="panel-head"><h2>Clientes e obras</h2><div class="row-actions">'+
 (state.data.me.role==='operator'?'':'<button class="button light sm" data-action="v3-client-form">+ Cliente</button><button class="button light sm" data-action="v3-order-form">+ Agendar obra</button>')+
 '<button class="button primary sm" data-action="v3-start-form">+ Iniciar obra</button></div></div>'+
 '<p class="muted small">Selecione cliente e obra cadastrados. Não é necessário digitar os nomes novamente.</p>'+
 '<h3 style="margin-top:18px">Obras programadas ('+orders.length+')</h3>'+v3OrdersTable(orders)+'</section>'+
 '<section class="panel"><div class="panel-head"><h2>Obras registradas ('+jobs.length+')</h2><button class="button light sm" data-action="v3-manual-form">+ Lançar motor e pausas</button></div>'+
 (jobs.length?'<div class="tblwrap"><table><thead><tr><th>Cliente / Obra</th><th>Início</th><th>Horas</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>'+
 jobs.map(j=>'<tr><td><strong>'+esc(j.customer)+'</strong><br><span class="muted small">'+esc(j.description)+'</span></td><td>'+datePt(j.started_at)+
 '</td><td>'+hrs(currentDuration(j))+'</td><td>'+money(currentAmount(j))+'</td><td>'+badge(j.status)+'</td><td><div class="row-actions">'+
 '<button class="button light sm" data-action="job-details" data-id="'+j.id+'">Detalhes</button>'+
 (admin?'<button class="button light sm" data-action="v3-job-'+(j.status==='finished'?'reopen':'delete')+'" data-id="'+j.id+'">'+(j.status==='finished'?'Retomar':'Excluir')+'</button>'+
 '<button class="button light sm" data-action="v3-job-delete" data-id="'+j.id+'">Excluir</button>':'')+
 '</div></td></tr>').join('')+'</tbody></table></div>':empty('Nenhuma obra registrada'))+'</section>';
}
const originalOperation=renderOperation;
renderOperation=function(){
 const j=runningJob(),orders=(state.data.work_orders||[]).filter(o=>o.status==='scheduled');
 return '<div class="split"><section class="panel"><div class="panel-head"><h2>Operação da máquina</h2>'+
 (j?badge(j.status):'<span class="badge">Disponível</span>')+'</div>'+
 (j?'<div class="counterbox"><div class="counter-label">'+esc(j.customer)+' · Tempo de motor ligado</div><div class="counter" data-time="'+j.id+'">'+fmtTime(currentDuration(j))+'</div>'+
 '<div class="counter-sub">Valor acumulado: '+money(currentAmount(j))+'</div></div>'+
 '<div class="operator-controls">'+
 (j.status==='running'?'<button class="button light" data-action="v3-pause-form" data-id="'+j.id+'">⏸ Desligar motor</button>':
 '<button class="button green" data-action="v3-resume" data-id="'+j.id+'">▶ Partida do motor</button>')+
 '<button class="button danger" data-action="v3-finish-form" data-id="'+j.id+'">■ Encerrar obra</button></div>':
 '<div class="counterbox"><div class="counter-label">Máquina disponível</div><div class="counter">00:00:00</div><div class="counter-sub">Selecione um cliente e uma obra para iniciar.</div></div>'+
 '<button class="button primary full" data-action="v3-start-form">▶ INICIAR OBRA</button>'+
 '<button class="button light full" style="margin-top:10px" data-action="v3-manual-form">✎ Preencher períodos manualmente</button>')+
 '<button class="button light full" style="margin-top:10px" data-action="v3-ticket-form" data-id="'+(j?.id||'')+'">♧ Abrir chamado / Esqueci uma leitura</button></section>'+
 '<section class="panel"><h2>Como registrar</h2><div class="stack"><div class="notice">1. Cadastre o cliente e agende a obra.</div>'+
 '<div class="notice">2. Escolha <strong>motor ligado agora</strong> ou <strong>apontamento manual</strong>.</div>'+
 '<div class="notice">3. Anote os motivos e a duração das pausas; o período desligado não é cobrado.</div>'+
 '<div class="notice warn">4. Ao finalizar, envie <strong>pelo menos três fotos</strong> da obra, e informe a leitura digital caso tenha.</div></div></section></div>'+
 '<section class="panel"><div class="panel-head"><h2>Próximas obras</h2><button class="button light sm" data-nav="calendar">Abrir agenda</button></div>'+v3OrdersTable(orders.slice(0,5))+'</section>';
};
const originalShowJob=showJob;
showJob=function(id){
 originalShowJob(id);
 const j=(state.data.jobs||[]).find(x=>x.id===id),inner=modalBody.querySelector('.modal-inner');if(!j||!inner)return;
 const photos=j.photos||[],pauses=j.pauses||[];
 inner.insertAdjacentHTML('beforeend','<section style="margin-top:20px"><h3>Fotos da obra ('+photos.length+')</h3>'+
 (photos.length?'<div class="v3-photo-grid">'+photos.map(p=>'<a href="/api/files/'+p.file_id+'" target="_blank" rel="noopener"><img alt="Foto da obra" src="/api/files/'+p.file_id+'"/></a>').join('')+'</div>':empty('Nenhuma foto adicional'))+
 '<h3 style="margin-top:18px">Pausas registradas</h3>'+
 (pauses.length?pauses.map(p=>'<p class="muted small">'+datePt(p.start_ts)+'–'+datePt(p.end_ts)+' · '+esc(p.reason)+'</p>').join(''):'<p class="muted small">Nenhuma pausa registrada.</p>')+
 (state.data.me.role==='admin'?'<div class="row-actions" style="margin-top:20px">'+
 (j.status==='finished'?'<button class="button light" data-action="v3-job-reopen" data-id="'+j.id+'">Retomar obra</button>':'')+
 '<button class="button danger" data-action="v3-job-delete" data-id="'+j.id+'">Excluir obra</button></div>':'')+'</section>');
};
function v3OpenForm(kind,recordId){
 const d=state.data,people=v3PeopleChoices(),orders=v3OrderChoices();
 if(kind==='client'){
  const x=d.clients.find(c=>c.id===recordId);
  const form=v3Form('client',v3Control('Nome do cliente *','name',x?.name,'required maxlength="130"')+
   v3Control('Telefone com DDD *','phone',x?.phone,'required type="tel"')+
   v3Control('Qual é o serviço *','service',x?.service,'required maxlength="200"')+
   v3Text('Observações','notes',x?.notes));
  modal(x?'Editar cliente':'Cadastrar cliente',form);
  dialog.dataset.v3id=x?.id||'';
  return;
 }
 if(kind==='order'){
  if(!people.length)return notify('Cadastre um cliente antes de agendar uma obra.',true);
  const x=d.work_orders.find(o=>o.id===recordId);
  const start=x?new Date(x.planned_start-10800000).toISOString().slice(0,16):today()+'T08:00';
  const end=x?new Date(x.planned_end-10800000).toISOString().slice(0,16):today()+'T17:00';
  modal(x?'Editar agendamento':'Agendar nova obra',v3Form('order',
   v3Select('Cliente cadastrado *',{field:'client_id',options:people},x?.client_id)+
   v3Control('Nome da obra *','title',x?.title,'required maxlength="130"')+
   v3Control('Serviço *','service',x?.service||d.clients[0].service,'required')+
   v3Control('Local / endereço','location',x?.location)+
   v3Control('Dia e hora de início *','planned_start',start,'required type="datetime-local"')+
   v3Control('Dia e hora de término *','planned_end',end,'required type="datetime-local"')+
   v3Control('Previsão de horas trabalhadas *','expected_hours',x?x.expected_minutes/60:8,'required type="number" min="0.02" step="0.01"')+
   v3Select('Operador',{field:'operator_id',options:[['','Atribuir depois'],...(d.users||[]).filter(x=>x.role==='operator'&&x.active).map(x=>[x.id,x.name])]},x?.operator_id,false)+
   v3Text('Observações','notes',x?.notes),x?'Salvar alterações':'Agendar obra'));
  dialog.dataset.v3id=x?.id||'';return;
 }
 if(kind==='start'){
  if(runningJob())return notify('Encerre primeiro a obra atual.',true);
  if(!orders.length)return notify('Primeiro cadastre um cliente e agende uma obra no Calendário.',true);
  const selected=orders.some(x=>x[0]===recordId)?recordId:orders[0][0];
  const b=v3Select('Cliente e obra agendada *',{field:'work_order_id',options:orders},selected)+
   v3Select('Quando iniciar?',{field:'start_timing',options:[['now','Motor ligado agora'],['scheduled','Programado (ajustar agenda)']]},'now')+
   v3Select('Como controlar?',{field:'mode',options:[['digital','Horímetro digital + cronômetro'],['timer','Cronômetro de motor ligado']]},'digital')+
   v3Control('Leitura inicial do horímetro (opcional)','start_meter','','type="number" min="0" step="0.01"')+
   '<div class="field wide"><label>Foto inicial (opcional)</label><input type="file" name="start_photo" accept="image/*"/></div>';
  modal('Iniciar obra',v3Form('start',b,'Confirmar início'));
  return;
 }
 if(kind==='pause'){
  modal('Desligar motor',v3Form('pause',v3Text('Motivo da pausa *','reason',''),'Confirmar desligamento'));
  dialog.dataset.v3id=recordId;return;
 }
 if(kind==='ticket'){
  const jobs=(d.jobs||[]).map(j=>[j.id,j.customer+' · '+datePt(j.started_at)]);
  const b=v3Control('Assunto *','subject','Esqueci uma leitura','required')+
    v3Select('Obra relacionada',{field:'job_id',options:[['','Sem obra vinculada'],...jobs]},recordId||'',false)+
    v3Text('Explique o que aconteceu *','description');
  modal('Abrir chamado para o gestor',v3Form('ticket',b,'Enviar chamado'));
  return;
 }
 if(kind==='resolve'){
  modal('Resolver chamado',v3Form('resolve',v3Text('Solução / observações *','resolution'),'Marcar resolvido'));
  dialog.dataset.v3id=recordId;return;
 }
 if(kind==='jobadmin'){
  const action=dialog.dataset.v3jobaction||'reopen';
  modal(action==='delete'?'Excluir obra':'Retomar obra finalizada',v3Form('jobadmin',v3Text('Justificativa obrigatória *','reason'),action==='delete'?'Excluir obra':'Retomar obra'));
  dialog.dataset.v3id=recordId;dialog.dataset.v3action=action;return;
 }
 if(kind==='finish'){
  const j=d.jobs.find(x=>x.id===recordId);
  if(!j)return;
  const b=v3Control('Horímetro digital final (opcional)','end_meter','','type="number" min="0" step="0.01"')+
   '<div class="field wide"><label>Fotos obrigatórias do encerramento — mínimo 3</label><div class="v3-photo-fields">'+
   [1,2,3].map(i=>'<label>Foto '+i+' *<input type="file" name="end_photo_'+i+'" data-end-photo required accept="image/*" /></label>').join('')+
   '</div><small>Você pode anexar mais três fotos se desejar.</small><input type="file" name="end_photos_extra" multiple accept="image/*"/></div>'+
   '<div class="field wide"><label><input type="checkbox" name="manual_review_enabled" id="v3-manual-review" /> Também preencher observações manuais?</label></div>'+
   '<div class="field wide v3-review" hidden>'+v3Text('Conferência de partidas, pausas e horários (não cobra duas vezes)','manual_notes')+'</div>'+
   '<div class="notice warn field wide">As horas já contadas pelo cronômetro não serão somadas novamente. Uma conferência manual é apenas um registro de apoio.</div>';
  modal('Encerrar obra · 3 fotos',v3Form('finish',b,'Confirmar encerramento'));
  dialog.dataset.v3id=recordId;return;
 }
 if(kind==='manual'){
  if(!orders.length)return notify('Agende uma obra antes de lançar períodos manuais.',true);
  const b=v3Select('Cliente e obra *',{field:'work_order_id',options:orders},recordId)+
   '<div class="field wide"><strong>Períodos do motor e pausas</strong><div class="muted small">Digite a data e a hora para cada período. Adicione quantas pausas forem necessárias.</div>'+
   '<div id="v3-periods">'+v3Period('run',0)+'</div><button class="button light sm" type="button" data-action="v3-add-pause">+ Adicionar pausa e nova partida</button></div>'+
   v3Control('Horímetro inicial (opcional)','start_meter','','type="number" min="0" step="0.01"')+
   v3Control('Horímetro final (opcional)','end_meter','','type="number" min="0" step="0.01"')+
   '<div class="field wide"><label>Fotos finais da obra — mínimo 3</label><div class="v3-photo-fields">'+
   [1,2,3].map(i=>'<label>Foto '+i+' *<input type="file" name="end_photo_'+i+'" data-end-photo required accept="image/*" /></label>').join('')+
   '</div><input type="file" name="end_photos_extra" multiple accept="image/*" /></div>'+
   '<div id="v3-total-preview" class="notice field wide">O sistema calculará as horas por período, descontando cada pausa.</div>';
  modal('Preencher motor e pausas manualmente',v3Form('manual',b,'Salvar e encerrar obra'));
  return;
 }
}
function v3Period(kind,n){
 const title=kind==='run'?'Motor ligado':'Pausa '+n;
 return '<div class="v3-period" data-kind="'+kind+'"><h4>'+title+'</h4>'+
  '<div class="v3-period-fields"><label>De<input type="datetime-local" name="period_start" required /></label>'+
  '<label>Até<input type="datetime-local" name="period_end" required /></label></div>'+
  (kind==='pause'?'<div class="field"><label>Motivo da pausa *<input name="reason" required placeholder="Ex.: almoço, abastecimento" /></label></div>':'')+
  '</div>';
}
const originalClick=clickAction;
clickAction=async function(action,id){
 if(action==='v3-collapse'){v3ui.sidebarCollapsed=!v3ui.sidebarCollapsed;render();return;}
 if(action==='v3-mobile-menu'){v3ui.mobileOpen=!v3ui.mobileOpen;render();return;}
 if(action==='v3-show-day'){
  const chosen=document.getElementById('v3-dashboard-day')?.value||v3ui.selectedDay;
  if(/^\d{4}-\d{2}-\d{2}$/.test(chosen))v3ui.selectedDay=chosen;
  state.range='day';state.view='dashboard';render();return;
 }
 if(action==='v3-calendar-day'){v3ui.selectedDay=id;render();return;}
 if(action==='v3-prev-month'||action==='v3-next-month'){
  const [year,m]=v3ui.month.split('-').map(Number),delta=action==='v3-next-month'?1:-1;
  const d=new Date(Date.UTC(year,m-1+delta,1));v3ui.month=d.toISOString().slice(0,7);render();return;
 }
 if(action==='v3-add-pause'){
  const area=dialog.querySelector('#v3-periods'),idx=area.querySelectorAll('[data-kind="pause"]').length+1;
  if(idx>12)return notify('Limite de 12 pausas por lançamento.',true);
  area.insertAdjacentHTML('beforeend',v3Period('pause',idx)+v3Period('run',idx));
  return;
 }
 if(action==='v3-client-form')return v3OpenForm('client',id);
 if(action==='v3-order-form')return v3OpenForm('order',id);
 if(action==='v3-start-form')return v3OpenForm('start',id);
 if(action==='v3-manual-form')return v3OpenForm('manual',id);
 if(action==='v3-finish-form')return v3OpenForm('finish',id);
 if(action==='v3-pause-form')return v3OpenForm('pause',id);
 if(action==='v3-ticket-form')return v3OpenForm('ticket',id);
 if(action==='v3-ticket-resolve')return v3OpenForm('resolve',id);
 if(action==='v3-resume'){await api('/v3/jobs/'+id+'/resume','POST');notify('Motor ligado, contagem retomada.');await reload();return;}
 if(action==='v3-job-reopen'||action==='v3-job-delete'){
  if(state.data.me.role!=='admin')return notify('Somente administrador geral.',true);
  dialog.dataset.v3jobaction=action==='v3-job-delete'?'delete':'reopen';
  return v3OpenForm('jobadmin',id);
 }
 if(action==='v3-client-delete'){
  if(!confirm('Excluir cadastro do cliente? As obras históricas são preservadas.'))return;
  await api('/v3/clients/'+id,'DELETE');await reload();return;
 }
 return originalClick(action,id);
};
async function v3Upload(file){
 if(!file)return null;
 const fd=new FormData();fd.set('file',file);
 return (await api('/upload','POST',fd)).id;
}
async function v3Photos(form){
 const inputs=[...form.querySelectorAll('[data-end-photo]')];
 if(inputs.some(i=>!i.files.length))throw new Error('Anexe pelo menos três fotos.');
 const files=[...inputs.map(i=>i.files[0]),...Array.from(form.querySelector('[name="end_photos_extra"]')?.files||[])];
 if(files.length>12)throw new Error('Limite de 12 fotos por obra.');
 const ids=[];for(const file of files)ids.push(await v3Upload(file));
 return ids;
}
async function v3Submit(event){
 const form=event.target;if(form.id!=='v3-form')return;
 event.preventDefault();
 if(state.pending)return;
 state.pending=true;
 const submit=form.querySelector('[type="submit"]');submit.disabled=true;
 const kind=form.dataset.kind,recordId=dialog.dataset.v3id,data=Object.fromEntries(new FormData(form));
 try{
  let result;
  if(kind==='client'){
   result=await api('/v3/clients'+(recordId?'/'+recordId:''),recordId?'PUT':'POST',data);
  }else if(kind==='order'){
   const payload={...data};
   result=await api('/v3/orders'+(recordId?'/'+recordId:''),recordId?'PUT':'POST',payload);
  }else if(kind==='start'){
   if(data.start_timing==='scheduled'){
    dialog.close();v3OpenForm('order',data.work_order_id);return;
   }
   data.start_file_id=await v3Upload(form.querySelector('[name="start_photo"]')?.files?.[0]);
   result=await api('/v3/start','POST',data);
   state.view='operation';
  }else if(kind==='manual'){
   const rows=[...form.querySelectorAll('#v3-periods .v3-period')].map(p=>({
    type:p.dataset.kind,start_at:p.querySelector('[name="period_start"]').value,end_at:p.querySelector('[name="period_end"]').value,
    reason:p.querySelector('[name="reason"]')?.value||''
   }));
   if(rows.some(x=>!x.start_at||!x.end_at))throw new Error('Informe todos os horários do motor e pausas.');
   const photo_ids=await v3Photos(form);
   result=await api('/v3/manual','POST',{...data,rows,photo_ids});
   state.view='jobs';
  }else if(kind==='finish'){
   const photo_ids=await v3Photos(form);
   const manual_review=data.manual_review_enabled?{notes:data.manual_notes||'',kind:'supplemental'}:null;
   result=await api('/v3/jobs/'+recordId+'/finish','POST',{end_meter:data.end_meter,photo_ids,manual_review});
  }else if(kind==='pause'){
   result=await api('/v3/jobs/'+recordId+'/pause','POST',{reason:data.reason});
  }else if(kind==='ticket'){
   result=await api('/v3/tickets','POST',{job_id:data.job_id||null,subject:data.subject,description:data.description});
   state.view='tickets';
  }else if(kind==='resolve'){
   result=await api('/v3/tickets/'+recordId+'/resolve','POST',{resolution:data.resolution});
  }else if(kind==='jobadmin'){
   result=await api('/v3/jobs/'+recordId+'/'+dialog.dataset.v3action,'POST',{reason:data.reason});
  }
  dialog.close();notify('Salvo com sucesso.');await reload();
 }catch(err){notify(err.message,true);submit.disabled=false}
 finally{state.pending=false;}
}
dialog.addEventListener('submit',v3Submit);
dialog.addEventListener('change',e=>{
 if(e.target.id==='v3-manual-review'){
  const box=dialog.querySelector('.v3-review');if(box)box.hidden=!e.target.checked;
 }
});
