import { api } from '../models/api.model.js';
import { bindForm, busy, date, escapeHtml as h, label, notice, openDialog, status } from '../ui.js';
import { applicationDetailHtml } from './application.controller.js';

const transitions={SUBMITTED:['PHOTO_REVIEW','UNDER_REVIEW','AWAITING_UPDATE','WAITLISTED','APPROVED','DECLINED'],PHOTO_REVIEW:['UNDER_REVIEW','AWAITING_UPDATE','DECLINED'],UNDER_REVIEW:['AWAITING_UPDATE','WAITLISTED','APPROVED','DECLINED'],AWAITING_UPDATE:['PHOTO_REVIEW','UNDER_REVIEW','DECLINED'],WAITLISTED:['APPROVED','DECLINED'],APPROVED:['DECLINED','CANCELLED'],CONFIRMED:['CANCELLED']};
const finalStatuses=new Set(['WAITLISTED','APPROVED','CONFIRMED','DECLINED','CANCELLED']);

function ensureSubmittedFormStyles() {
  if(document.querySelector('link[data-submitted-form-styles]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='assets/submitted-form-dialog.css';
  link.dataset.submittedFormStyles='';
  document.head.append(link);
}

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
    {label:'Formulário enviado',detail:submitted?'A candidatura foi enviada para análise.':'O formulário ainda está em rascunho.',state:submitted?'complete':'pending',action:'form'},
    {label:'Imagens revisadas',detail:!media.length?'Nenhuma imagem foi enviada.':hasMediaProblem?'Há imagens com ajustes ou recusa.':mediaReviewed?'Todas as imagens foram analisadas.':`${media.filter(item=>item.review_status==='PENDING').length} imagem(ns) aguardando análise.`,state:mediaReviewed?'complete':hasMediaProblem?'attention':'pending'},
    {label:'Pedido especial analisado',detail:!exception?'Não há pedido especial nesta candidatura.':exceptionResolved?'O pedido especial já recebeu uma decisão.':'O pedido especial aguarda decisão.',state:exceptionResolved?'complete':'attention'},
    {label:'Decisão da curadoria',detail:decisionMade?`Decisão registrada: ${label(app.status)}.`:'A decisão final ainda não foi registrada.',state:decisionMade?'complete':'pending'},
    {label:'Espaço definido',detail:app.assigned_space_id?'Um espaço foi atribuído à candidatura.':spaceRequired?'A candidatura foi aprovada, mas ainda não possui espaço.':'A definição será necessária após a aprovação.',state:app.assigned_space_id?'complete':spaceRequired?'attention':'pending'}
  ];
}

function checklistHtml(items) {
  const complete=items.filter(item=>item.state==='complete').length;
  const percentage=Math.round(complete/items.length*100);
  return `<div class="review-progress" aria-label="${complete} de ${items.length} etapas concluídas"><span style="width:${percentage}%"></span></div><p><b>${complete} de ${items.length}</b> verificações concluídas</p><ul class="review-checklist">${items.map(item=>`<li class="${item.state}${item.action?' is-actionable':''}">${item.action?`<button type="button" data-checklist-action="${h(item.action)}" aria-label="Consultar ${h(item.label)}">`:''}<span class="review-checklist__icon" aria-hidden="true">${item.state==='complete'?'✓':item.state==='attention'?'!':'·'}</span><span><b>${h(item.label)}</b><small>${h(item.detail)}</small></span>${item.action?'</button>':''}</li>`).join('')}</ul>`;
}

function hasAnswer(value) {
  return value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length>0);
}

function conditionState(field,answersByKey) {
  const condition=field.conditional_logic||{};
  if(!condition.fieldKey)return 'applies';
  if(!answersByKey.has(condition.fieldKey))return 'unknown';
  const value=answersByKey.get(condition.fieldKey);
  if(condition.operator==='truthy')return value?'applies':'not-applicable';
  if(condition.operator==='in')return Array.isArray(condition.value)&&condition.value.includes(value)?'applies':'not-applicable';
  if(condition.operator==='contains')return Array.isArray(value)&&value.includes(condition.value)?'applies':'not-applicable';
  return value===condition.value?'applies':'not-applicable';
}

