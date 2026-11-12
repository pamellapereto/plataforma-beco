import { api } from '../models/api.model.js';
import { bindForm, busy, date, escapeHtml as h, label, notice, status } from '../ui.js';
import { applicationDetailHtml } from './application.controller.js';

const transitions={SUBMITTED:['PHOTO_REVIEW','UNDER_REVIEW','AWAITING_UPDATE','WAITLISTED','APPROVED','DECLINED'],PHOTO_REVIEW:['UNDER_REVIEW','AWAITING_UPDATE','DECLINED'],UNDER_REVIEW:['AWAITING_UPDATE','WAITLISTED','APPROVED','DECLINED'],AWAITING_UPDATE:['PHOTO_REVIEW','UNDER_REVIEW','DECLINED'],WAITLISTED:['APPROVED','DECLINED'],APPROVED:['DECLINED','CANCELLED'],CONFIRMED:['CANCELLED']};
const finalStatuses=new Set(['WAITLISTED','APPROVED','CONFIRMED','DECLINED','CANCELLED']);

export function applicationChecklist(detail) {
  const app=detail.application;
  const media=detail.media||[];
  const exception=detail.exceptionRequest;
  const submitted=app.status!=='DRAFT';
  const mediaReviewed=media.length>0&&media.every(item=>item.review_status!=='PENDING');
  const hasMediaProblem=media.some(item=>['CHANGES_REQUESTED','REJECTED'].includes(item.review_status));
  const exceptionResolved=!exception||exception.status!=='PENDING';
  const decisionMade=finalStatuses.has(app.status);
  const spaceRequired=['APPROVED','CONFIRMED'].includes(app.status);
  return [
    {label:'Formulário enviado',detail:submitted?'A candidatura foi enviada para análise.':'O formulário ainda está em rascunho.',state:submitted?'complete':'pending'},
    {label:'Imagens revisadas',detail:!media.length?'Nenhuma imagem foi enviada.':hasMediaProblem?'Há imagens com ajustes ou recusa.':mediaReviewed?'Todas as imagens foram analisadas.':`${media.filter(item=>item.review_status==='PENDING').length} imagem(ns) aguardando análise.`,state:mediaReviewed?'complete':hasMediaProblem?'attention':'pending'},
    {label:'Pedido especial analisado',detail:!exception?'Não há pedido especial nesta candidatura.':exceptionResolved?'O pedido especial já recebeu uma decisão.':'O pedido especial aguarda decisão.',state:exceptionResolved?'complete':'attention'},
    {label:'Decisão da curadoria',detail:decisionMade?`Decisão registrada: ${label(app.status)}.`:'A decisão final ainda não foi registrada.',state:decisionMade?'complete':'pending'},
    {label:'Espaço definido',detail:app.assigned_space_id?'Um espaço foi atribuído à candidatura.':spaceRequired?'A candidatura foi aprovada, mas ainda não possui espaço.':'A definição será necessária após a aprovação.',state:app.assigned_space_id?'complete':spaceRequired?'attention':'pending'}
  ];
}

function checklistHtml(items) {
  const complete=items.filter(item=>item.state==='complete').length;
  const percentage=Math.round(complete/items.length*100);
  return `<div class="review-progress" aria-label="${complete} de ${items.length} etapas concluídas"><span style="width:${percentage}%"></span></div><p><b>${complete} de ${items.length}</b> verificações concluídas</p><ul class="review-checklist">${items.map(item=>`<li class="${item.state}"><span class="review-checklist__icon" aria-hidden="true">${item.state==='complete'?'✓':item.state==='attention'?'!':'·'}</span><span><b>${h(item.label)}</b><small>${h(item.detail)}</small></span></li>`).join('')}</ul>`;
}

function timelineHtml(history) {
  if(!history.length)return '<p class="review-empty">Nenhuma movimentação registrada.</p>';
  return `<ol class="review-timeline">${[...history].reverse().map(event=>`<li><time>${h(date(event.created_at))}</time>${event.status?`<div>${status(event.status)}</div>`:''}<p class="review-timeline__actor">${h(event.actor?.full_name||event.actor?.email||(event.actor_user_id?'Usuário não identificado':'Sistema'))}</p>${event.note?`<p class="review-timeline__note">${h(event.note)}</p>`:''}${event.is_visible_to_exhibitor===false?'<small>Registro interno</small>':''}</li>`).join('')}</ol>`;
}

function summaryHtml(detail) {
  const app=detail.application;const exhibitor=detail.exhibitor;
  return `<div class="review-summary"><article><span>Candidato</span><b>${h(exhibitor?.display_name||app.applicant_name||'Não informado')}</b></article><article><span>Contato</span><b>${h(exhibitor?.phone||app.whatsapp||'Não informado')}</b></article><article><span>Categoria</span><b>${h((exhibitor?.categories||[]).map(item=>item.name).join(', ')||'Não informada')}</b></article><article><span>Cidade</span><b>${h([exhibitor?.city,exhibitor?.state].filter(Boolean).join(' · ')||'Não informada')}</b></article><article><span>Estrutura solicitada</span><b>${h(app.requested_space_type||'A definir')}</b></article><article><span>Envio</span><b>${h(date(app.submitted_at||app.created_at))}</b></article></div>`;
}

