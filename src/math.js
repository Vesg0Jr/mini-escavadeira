/** Valores em centavos, intervalos em milissegundos (horas são proporcionais aos segundos). */
export function segmentAmountCents(segments, now = Date.now()) {
  return Math.round(segments.reduce((total, s) => {
    const duration = Math.max(0, (s.end_ts ?? now) - s.start_ts);
    return total + duration * s.hourly_cents / 3_600_000;
  }, 0));
}
export function segmentDurationMs(segments, now = Date.now()) {
  return segments.reduce((sum, s) => sum + Math.max(0, (s.end_ts ?? now) - s.start_ts), 0);
}
export function maintenanceShares(items) {
  const total = items.reduce((s, x) => s + x.amount_cents, 0);
  const managerPaid = items.filter(x => x.payer_role === 'manager').reduce((s,x) => s + x.amount_cents,0);
  const adminPaid = total - managerPaid;
  // Reembolso líquido positivo = administrador deve ao gestor.
  return { total_cents:total, admin_share_cents: Math.round(total / 2), manager_share_cents: total - Math.round(total/2), admin_paid_cents:adminPaid, manager_paid_cents:managerPaid, admin_owes_manager_cents: Math.round(managerPaid/2) - Math.round(adminPaid/2) };
}
export function summarizeJobs(jobs, segments, adjustments, now=Date.now()) {
  const byJob = new Map();
  for (const s of segments) { const a = byJob.get(s.job_id) || []; a.push(s); byJob.set(s.job_id,a); }
  const adjMap = new Map();
  for(const a of adjustments) { const v=adjMap.get(a.job_id)||{ms:0,cents:0};v.ms+=a.delta_ms;v.cents+=a.delta_cents;adjMap.set(a.job_id,v); }
  return jobs.map(j=>{
    const ss=byJob.get(j.id)||[]; const adj=adjMap.get(j.id)||{ms:0,cents:0};
    return {...j, duration_ms:Math.max(0,segmentDurationMs(ss,now)+adj.ms), amount_cents:Math.max(0,segmentAmountCents(ss,now)+adj.cents), segments:ss, adjustments:adj};
  });
}