function answerText(field,value) {
  if(!hasAnswer(value))return 'Não informado';
  const labels=new Map((field.options||[]).map(option=>[String(option.value),option.label]));
  const display=item=>{
    if(typeof item==='boolean')return item?'Sim':'Não';
    if(item===null||item===undefined||item==='')return 'Não informado';
    if(typeof item==='object')return JSON.stringify(item);
    return labels.get(String(item))||String(item);
  };
  return Array.isArray(value)?value.map(display).join(', '):display(value);
}

function submittedFormHtml(detail) {
  const app=detail.application||{};
  const form=detail.form;
  const answers=detail.answers||[];
  const answerByField=new Map(answers.map(answer=>[answer.field_id,answer.value_json]));
  const fields=(form?.sections||[]).flatMap(section=>section.fields||[]);
  const answersByKey=new Map(fields.map(field=>[field.field_key,answerByField.get(field.id)]));
  const knownFieldIds=new Set(fields.map(field=>field.id));
  const mediaByField=new Map();
  const unlinkedMedia=[];
  for(const media of detail.media||[]){
    if(media.field_id){if(!mediaByField.has(media.field_id))mediaByField.set(media.field_id,[]);mediaByField.get(media.field_id).push(media);}
    else unlinkedMedia.push(media);
  }
  const fileList=items=>items.length?`<ul class="submitted-form-files">${items.map(item=>`<li><a href="${h(item.url)}" target="_blank" rel="noreferrer">${h(item.original_filename||'Consultar arquivo')}</a></li>`).join('')}</ul>`:'<p class="submitted-form-answer">Nenhum arquivo associado.</p>';
  const sections=!form?'<p class="review-empty">Não há formulário associado disponível para esta candidatura.</p>':(form.sections||[]).map(section=>`<section class="submitted-form-section"><h3>${h(section.title)}</h3>${section.description?`<p>${h(section.description)}</p>`:''}<dl>${(section.fields||[]).map(field=>{
    const condition=conditionState(field,answersByKey);
    const value=answerByField.get(field.id);
    const files=mediaByField.get(field.id)||[];
    const response=condition==='not-applicable'&&!hasAnswer(value)&&!files.length?'<p class="submitted-form-answer">Não se aplicava a esta candidatura.</p>':condition==='unknown'&&!hasAnswer(value)&&!files.length?'<p class="submitted-form-answer">Não informado; não foi possível confirmar se a condição da pergunta se aplicava.</p>':['IMAGE','FILE'].includes(field.type)?fileList(files):`<p class="submitted-form-answer">${h(answerText(field,value))}</p>`;
    return `<div class="submitted-form-field"><dt>${h(field.label)}</dt><dd>${response}</dd></div>`;
  }).join('')}</dl></section>`).join('')||'<p class="review-empty">O formulário associado não possui seções disponíveis.</p>';
  const unidentified=answers.filter(answer=>!knownFieldIds.has(answer.field_id));
  return `<div class="submitted-form-meta"><article><span>Expositor</span><b>${h(detail.exhibitor?.display_name||app.applicant_name||'Não informado')}</b></article><article><span>Feira</span><b>${h(detail.edition?.fair?.name||'Não identificada')}</b></article><article><span>Edição</span><b>${h(detail.edition?.title||'Não identificada')}</b></article><article><span>Protocolo</span><b>${h(app.id||'Não disponível')}</b></article><article><span>Envio</span><b>${h(app.submitted_at?date(app.submitted_at):'Ainda não enviado')}</b></article></div>${sections}${unlinkedMedia.length?`<section class="submitted-form-section"><h3>Arquivos da candidatura sem pergunta associada</h3>${fileList(unlinkedMedia)}</section>`:''}${unidentified.length?`<section class="submitted-form-section"><h3>Respostas sem pergunta identificável</h3><p class="review-empty">${unidentified.length} resposta(s) histórica(s) não puderam ser associadas com segurança à definição disponível do formulário.</p></section>`:''}<section class="submitted-form-section"><h3>Termos aceitos</h3>${(detail.consents||[]).length?`<ul class="submitted-form-consents">${detail.consents.map(consent=>`<li><p>${h(consent.consent_text)}</p><small>Aceito em ${h(date(consent.accepted_at))}</small></li>`).join('')}</ul>`:'<p class="review-empty">Não há registros de aceite recuperáveis para esta candidatura.</p>'}</section>`;
}