function actionsHtml(detail,spaces) {
  const app=detail.application;
  const decisionOptions=(transitions[app.status]||[]).map(value=>`<option value="${value}">${h(label(value))}</option>`).join('');
  const assignable=spaces.filter(space=>space.is_available||space.id===app.assigned_space_id);
  return `${decisionOptions?`<form data-decision><h3>Decisão da curadoria</h3><label class="form-field">Próxima etapa<select name="status" required><option value="">Selecione</option>${decisionOptions}</select></label><label class="form-field">Orientação ao expositor<textarea name="note" maxlength="3000" placeholder="Explique a decisão ou os ajustes necessários"></textarea></label><label class="check-row"><input type="checkbox" name="visibleToExhibitor" checked><span>Mostrar orientação ao expositor</span></label><p data-feedback></p><button class="btn btn-primary" type="submit">Salvar decisão</button></form>`:'<p class="review-empty">Não há novas transições disponíveis para esta candidatura.</p>'}
  ${['APPROVED','CONFIRMED'].includes(app.status)?`<form data-assign><h3>Espaço da edição</h3><label class="form-field">Espaço<select name="spaceId" required><option value="">Selecione</option>${assignable.map(space=>`<option value="${h(space.id)}" ${space.id===app.assigned_space_id?'selected':''}>${h(space.code)} · ${h(space.width_m)} × ${h(space.height_m)} m</option>`).join('')}</select></label><p data-feedback></p><button class="btn btn-primary" type="submit">Atribuir e confirmar espaço</button>${app.assigned_space_id?'<button class="btn btn-outline" data-release type="button">Liberar espaço</button>':''}</form>`:''}`;
}

async function render(root,id) {
  const detail=await api.request(`/curation/applications/${encodeURIComponent(id)}`);
  const app=detail.application;
  const spaces=await api.request(`/curation/fair-editions/${encodeURIComponent(app.fair_edition_id)}/spaces`);
  const candidate=detail.exhibitor?.display_name||app.applicant_name||'Candidatura';
  document.title=`${candidate} | Análise da candidatura`;
  root.innerHTML=`<header class="private-heading review-heading" id="resumo"><div><span class="eyebrow">Análise da candidatura</span><h1>${h(candidate)}</h1><div class="review-heading__meta">${status(app.status)}<span>Protocolo ${h(app.id)}</span></div></div><a class="btn btn-secondary" href="curadoria.html#inscricoes">Voltar à lista</a></header><div class="review-layout"><div class="review-main"><section class="review-card"><h2>Resumo do candidato</h2>${summaryHtml(detail)}</section><section class="review-card" id="respostas"><h2>Respostas, produtos e documentos</h2>${applicationDetailHtml(detail,{includeHistory:false,includeStatus:false})}</section><section class="review-card" id="historico"><h2>Linha do tempo da análise</h2>${timelineHtml(detail.history||[])}</section></div><aside class="review-side"><section class="review-card"><h2>Pendências</h2>${checklistHtml(applicationChecklist(detail))}</section><section class="review-card review-actions" id="decisao"><h2>Decisão e espaço</h2><p data-global-feedback aria-live="polite"></p>${actionsHtml(detail,spaces)}</section></aside></div>`;
  bindForm(root.querySelector('[data-decision]'),async data=>{await api.request(`/curation/applications/${id}`,{method:'PATCH',body:{...data,visibleToExhibitor:!!data.visibleToExhibitor}});await render(root,id);});
  bindForm(root.querySelector('[data-assign]'),async data=>{await api.request(`/curation/applications/${id}/space`,{method:'PUT',body:data});await render(root,id);});
  const release=root.querySelector('[data-release]');if(release)release.onclick=()=>busy(release,async()=>{await api.request(`/curation/applications/${id}/space`,{method:'DELETE'});await render(root,id);},root.querySelector('[data-global-feedback]'));
  for(const media of detail.media||[]){const slot=root.querySelector(`[data-media-actions="${CSS.escape(media.id)}"]`);if(!slot)continue;slot.innerHTML='<form><label class="form-field">Análise<select name="status"><option value="APPROVED">Aprovar</option><option value="CHANGES_REQUESTED">Solicitar ajuste</option><option value="REJECTED">Rejeitar</option></select></label><label class="form-field">Orientação<textarea name="note" maxlength="3000"></textarea></label><p data-feedback></p><button class="btn btn-small btn-secondary" type="submit">Salvar análise</button></form>';bindForm(slot.querySelector('form'),async data=>{await api.request(`/curation/media/${media.id}`,{method:'PATCH',body:data});await render(root,id);});}
  if(detail.exceptionRequest?.status==='PENDING'){const section=root.querySelector('#respostas');const form=document.createElement('form');form.innerHTML='<h3>Decidir pedido especial</h3><label class="form-field">Decisão<select name="status"><option value="APPROVED">Aprovar pedido</option><option value="DECLINED">Recusar pedido</option></select></label><label class="form-field">Orientação<textarea name="note" maxlength="3000"></textarea></label><p data-feedback></p><button class="btn btn-secondary" type="submit">Salvar decisão do pedido</button>';section.append(form);bindForm(form,async data=>{await api.request(`/curation/exception-requests/${detail.exceptionRequest.id}`,{method:'PATCH',body:data});await render(root,id);});}
}

export async function initializeCurationApplication() {
  const root=document.querySelector('[data-curation-application-root]');if(!root)return;
  const id=new URLSearchParams(location.search).get('id');
  if(!id){root.innerHTML='<div class="workflow-empty"><h1>Candidatura não informada</h1><p>Abra a análise a partir da lista de inscrições.</p><a class="btn btn-primary" href="curadoria.html#inscricoes">Voltar às inscrições</a></div>';return;}
  try{await render(root,id);}catch(error){root.innerHTML='<div class="workflow-empty"><h1>Não foi possível abrir a candidatura</h1><p data-feedback></p><a class="btn btn-primary" href="curadoria.html#inscricoes">Voltar às inscrições</a></div>';notice(root.querySelector('[data-feedback]'),error.message);}
}
