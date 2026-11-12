/* FormaCerta Frota v5: máquinas vinculadas às obras, permissões e jornadas individuais. */
const previousMachineNav=navItems;
navItems=function(role){
 const entries=previousMachineNav(role);
 const index=entries.findIndex(e=>e[0]==='jobs');
 entries.splice(index+1,0,['machines','🚜','Máquinas']);
 return entries;
};
titleMap.machines=['Máquinas','Frota, disponibilidade e horas trabalhadas por equipamento'];

function fleetName(id){
 return (state.data?.machines||[]).find(x=>x.id===id)?.name||'Máquina não informada';
}
function fleetPhoto(m){
 return m.photo_file_id?'/api/files/'+m.photo_file_id:(m.photo_path||'');
}
function fleetAvailable(startNow=false){
 return (state.data?.machines||[]).filter(m=>m.status==='available'&&(!startNow||m.availability==='available'));
}
function fleetLinked(orderId){
 const ids=(state.data?.order_machines||[]).filter(x=>x.work_order_id===orderId).map(x=>x.machine_id);
 return (state.data?.machines||[]).filter(m=>ids.includes(m.id));
}
function fleetRemaining(orderId){
 const assigned=fleetLinked(orderId);
 const registered=new Set((state.data?.jobs||[]).filter(j=>j.work_order_id===orderId).map(j=>j.machine_id));
 return assigned.filter(m=>m.status==='available'&&m.availability==='available'&&!registered.has(m.id));
}
const previousFleetOrderChoices=v3OrderChoices;
v3OrderChoices=function(){
 const allowed=(state.data?.work_orders||[]).filter(o=>['scheduled','in_progress'].includes(o.status)&&fleetRemaining(o.id).length);
 return allowed.map(o=>{
  const client=(state.data.clients||[]).find(c=>c.id===o.client_id);
  return [o.id,o.title+' · '+(client?.name||'Cliente')+' · '+datePt(o.planned_start)];
 });
};
const previousFleetRender=renderPage;
renderPage=function(){
 if(state.view==='machines')return fleetRender();
 return previousFleetRender();
};
function fleetRender(){
 const machines=state.data?.machines||[],owner=state.data.fleet_owner;
 const active=machines.filter(m=>m.open_jobs>0).length,ready=machines.filter(m=>m.availability==='available').length;
 let html='<section class="panel"><div class="panel-head"><div><h2>Máquinas cadastradas</h2><p class="muted small">Cada máquina tem seu próprio histórico de horas e pode participar de várias obras.</p></div>'+
 (owner?'<button class="button primary sm" data-action="fleet-form">+ Cadastrar máquina</button>':'')+'</div>';
 html+='<div class="fleet-summary"><span>'+machines.length+' máquinas</span><span>'+ready+' disponíveis</span><span>'+active+' em obra</span></div>';
 if(!machines.length)return html+empty('Nenhuma máquina cadastrada.')+'</section>';
 html+='<div class="fleet-grid">'+machines.map(m=>{
  const status=m.availability==='in_use'?'Em obra':m.status==='maintenance'?'Em manutenção':m.status==='inactive'?'Inativa':'Disponível';
  const img=fleetPhoto(m);
  return '<article class="fleet-card">'+
   '<div class="fleet-picture">'+(img?'<img src="'+esc(img)+'" alt="Foto de '+esc(m.name)+'" loading="lazy" />':'<div class="fleet-placeholder">🚜</div>')+'</div>'+
   '<div class="fleet-info"><span class="fleet-code">'+esc(m.code)+'</span><h3>'+esc(m.name)+'</h3>'+
   '<div class="fleet-details"><span class="badge">'+status+'</span><span>'+esc(m.machine_type)+'</span></div>'+
   '<div class="fleet-stats"><div>Horas registradas<strong>'+hrs(m.worked_ms)+'</strong></div><div>Obras registradas<strong>'+
    (state.data.jobs||[]).filter(j=>j.machine_id===m.id).length+'</strong></div></div>'+
   (m.notes?'<p class="muted small">'+esc(m.notes)+'</p>':'')+
   (owner?'<div class="row-actions"><button class="button light sm" data-action="fleet-form" data-id="'+m.id+'">Editar / foto</button>'+
     '<button class="button light sm" data-action="fleet-delete" data-id="'+m.id+'">Excluir</button></div>':'')+
   '</div></article>';
 }).join('')+'</div></section>';
 return html;
}
function fleetMultiChooser(selected=[],quick=false){
 const list=(state.data.machines||[]).filter(x=>x.status==='available'),chosen=new Set(selected);
 if(!list.length)return '<div class="notice warn">Nenhuma máquina disponível. Peça ao administrador geral para cadastrar ou liberar uma máquina.</div>';
 return '<div class="field wide fleet-chooser"><label>Máquinas desta obra * <small>(pode selecionar mais de uma)</small></label>'+
  '<div class="fleet-machine-options">'+list.map(m=>{
   const busy=m.availability==='in_use';
   return '<label class="fleet-option"><input type="checkbox" name="machine_ids" value="'+esc(m.id)+'" '+
    (chosen.has(m.id)?'checked':'')+' data-busy="'+String(busy)+'" />'+
    '<span class="fleet-thumb">'+(fleetPhoto(m)?'<img src="'+esc(fleetPhoto(m))+'" alt="" />':'🚜')+'</span>'+
    '<span><strong>'+esc(m.name)+'</strong><small>'+esc(m.code)+' · '+(busy?'Em obra atualmente':'Disponível')+'</small></span></label>';
  }).join('')+'</div>'+
  '<p class="muted small">Horas, pausas e encerramento são individuais por máquina. Ao iniciar agora, todas as selecionadas começam a contar.</p></div>';
}
function fleetSingleChooser(machines,selected='',required=true){
 const opts=(machines||[]).map(m=>[m.id,m.name+' · '+(m.availability==='in_use'?'Em obra':m.code)]);
 if(!opts.length)return '<div class="notice warn field wide">Nenhuma máquina livre e vinculada a esta obra. Selecione outra obra ou finalize as jornadas existentes.</div>';
 return v3Select('Máquina que será utilizada *',{field:'machine_id',options:opts},selected||opts[0][0],required);
}
function fleetForm(machineId){
 const owner=state.data.fleet_owner;if(!owner)return notify('Apenas o administrador proprietário pode cadastrar máquinas.',true);
 const m=(state.data.machines||[]).find(m=>m.id===machineId);
 const opts=[['available','Disponível'],['maintenance','Em manutenção'],['inactive','Inativa']];
 const fields=v3Control('Nome da máquina *','name',m?.name||'','required maxlength="140"')+
  v3Control('Código da máquina *','code',m?.code||'','required maxlength="40" placeholder="Ex.: MINI-02"')+
  v3Control('Tipo de máquina *','machine_type',m?.machine_type||'Mini escavadeira','required maxlength="120"')+
  v3Select('Situação da máquina',{field:'status',options:opts},m?.status||'available')+
  v3Control('Horímetro inicial (opcional)','initial_meter',m?.initial_meter??'','type="number" min="0" step="0.01"')+
  '<div class="field wide"><label>Foto da máquina (JPG, PNG ou WEBP)</label><input type="file" name="machine_photo" accept="image/jpeg,image/png,image/webp" />'+
  (m&&fleetPhoto(m)?'<img class="fleet-form-preview" src="'+esc(fleetPhoto(m))+'" alt="Foto atual da máquina"/>':'')+'</div>'+
  v3Text('Observações','notes',m?.notes||'');
 modal(m?'Editar máquina':'Cadastrar máquina',v3Form('fleet',fields,m?'Salvar alterações':'Cadastrar máquina'));
 dialog.dataset.fleetId=m?.id||'';
}
const previousFleetForm=v3OpenForm;
v3OpenForm=function(kind,recordId){
 if(kind==='fleet')return fleetForm(recordId);
 previousFleetForm(kind,recordId);
 const form=dialog.querySelector('#v3-form');if(!form)return;
 const grid=form.querySelector('.form-grid');if(!grid)return;
 if(kind==='order'){
  const order=(state.data.work_orders||[]).find(x=>x.id===recordId);
  const machineIds=order?fleetLinked(order.id).map(m=>m.id):fleetAvailable(true).slice(0,1).map(m=>m.id);
  grid.insertAdjacentHTML('beforeend',fleetMultiChooser(machineIds));
 }else if(kind==='start'){
  if(recordId){
   const machines=fleetRemaining(recordId);
   grid.insertAdjacentHTML('beforeend',fleetSingleChooser(machines));
  }else{
   grid.insertAdjacentHTML('beforeend',fleetMultiChooser(fleetAvailable(true).slice(0,1).map(m=>m.id),true));
   fleetAdjustChoice(form);
  }
 }else if(kind==='manual-quick'){
  const draft=v3ui.manualDraft||{};
  const selected=Array.isArray(draft.machine_ids)?draft.machine_ids[0]:draft.machine_ids;
  grid.insertAdjacentHTML('beforeend',fleetSingleChooser((state.data.machines||[]).filter(m=>m.id===selected),selected));
 }else if(kind==='manual'){
  const orderId=recordId||form.elements.work_order_id?.value;
  grid.insertAdjacentHTML('beforeend',fleetSingleChooser(fleetRemaining(orderId)));
 }
};
function fleetAdjustChoice(form){
 const scheduled=form.elements.start_timing?.value==='scheduled';
 form.querySelectorAll('.fleet-option input[data-busy="true"]').forEach(input=>{
  input.disabled=!scheduled;
  if(!scheduled)input.checked=false;
 });
}
const previousFleetSubmit=v3Submit;
dialog.addEventListener('submit',async event=>{
 const form=event.target;
 if(form?.id!=='v3-form'||form.dataset.kind!=='fleet')return;
 event.preventDefault();event.stopImmediatePropagation();
 if(state.pending)return;
 state.pending=true;
 const submit=form.querySelector('[type="submit"]');submit.disabled=true;
 try{
  const payload=Object.fromEntries(new FormData(form));const file=form.querySelector('[name="machine_photo"]')?.files?.[0];
  delete payload.machine_photo;
  if(file)payload.photo_file_id=await v3Upload(file);
  const id=dialog.dataset.fleetId;
  await api('/v4/machines'+(id?'/'+id:''),id?'PUT':'POST',payload);
  dialog.close();notify('Máquina salva com sucesso.');await reload();
 }catch(e){notify(e.message,true);submit.disabled=false}
 finally{state.pending=false}
},true);
const previousFleetClick=clickAction;
clickAction=async function(action,id){
 if(action==='fleet-form')return fleetForm(id);
 if(action==='fleet-delete'){
  if(!state.data.fleet_owner)return notify('Somente o proprietário pode excluir máquinas.',true);
  if(!confirm('Excluir a máquina? O histórico de obras e horas será preservado.'))return;
  await api('/v4/machines/'+id,'DELETE');notify('Máquina excluída.');return reload();
 }
 return previousFleetClick(action,id);
};
dialog.addEventListener('change',event=>{
 const form=event.target.form;
 if(form?.dataset.kind==='quick'&&event.target.name==='start_timing')fleetAdjustChoice(form);
 if(form?.dataset.kind==='manual'&&event.target.name==='work_order_id'){
  const grid=form.querySelector('.form-grid'),choice=grid.querySelector('.fleet-choice-single');
  if(choice)choice.remove();
  const options=fleetSingleChooser(fleetRemaining(event.target.value));
  grid.insertAdjacentHTML('beforeend',options);
 }
});
const previousFleetOrders=v3OrdersTable;
v3OrdersTable=function(orders){
 if(!orders?.length)return empty('Nenhuma obra agendada neste período.');
 return '<div class="tblwrap"><table><thead><tr><th>Data e hora</th><th>Cliente / Obra</th><th>Máquinas</th><th>Horas previstas</th><th>Valor previsto</th><th>Ação</th></tr></thead><tbody>'+
 orders.map(o=>{
  const client=(state.data.clients||[]).find(x=>x.id===o.client_id);
  const assigned=fleetLinked(o.id),pending=fleetRemaining(o.id);
  return '<tr><td>'+datePt(o.planned_start)+'</td><td><strong>'+esc(o.title)+'</strong><br><span class="muted small">'+esc(client?.name||'')+'</span></td>'+
  '<td>'+assigned.map(m=>'<span class="fleet-chip">'+esc(m.code)+'</span>').join(' ')+'</td>'+
  '<td>'+hrs(o.expected_minutes*60000)+' / máquina</td><td>'+money(o.expected_minutes*o.hourly_cents*assigned.length/60)+'</td>'+
  '<td><div class="row-actions">'+(pending.length?'<button class="button primary sm" data-action="v3-start-form" data-id="'+o.id+'">Iniciar máquina</button>':'<span class="badge">Sem máquinas pendentes</span>')+
  (state.data.me.role!=='operator'&&o.status==='scheduled'?'<button class="button light sm" data-action="v3-order-form" data-id="'+o.id+'">Editar</button>':'')+
  '</div></td></tr>';
 }).join('')+'</tbody></table></div>';
};
const previousFleetSelected=v3SelectedSchedule;
v3SelectedSchedule=function(){
 const old=previousFleetSelected();
 const pairs=old.orders.map(o=>({o,n:fleetLinked(o.id).length||1}));
 return {...old,minutes:pairs.reduce((sum,x)=>sum+x.o.expected_minutes*x.n,0),
  cents:pairs.reduce((sum,x)=>sum+Math.round(x.o.expected_minutes*x.o.hourly_cents*x.n/60),0)};
};
const previousFleetOperation=renderOperation;
renderOperation=function(){
 const active=(state.data.jobs||[]).filter(j=>j.status!=='finished');
 const options=fleetAvailable(true);
 let html='<section class="panel"><div class="panel-head"><h2>Operação por máquina</h2><div class="row-actions"><button class="button primary sm" data-action="v3-start-form">+ Iniciar obra</button>'+
 '<button class="button light sm" data-nav="machines">Ver máquinas</button></div></div>'+
 '<p class="muted small">Cada máquina registra separadamente o motor ligado, pausas e encerramento. Você pode trabalhar com várias máquinas na mesma obra.</p>';
 if(!active.length)html+='<div class="counterbox"><div class="counter-label">Nenhuma máquina em operação</div><div class="counter">00:00:00</div>'+
 '<div class="counter-sub">'+options.length+' máquina(s) disponível(is)</div></div>';
 else html+='<div class="fleet-operations">'+active.map(j=>{
  const m=(state.data.machines||[]).find(m=>m.id===j.machine_id);
  return '<article class="fleet-operation"><div class="fleet-operation-title">'+
   (m&&fleetPhoto(m)?'<img src="'+esc(fleetPhoto(m))+'" alt="" />':'<span>🚜</span>')+
   '<div><h3>'+esc(m?.name||'Máquina')+'</h3><p class="muted small">'+esc(j.customer)+' · '+esc(j.description)+'</p></div>'+badge(j.status)+'</div>'+
   '<div class="counterbox"><div class="counter-label">Tempo do motor ligado</div><div class="counter" data-time="'+j.id+'">'+fmtTime(currentDuration(j))+'</div>'+
    '<div class="counter-sub">Acumulado: '+money(currentAmount(j))+'</div></div>'+
   '<div class="row-actions">'+(j.status==='running'?'<button class="button light" data-action="v3-pause-form" data-id="'+j.id+'">⏸ Desligar motor</button>':
   '<button class="button green" data-action="v3-resume" data-id="'+j.id+'">▶ Retomar motor</button>')+
   '<button class="button danger" data-action="v3-finish-form" data-id="'+j.id+'">Encerrar máquina</button></div></article>';
 }).join('')+'</div>';
 html+='<button class="button light" style="margin-top:16px" data-action="v3-ticket-form">Abrir chamado / esqueci uma leitura</button></section>';
 const scheduled=(state.data.work_orders||[]).filter(x=>['scheduled','in_progress'].includes(x.status)&&fleetRemaining(x.id).length);
 html+='<section class="panel"><div class="panel-head"><h2>Máquinas pendentes nas obras</h2>'+
 '<button class="button light sm" data-nav="calendar">Calendário</button></div>'+v3OrdersTable(scheduled.slice(0,10))+'</section>';
 return html;
};
const previousFleetDetails=showJob;
showJob=function(id){
 previousFleetDetails(id);
 const j=(state.data.jobs||[]).find(x=>x.id===id);
 const node=dialog.querySelector('.modal-inner .modal-head');
 if(j&&node)node.insertAdjacentHTML('afterend','<div class="notice" style="margin:10px 0">Máquina: <strong>'+esc(fleetName(j.machine_id))+'</strong></div>');
};
