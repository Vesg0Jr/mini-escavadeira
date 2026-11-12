// Acerto financeiro: metade do faturamento das horas, manutenção meio a meio
// e pagamentos somente após aprovação explícita do proprietário.
export function settlementTotals(jobs, maintenance, payments) {
 const earned_cents=jobs.reduce((sum,j)=>sum+Number(j.amount_cents||0),0);
 const hours_share_cents=Math.round(earned_cents/2);
 const total_maintenance_cents=maintenance.reduce((sum,m)=>sum+Number(m.amount_cents||0),0);
 const admin_paid_maintenance_cents=maintenance.filter(m=>m.payer_role==='admin').reduce((sum,m)=>sum+Number(m.amount_cents||0),0);
 const manager_paid_maintenance_cents=total_maintenance_cents-admin_paid_maintenance_cents;
 // Valores positivos: Renan reembolsa o administrador; negativos: administrador deve a Renan.
 const maintenance_adjustment_cents=Math.round(admin_paid_maintenance_cents/2)-Math.round(manager_paid_maintenance_cents/2);
 const confirmed=payments.filter(p=>!p.deleted_at&&p.status==='approved');
 const pending=payments.filter(p=>!p.deleted_at&&p.status==='pending');
 const paid_cents=confirmed.reduce((sum,p)=>sum+Number(p.amount_cents||0),0);
 const pending_cents=pending.reduce((sum,p)=>sum+Number(p.amount_cents||0),0);
 const balance_cents=hours_share_cents+maintenance_adjustment_cents-paid_cents;
 return {
  earned_cents,
  hours_share_cents,
  total_maintenance_cents,
  admin_maintenance_share_cents:Math.round(total_maintenance_cents/2),
  manager_maintenance_share_cents:total_maintenance_cents-Math.round(total_maintenance_cents/2),
  admin_paid_maintenance_cents,
  manager_paid_maintenance_cents,
  maintenance_adjustment_cents,
  paid_cents,
  pending_cents,
  balance_cents,
  manager_owes_cents:Math.max(0,balance_cents),
  manager_credit_cents:Math.max(0,-balance_cents),
  pending_count:pending.length
 };
}
