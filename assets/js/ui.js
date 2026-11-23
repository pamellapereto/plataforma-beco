export const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const labels = {DRAFT:'Rascunho',PUBLISHED:'Publicada',REGISTRATION_OPEN:'Inscrições abertas',CURATION:'Em curadoria',FINISHED:'Encerrada',SUBMITTED:'Inscrição recebida',PHOTO_REVIEW:'Fotos em análise',UNDER_REVIEW:'Em análise',AWAITING_UPDATE:'Ajustes solicitados',WAITLISTED:'Lista de espera',APPROVED:'Aprovado',CONFIRMED:'Confirmado',DECLINED:'Não selecionado',CANCELLED:'Cancelado',PENDING:'Em análise',SUSPENDED:'Suspenso',CHANGES_REQUESTED:'Ajuste solicitado',REJECTED:'Rejeitada'};
export const label = value => labels[value] || value;
export const date = value => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value)) : 'A definir';
export const status = value => `<span class="status ${['APPROVED','CONFIRMED'].includes(value)?'approved':['CANCELLED','DECLINED','REJECTED','SUSPENDED'].includes(value)?'rejected':'pending'}">${escapeHtml(label(value))}</span>`;
export const field = (name, title, value = '', type = 'text', attrs = '') => `<label class="form-field">${escapeHtml(title)}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}></label>`;
export function notice(container, message, success = false) {
  if (!container) return;
  container.textContent = message;
  container.className = `workflow-feedback ${success ? 'success' : 'error'}`;
  container.setAttribute('role', success ? 'status' : 'alert');
}
export async function busy(button, action, feedback) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try { return await action(); } catch (error) { notice(feedback, error.message || 'Não foi possível concluir. Tente novamente.'); }
  finally { if (button?.isConnected) button.disabled = false; }
}
export const readForm = form => Object.fromEntries(new FormData(form));
export function trackUnsavedChanges(form) {
  let revision = 0;
  let savedRevision = 0;
  const changed = () => { revision += 1; };
  const warn = event => {
    if (revision === savedRevision) return;
    event.preventDefault();
    event.returnValue = '';
  };
  form.addEventListener('input', changed);
  form.addEventListener('change', changed);
  window.addEventListener('beforeunload', warn);
  return {
    get revision() { return revision; },
    get hasUnsavedChanges() { return revision !== savedRevision; },
    markSaved(value = revision) { savedRevision = value; },
  };
}
export function protectUnsavedNavigation(form,message='Existem alterações que ainda não foram salvas. Deseja sair sem salvar?'){
  const state=trackUnsavedChanges(form);
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(!link||link.target==='_blank'||!state.hasUnsavedChanges)return;
    if(confirm(message)){state.markSaved();return;}
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  return state;
}
export function mountAdminSidebar(activePage){
  const sidebar=document.querySelector('.private-sidebar');if(!sidebar)return;
  sidebar.setAttribute('aria-label','Navegação da administração');
  sidebar.innerHTML=`<a class="brand" href="index.html"><span class="brand-symbol">B</span><span>BECO<br>memória viva</span></a><span class="private-nav-label">Painel</span><a href="curadoria.html#visao-geral">Visão geral</a><details class="private-nav-group"><summary>Feiras e edições</summary><div class="private-nav-submenu"><a href="curadoria.html#feiras">Gestão de feiras</a><a href="curadoria.html#inscricoes">Inscrições e curadoria</a><a href="curadoria.html#espacos">Espaços da edição</a><a href="curadoria.html#presencas">Presença e avaliações</a></div></details><a href="curadoria.html#expositores">Expositores</a><span class="private-nav-label">Conteúdo</span><details class="private-nav-group" open><summary>Edição de páginas</summary><div class="private-nav-submenu"><a href="personalizar-home.html" ${activePage==='home'?'class="active" aria-current="page"':''}>Seção Início</a><a href="editar-sobre.html" ${activePage==='about'?'class="active" aria-current="page"':''}>Seção Sobre</a></div></details><span class="private-nav-label">Site</span><a href="index.html">Ir para o site</a>`;
  if(!document.querySelector('.private-menu-toggle')){const button=document.createElement('button');button.type='button';button.className='private-menu-toggle';button.setAttribute('aria-controls','private-navigation');button.setAttribute('aria-expanded','false');button.innerHTML='<span aria-hidden="true">☰</span><span>Menu</span>';sidebar.id='private-navigation';document.body.prepend(button);button.onclick=()=>{const open=document.body.classList.toggle('private-menu-open');button.setAttribute('aria-expanded',String(open));};sidebar.addEventListener('click',event=>{if(event.target.closest('a')){document.body.classList.remove('private-menu-open');button.setAttribute('aria-expanded','false');}});}
}
export function safeNext(role) {
  const fallback = role === 'BECO_ADMIN' ? 'curadoria.html' : 'area-expositor.html';
  const next = new URLSearchParams(location.search).get('next');
  if (!next) return fallback;
  try { const url = new URL(next, location.href); const file = url.pathname.split('/').pop().replace(/\.html$/, '');
    if (url.origin === location.origin && (role === 'EXHIBITOR' ? ['inscricao-expositor','area-expositor'].includes(file) : ['curadoria','analise-candidatura','personalizar-home','editar-sobre'].includes(file))) return url.pathname + url.search;
  } catch { /* use the role's default */ }
  return fallback;
}
export function bindForm(form, submit) {
  form?.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) busy(form.querySelector('[type=submit]'), () => submit(readForm(form), form), form.querySelector('[data-feedback]')); });
}
export function openDialog(title, content) {
  const previousOverflow = document.documentElement.style.overflow;
  const dialog = document.createElement('dialog'); dialog.className = 'workflow-dialog';
  dialog.innerHTML = `<div class="dialog-heading"><h2>${escapeHtml(title)}</h2><button type="button" data-close aria-label="Fechar">×</button></div><div data-dialog-body>${content}</div>`;
  document.body.append(dialog);
  document.documentElement.style.overflow = 'hidden';
  const requestClose=()=>{if(typeof dialog.beforeWorkflowClose==='function'&&!dialog.beforeWorkflowClose())return;dialog.close();};
  dialog.requestWorkflowClose=requestClose;
  dialog.querySelector('[data-close]').onclick = requestClose;
  dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
  dialog.addEventListener('close',()=>{dialog.remove();document.documentElement.style.overflow=previousOverflow;}); dialog.addEventListener('click',e=>{if(e.target===dialog)requestClose();}); dialog.showModal(); return dialog;
}
export function downloadCsv(filename, rows) {
  const cell = value => `"${String(value ?? '').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
  const url = URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
