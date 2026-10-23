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
    markSaved(value = revision) { savedRevision = value; },
  };
}
export function safeNext(role) {
  const fallback = role === 'BECO_ADMIN' ? 'curadoria.html' : 'area-expositor.html';
  const next = new URLSearchParams(location.search).get('next');
  if (!next) return fallback;
  try { const url = new URL(next, location.href); const file = url.pathname.split('/').pop().replace(/\.html$/, '');
    if (url.origin === location.origin && (role === 'EXHIBITOR' ? ['inscricao-expositor','area-expositor'].includes(file) : file === 'curadoria')) return url.pathname + url.search;
  } catch { /* use the role's default */ }
  return fallback;
}
export function bindForm(form, submit) {
  form?.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) busy(form.querySelector('[type=submit]'), () => submit(readForm(form), form), form.querySelector('[data-feedback]')); });
}
export function openDialog(title, content) {
  const dialog = document.createElement('dialog'); dialog.className = 'workflow-dialog';
  dialog.innerHTML = `<div class="dialog-heading"><h2>${escapeHtml(title)}</h2><button type="button" data-close aria-label="Fechar">×</button></div><div data-dialog-body>${content}</div>`;
  document.body.append(dialog); dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close',()=>dialog.remove()); dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();}); dialog.showModal(); return dialog;
}
export function downloadCsv(filename, rows) {
  const cell = value => `"${String(value ?? '').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
  const url = URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