function openSubmittedForm(detail) {
  const dialog=openDialog('Formulário enviado',submittedFormHtml(detail));
  dialog.classList.add('submitted-form-dialog');
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
  root.querySelector('[data-checklist-action="form"]')?.addEventListener('click',()=>openSubmittedForm(detail));
  bindForm(root.querySelector('[data-decision]'),async data=>{await api.request(`/curation/applications/${id}`,{method:'PATCH',body:{...data,visibleToExhibitor:!!data.visibleToExhibitor}});await render(root,id);});
  bindForm(root.querySelector('[data-assign]'),async data=>{await api.request(`/curation/applications/${id}/space`,{method:'PUT',body:data});await render(root,id);});
  const release=root.querySelector('[data-release]');if(release)release.onclick=()=>busy(release,async()=>{await api.request(`/curation/applications/${id}/space`,{method:'DELETE'});await render(root,id);},root.querySelector('[data-global-feedback]'));
  for(const media of detail.media||[]){const slot=root.querySelector(`[data-media-actions="${CSS.escape(media.id)}"]`);if(!slot)continue;slot.innerHTML='<form><label class="form-field">Análise<select name="status"><option value="APPROVED">Aprovar</option><option value="CHANGES_REQUESTED">Solicitar ajuste</option><option value="REJECTED">Rejeitar</option></select></label><label class="form-field">Orientação<textarea name="note" maxlength="3000"></textarea></label><p data-feedback></p><button class="btn btn-small btn-secondary" type="submit">Salvar análise</button></form>';bindForm(slot.querySelector('form'),async data=>{await api.request(`/curation/media/${media.id}`,{method:'PATCH',body:data});await render(root,id);});}
  if(detail.exceptionRequest?.status==='PENDING'){const section=root.querySelector('#respostas');const form=document.createElement('form');form.innerHTML='<h3>Decidir pedido especial</h3><label class="form-field">Decisão<select name="status"><option value="APPROVED">Aprovar pedido</option><option value="DECLINED">Recusar pedido</option></select></label><label class="form-field">Orientação<textarea name="note" maxlength="3000"></textarea></label><p data-feedback></p><button class="btn btn-secondary" type="submit">Salvar decisão do pedido</button>';section.append(form);bindForm(form,async data=>{await api.request(`/curation/exception-requests/${detail.exceptionRequest.id}`,{method:'PATCH',body:data});await render(root,id);});}
}

export async function initializeCurationApplication() {
  const root=document.querySelector('[data-curation-application-root]');if(!root)return;
  ensureSubmittedFormStyles();
  const id=new URLSearchParams(location.search).get('id');
  if(!id){root.innerHTML='<div class="workflow-empty"><h1>Candidatura não informada</h1><p>Abra a análise a partir da lista de inscrições.</p><a class="btn btn-primary" href="curadoria.html#inscricoes">Voltar às inscrições</a></div>';return;}
  try{await render(root,id);}catch(error){root.innerHTML='<div class="workflow-empty"><h1>Não foi possível abrir a candidatura</h1><p data-feedback></p><a class="btn btn-primary" href="curadoria.html#inscricoes">Voltar às inscrições</a></div>';notice(root.querySelector('[data-feedback]'),error.message);}
}
