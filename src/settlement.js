// Locação: a tarifa por hora já é o valor que Renan deve pagar ao proprietário.
// Operador por conta de Renan; somente as manutenções são rateadas 50/50.
// Abater apenas pagamentos aprovados pelo proprietário.
export function settlementTotals(jobs, maintenance, payments) {
 const earned_cents=jobs.reduce((sum,j)=>sum+Number(j.amount_cents||0),0);
 // O preço de locação já incorpora o desconto combinado, não dividir novamente.
 const rental_due_cents=earned_cents;
 const hours_share_cents=rental_due_cents; // campo de compatibilidade
 const total_maintenance_cents=maintenance.reduce((sum,m)=>sum+Number(m.amount_cents||0),0);
 const admin_paid_maintenance_cents=maintenance.filter(m=>m.payer_role==='admin').reduce((sum,m)=>sum+Number(m.amount_cents||0),0);
 const manager_paid_maintenance_cents=total_maintenance_cents-admin_paid_maintenance_cents;
 // Valores positivos: Renan reembolsa o administrador; negativos: administrador deve a Renan.
 const maintenance_adjustment_cents=Math.round(admin_paid_maintenance_cents/2)-Math.round(manager_paid_maintenance_cents/2);
 const confirmed=payments.filter(p=>!p.deleted_at&&p.status==='approved');
 const pending=payments.filter(p=>!p.deleted_at&&p.status==='pending');
 const paid_cents=confirmed.reduce((sum,p)=>sum+Number(p.amount_cents||0),0);
 const pending_cents=pending.reduce((sum,p)=>sum+Number(p.amount_cents||0),0);
 const balance_cents=rental_due_cents+maintenance_adjustment_cents-paid_cents;
 return {
  earned_cents,
  rental_due_cents,
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
