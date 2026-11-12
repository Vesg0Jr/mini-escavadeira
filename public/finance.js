/* Acerto financeiro 50/50: gestor envia comprovante, proprietário confere.
   As funções de cálculo vêm do servidor; nunca calcular abatimentos pelo navegador. */
const previousFinanceForm=openForm;
const previousFinanceClick=clickAction;

renderPayments=function(){
 const d=state.data,p=d.payments||[],fin=d.summary?.settlement||{};
 const owner=!!d.can_approve_payments,manager=d.me.role==='manager';
 const pending=p.filter(x=>x.status==='pending');
 const cards='<div class="cards">'+
  metric('Parte do gestor pelas horas (50%)',money(fin.hours_share_cents),'Metade do faturamento das horas')+
  metric('Acerto das manutenções',money(fin.maintenance_adjustment_cents),'Positivo: gestor deve; negativo: crédito')+
  metric('Pagamentos aprovados',money(fin.paid_cents),'Somente valores já conferidos')+
  metric('Renan ainda deve',money(fin.manager_owes_cents),'Saldo após pagamentos e manutenções')+
  metric('Crédito de Renan',money(fin.manager_credit_cents),'Saldo favorável ao gestor')+
  metric('Pagamentos pendentes',money(fin.pending_cents),pending.length+' aguardando conferência')+
 '</div>';
 let html=cards+'<section class="panel"><div class="panel-head"><div><h2>Pagamentos e comprovantes</h2>'+
  '<p class="muted small">Cada pagamento é conferido antes de abater o saldo.</p></div>'+
  '<button class="button primary sm" data-action="payment-form">+ Registrar pagamento</button></div>';
 if(p.length){
  html+='<div class="tblwrap"><table><thead><tr><th>Data</th><th>Valor</th><th>Horas informadas</th><th>Situação</th>'+
   '<th>Comprovante</th><th>Observações</th><th>Ações</th></tr></thead><tbody>'+
   p.map(x=>{
    const status=x.status==='pending'?'Aguardando aprovação':x.status==='approved'?'Aprovado':'Recusado';
    const cls=x.status==='pending'?'pending':x.status==='approved'?'approved':'rejected';
    const ownPending=x.status==='pending'&&x.created_by===d.me.id;
    const actions=owner&&x.status==='pending'?
      '<button class="button green sm" data-action="finance-approve" data-id="'+x.id+'">✓ Conferir / aprovar</button> '+
      '<button class="button light sm" data-action="finance-reject" data-id="'+x.id+'">Recusar</button>':'';
    const edit=ownPending?'<button class="button light sm" data-action="payment-form" data-id="'+x.id+'">Corrigir</button>':'';
    const del=owner?'<button class="button flat sm text-danger" data-action="delete-payment" data-id="'+x.id+'">Excluir</button>':'';
    return '<tr><td>'+dateOnly(x.payment_date)+'</td><td><strong>'+money(x.amount_cents)+'</strong></td>'+
      '<td>'+(x.paid_minutes?hrs(x.paid_minutes*60000):'—')+'</td>'+
      '<td><span class="finance-status '+cls+'">'+status+'</span>'+
      (x.status==='rejected'&&x.review_notes?'<div class="muted small">Motivo: '+esc(x.review_notes)+'</div>':'')+
      (x.status==='approved'&&x.reviewed_at?'<div class="muted small">Conferido em '+datePt(x.reviewed_at)+'</div>':'')+'</td>'+
      '<td>'+tableFile(x.file_id)+'</td><td>'+esc(x.notes||'—')+'</td>'+
      '<td><div class="row-actions">'+actions+edit+del+'</div></td></tr>';
   }).join('')+'</tbody></table></div>';
 }else html+=empty('Ainda não há pagamentos registrados.');
 html+='</section><div class="notice">'+
   (manager?'Envie o comprovante para análise. O saldo só será atualizado quando o pagamento for aprovado.':
    'Confira o comprovante e o valor antes de aprovar. Se houver erro, recuse com uma justificativa para que o gestor faça novo lançamento.')+
   '</div>';
 return html;
};
function financeForm(recordId){
 const d=state.data,x=(d.payments||[]).find(p=>p.id===recordId);
 if(x&&!(x.status==='pending'&&x.created_by===d.me.id)){
  notify('Somente pagamentos pendentes enviados por você podem ser corrigidos.',true);return;
 }
 const required=d.me.role==='manager'&&!x;
 const fields=field('Valor pago (R$) *','amount',x?(x.amount_cents/100).toFixed(2):'','required type="number" min="0.01" step="0.01"')+
   field('Data do pagamento *','payment_date',x?.payment_date||today(),'required type="date"')+
   field('Horas correspondentes (opcional)','paid_hours',x?Number((x.paid_minutes/60).toFixed(4)):'0','type="number" min="0" step="0.0001"')+
   textarea('Observações','notes',x?.notes)+
   '<div class="field wide">'+
   (x?.file_id?'<p>Comprovante já anexado: '+tableFile(x.file_id)+'</p>':'')+
   '<label>Comprovante do pagamento '+(required?'*':'')+'</label>'+
   '<input type="file" name="payment_file" accept="image/jpeg,image/png,image/webp,application/pdf" '+(required?'required':'')+' />'+
   '<small>Foto ou PDF do comprovante, até 8 MB.</small></div>';
 const note='<div class="notice">O pagamento será marcado como <strong>'+(d.me.role==='manager'?'aguardando aprovação':'aprovado pelo administrador')+
  '</strong>. Somente pagamentos aprovados abatem o saldo.</div>';
 modal(x?'Corrigir pagamento pendente':'Registrar pagamento',note+formShell('finance-payment',fields,x?'Salvar correção':'Enviar pagamento'));
 dialog.dataset.financeId=x?.id||'';
}
function financeReview(recordId,action){
 const d=state.data;
 if(!d.can_approve_payments){notify('Somente o administrador proprietário pode conferir pagamentos.',true);return;}
 const x=(d.payments||[]).find(p=>p.id===recordId);
 if(!x||x.status!=='pending'){notify('Pagamento não está mais pendente.',true);return;}
 const details='<div class="finance-review-details">'+
  '<div><small>Valor enviado</small><strong>'+money(x.amount_cents)+'</strong></div>'+
  '<div><small>Data</small><strong>'+dateOnly(x.payment_date)+'</strong></div>'+
  '<div><small>Comprovante</small><strong>'+tableFile(x.file_id)+'</strong></div>'+
  '<div><small>Observações</small><strong>'+esc(x.notes||'Sem observações')+'</strong></div></div>';
 const confirm=action==='approve';
 const msg=confirm?'<div class="notice warn">Ao aprovar, este valor será abatido imediatamente do saldo que Renan deve.</div>':
  '<div class="notice">Ao recusar, este valor não será abatido. Renan poderá enviar outro comprovante.</div>';
 const form='<form id="finance-review-form"><div class="form-grid">'+
  (!confirm?'<div class="field wide"><label>Motivo da recusa *</label><textarea name="reason" required minlength="4" maxlength="500" placeholder="Explique o que precisa ser corrigido"></textarea></div>':'')+
  '</div><div class="modal-footer"><button type="button" class="button light" data-action="close-modal">Cancelar</button>'+
  '<button class="button '+(confirm?'primary':'danger')+'" type="submit">'+(confirm?'✓ Aprovar e abater saldo':'Recusar pagamento')+'</button></div></form>';
 modal(confirm?'Conferir e aprovar pagamento':'Recusar pagamento',details+msg+form);
 dialog.dataset.financeId=recordId;
 dialog.dataset.financeAction=action;
}
openForm=function(type,recordId){
 if(type==='payment')return financeForm(recordId);
 return previousFinanceForm(type,recordId);
};
clickAction=async function(action,recordId){
 if(action==='finance-approve')return financeReview(recordId,'approve');
 if(action==='finance-reject')return financeReview(recordId,'reject');
 return previousFinanceClick(action,recordId);
};
dialog.addEventListener('submit',async event=>{
 const form=event.target,kind=form?.dataset?.kind;
 if(kind!=='finance-payment'&&form?.id!=='finance-review-form')return;
 event.preventDefault();event.stopImmediatePropagation();
 if(state.pending)return;
 const button=form.querySelector('button[type="submit"]');
 button.disabled=true;state.pending=true;
 try{
  if(kind==='finance-payment'){
   const id=dialog.dataset.financeId;
   const data=Object.fromEntries(new FormData(form));
   const hours=Number(data.paid_hours||0);
   if(!Number.isFinite(hours)||hours<0||hours>100000)throw new Error('Confira as horas informadas.');
   const payload={amount:data.amount,payment_date:data.payment_date,paid_minutes:Math.round(hours*60),notes:data.notes};
   const file=form.querySelector('[name="payment_file"]')?.files?.[0];
   if(file){
    const fd=new FormData();fd.set('file',file);
    const uploaded=await api('/upload','POST',fd);payload.file_id=uploaded.id;
   }else if(id){
    payload.file_id=(state.data.payments||[]).find(p=>p.id===id)?.file_id||null;
   }
   await api('/payments'+(id?'/'+id:''),id?'PUT':'POST',payload);
   dialog.close();notify(state.data.me.role==='manager'?'Pagamento enviado para conferência.':'Pagamento registrado e confirmado.');
  }else{
   const id=dialog.dataset.financeId,action=dialog.dataset.financeAction;
   await api('/payments/'+id+'/'+action,'POST',{
     reason:action==='reject'?String(new FormData(form).get('reason')||'').trim():''
   });
   dialog.close();
   notify(action==='approve'?'Pagamento aprovado! Saldo atualizado.':'Pagamento recusado. O valor não foi abatido.');
  }
  await reload();
 }catch(e){notify(e.message,true);button.disabled=false}
 finally{state.pending=false}
},true);
