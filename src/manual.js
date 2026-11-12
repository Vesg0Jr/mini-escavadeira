// Apuração manual em minutos inteiros, sem cobrar pausas.
export function manualTotals(startMs,endMs,pauseMinutes,hoursOverride,hourlyCents) {
 const elapsed=(endMs-startMs)/60000;
 if(!Number.isFinite(elapsed)||elapsed<=0||elapsed>72*60||!Number.isInteger(elapsed))throw new Error('Horários inválidos: início anterior ao fim e duração máxima de 72 horas.');
 const pause=Number(pauseMinutes);
 if(!Number.isInteger(pause)||pause<0||pause>=elapsed)throw new Error('Pausas precisam estar em minutos inteiros e ser menores que o período.');
 const available=elapsed-pause;
 let worked=available;
 if(hoursOverride!==null&&hoursOverride!==undefined&&String(hoursOverride).trim()!==''){
  const h=Number(String(hoursOverride).replace(',','.'));
  if(!Number.isFinite(h)||h<=0)throw new Error('Quantidade de horas inválida.');
  worked=Math.round(h*60);
  if(worked<1||worked>available)throw new Error('Horas digitadas precisam ser maiores que zero e não superar o período sem pausas.');
 }
 if(!Number.isInteger(hourlyCents)||hourlyCents<=0)throw new Error('Tarifa inválida.');
 return {elapsed_minutes:elapsed,pause_minutes:pause,worked_minutes:worked,amount_cents:Math.round(worked*hourlyCents/60)};
}
