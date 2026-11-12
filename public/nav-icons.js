/* Ícones de navegação unificados: 2D, monocromáticos e sem emoji. */
const formaNavIcons={
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>',
 operation:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3M18.5 5.5 20 4"/>',
 jobs:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5v-2h6v2M9 10h6M9 14h6M9 18h4"/>',
 machines:'<path d="M3 19h15M4.5 19v-3.4H14l2 3.4M6.5 15.6V10h5l1.2 5.6M9 10l4.1-4.5 2 1M15.1 6.5l3.1 3-1.3 2.6M16.9 12.1l2.1 1.3-1 2.1"/><circle cx="7" cy="19" r="1.2"/><circle cx="13" cy="19" r="1.2"/>',
 clients:'<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2.5a7 7 0 0 1 14 0V21H5Z"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M17 14h.01M7 18h2M12 18h2"/>',
 tickets:'<path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4.5-1.2L3 20l1.2-4a8.5 8.5 0 1 1 15.8-4.5Z"/><path d="M9 10h6M9 14h4"/>',
 maintenance:'<path d="M20.3 6.4a5 5 0 0 1-6.7 6.7l-7.8 7.8a2 2 0 0 1-2.8-2.8l7.8-7.8a5 5 0 0 1 6.7-6.7l-3 3 2.5 2.5 3.3-2.7Z"/>',
 payments:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3ZM17 11a3 3 0 0 0 0-6M18 14a5 5 0 0 1 3 4.6V20"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M10.2 2.8h3.6l.6 2.3q.8.3 1.5.9l2.3-.6 2 3.1-1.7 1.7q.3.8.3 1.8t-.3 1.8l1.7 1.7-2 3.1-2.3-.6q-.7.6-1.5.9l-.6 2.3h-3.6l-.6-2.3q-.8-.3-1.5-.9l-2.3.6-2-3.1 1.7-1.7q-.3-.8-.3-1.8t.3-1.8L3.8 8.5l2-3.1 2.3.6q.7-.6 1.5-.9Z"/>'
};
const previousFormaIconsRender=render;
render=function(){
 previousFormaIconsRender();
 document.querySelectorAll('.sidebar .nav button[data-nav]').forEach(button=>{
  const name=button.dataset.nav;
  const symbol=formaNavIcons[name];
  if(!symbol)return;
  const span=button.querySelector('span');
  if(!span)return;
  span.className='forma-nav-icon';
  span.removeAttribute('style');
  span.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">'+symbol+'</svg>';
 });
};
