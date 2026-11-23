import { api } from '../models/api.model.js';
import { bindForm, busy, date, escapeHtml as h, label, notice, openDialog, status } from '../ui.js';

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
  const media=(detail.media||[]).filter(item=>item.archived_at==null);
  const exception=detail.exceptionRequest;
  const submitted=app.status!=='DRAFT';
  const mediaPending=media.some(item=>item.review_status==='PENDING');
  const mediaNeedsAttention=media.some(item=>item.review_status==='CHANGES_REQUESTED');
  const mediaState=!media.length?'not-applicable':mediaNeedsAttention?'attention':mediaPending?'pending':'complete';
  const activeException=exception&&exception.status!=='WITHDRAWN'?exception:null;
  const exceptionState=!activeException?'not-applicable':activeException.status==='PENDING'?'pending':'complete';
  const decisionMade=finalStatuses.has(app.status);
  const spaceRequired=['APPROVED','CONFIRMED'].includes(app.status);
  return [
    {label:'Formulário enviado',detail:submitted?'A candidatura foi enviada para análise.':'O formulário ainda está em rascunho.',state:submitted?'complete':'pending',action:'form'},
    {label:'Imagens revisadas',detail:!media.length?'Não há imagens atuais para revisar.':mediaNeedsAttention?'Há imagens atuais com ajustes solicitados.':mediaPending?`${media.filter(item=>item.review_status==='PENDING').length} imagem(ns) atual(is) aguardando análise.`:'Todas as imagens atuais foram analisadas.',state:mediaState,action:'media'},
    {label:'Pedido especial analisado',detail:!activeException?'Não há pedido especial ativo nesta candidatura.':activeException.status==='PENDING'?'O pedido especial aguarda decisão.':'O pedido especial já recebeu uma decisão.',state:exceptionState,action:'exception'},
    {label:'Decisão da curadoria',detail:decisionMade?`Decisão registrada: ${label(app.status)}.`:'A decisão final ainda não foi registrada.',state:decisionMade?'complete':'pending',action:'decision'},
    {label:'Espaço definido',detail:app.assigned_space_id?'Um espaço foi atribuído à candidatura.':spaceRequired?'A candidatura foi aprovada, mas ainda não possui espaço.':'A definição de espaço ainda não se aplica.',state:app.assigned_space_id?'complete':spaceRequired?'pending':'not-applicable',action:'space'}
  ];
}

function checklistHtml(items) {
  const applicable=items.filter(item=>item.state!=='not-applicable');
  const complete=applicable.filter(item=>item.state==='complete').length;
  const percentage=applicable.length?Math.round(complete/applicable.length*100):0;
  return `<div class="review-progress" aria-label="${complete} de ${applicable.length} verificações aplicáveis concluídas"><span style="width:${percentage}%"></span></div><p><b>${complete} de ${applicable.length}</b> verificações aplicáveis concluídas</p><ul class="review-checklist">${items.map(item=>`<li class="${item.state}${item.action?' is-actionable':''}">${item.action?`<button type="button" data-checklist-action="${h(item.action)}" aria-label="Consultar ${h(item.label)}">`:''}<span class="review-checklist__icon" aria-hidden="true">${item.state==='complete'?'✓':item.state==='attention'?'!':item.state==='not-applicable'?'—':'·'}</span><span><b>${h(item.label)}</b><small>${h(item.detail)}</small></span>${item.action?'</button>':''}</li>`).join('')}</ul>`;
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

function closeDialog(dialog) {
  return new Promise(resolve=>{
    dialog.addEventListener('close',resolve,{once:true});
    dialog.close();
  });
}

function confirmReviewStart(root,id,{beforeMediaReview=false}={}) {
  const introduction=beforeMediaReview
    ? '<p>Esta candidatura ainda não teve sua análise iniciada. Para avaliar as imagens, primeiro é necessário iniciar formalmente a análise da candidatura. Deseja iniciar agora?</p>'
    : '<p>Deseja iniciar a análise desta candidatura?</p>';
  const openNext=updated=>beforeMediaReview?openMediaReview(root,id,updated):openSubmittedForm(updated);
  const dialog=openDialog('Iniciar análise',`${introduction}<p>Ao confirmar, a candidatura passará de <b>Inscrição recebida</b> para <b>Em análise</b>.</p><p>Essa alteração será registrada no histórico da curadoria.</p><p data-feedback aria-live="polite"></p><div class="hero-actions"><button type="button" class="btn btn-outline" data-cancel-review>Cancelar</button><button type="button" class="btn btn-primary" data-start-review>Iniciar análise</button></div>`);
  dialog.querySelector('[data-cancel-review]').addEventListener('click',()=>dialog.requestWorkflowClose());
  const start=dialog.querySelector('[data-start-review]');
  start.addEventListener('click',async()=>{
    if(start.disabled)return;
    start.disabled=true;
    const feedback=dialog.querySelector('[data-feedback]');
    try{
      await api.request(`/curation/applications/${encodeURIComponent(id)}`,{method:'PATCH',body:{status:'UNDER_REVIEW',note:'Análise da candidatura iniciada pela curadoria.',visibleToExhibitor:true}});
      await closeDialog(dialog);
      const updated=await render(root,id);
      openNext(updated);
    }catch(error){
      if(error.code==='REVIEW_ALREADY_STARTED'){
        await closeDialog(dialog);
        const updated=await render(root,id);
        notice(root.querySelector('[data-global-feedback]'),'A análise desta candidatura já havia sido iniciada.',true);
        openNext(updated);
        return;
      }
      notice(feedback,error.message);
      start.disabled=false;
    }
  });
}

function mediaReviewHtml(detail) {
  const app=detail.application||{};
  const media=detail.media||[];
  const reviewAllowed=['UNDER_REVIEW','PHOTO_REVIEW','AWAITING_UPDATE'].includes(app.status);
  return `<div class="submitted-form-meta"><article><span>Expositor</span><b>${h(detail.exhibitor?.display_name||app.applicant_name||'Não informado')}</b></article><article><span>Edição</span><b>${h(detail.edition?.title||'Não identificada')}</b></article><article><span>Protocolo</span><b>${h(app.id||'Não disponível')}</b></article><article><span>Imagens vinculadas</span><b>${media.length}</b></article></div><p data-media-global-feedback aria-live="polite"></p><section class="media-review-preview" data-media-preview hidden></section>${media.length?`<div class="media-review-grid">${media.map(item=>`<article class="media-review-card"><button type="button" class="media-review-image" data-preview-media="${h(item.id)}" aria-label="Ampliar ${h(item.original_filename||'imagem')}"><img src="${h(item.url)}" alt="${h(item.alt_text||item.original_filename||'Imagem da candidatura')}"></button><div class="media-review-card__body"><h3>${h(item.original_filename||'Imagem sem nome')}</h3><small>Referência ${h(item.id)}</small><div class="media-review-card__status">${status(item.review_status)}</div>${item.curator_note?`<p class="media-review-note"><b>Observação da curadoria</b>${h(item.curator_note)}</p>`:''}${item.reviewed_at?`<small>Última avaliação: ${h(date(item.reviewed_at))}</small>`:''}${reviewAllowed?`<form data-media-review="${h(item.id)}"><label class="form-field">Avaliação<select name="status" required><option value="">Selecione</option><option value="APPROVED">Aprovar</option><option value="CHANGES_REQUESTED">Solicitar ajuste</option><option value="REJECTED">Rejeitar</option></select></label><label class="form-field">Orientação<textarea name="note" maxlength="3000">${h(item.curator_note||'')}</textarea></label><p data-feedback aria-live="polite"></p><button type="submit" class="btn btn-secondary">Salvar avaliação</button></form>`:'<p class="review-empty">A candidatura está concluída e não permite novas avaliações de imagem.</p>'}</div></article>`).join('')}</div>`:'<p class="workflow-empty">Nenhuma imagem vinculada a esta candidatura.</p>'}`;
}

function renderMediaReviewDialog(dialog,root,id,detail) {
  const body=dialog.querySelector('[data-dialog-body]');
  body.innerHTML=mediaReviewHtml(detail);
  const preview=body.querySelector('[data-media-preview]');
  for(const item of detail.media||[]){
    if((item.versions||[]).length<2)continue;
    const card=body.querySelector(`[data-preview-media="${CSS.escape(item.id)}"]`)?.closest('.media-review-card');
    const cardBody=card?.querySelector('.media-review-card__body');if(!cardBody)continue;
    const button=document.createElement('button');button.type='button';button.className='btn btn-small btn-outline';button.dataset.mediaHistory=item.id;button.textContent=`Histórico de versões (${item.versions.length})`;
    cardBody.insertBefore(button,cardBody.querySelector('form,[data-feedback]'));
  }
  body.querySelectorAll('[data-preview-media]').forEach(button=>button.addEventListener('click',()=>{
    const item=(detail.media||[]).find(media=>media.id===button.dataset.previewMedia);
    if(!item)return;
    preview.hidden=false;
    preview.innerHTML=`<div class="media-review-preview__heading"><b>${h(item.original_filename||'Imagem da candidatura')}</b><button type="button" class="btn btn-small btn-outline" data-close-preview>Fechar ampliação</button></div><img src="${h(item.url)}" alt="${h(item.alt_text||item.original_filename||'Imagem ampliada da candidatura')}">`;
    preview.querySelector('[data-close-preview]').addEventListener('click',()=>{preview.hidden=true;preview.innerHTML='';});
  }));
  body.querySelectorAll('[data-media-history]').forEach(button=>button.addEventListener('click',()=>{
    const item=(detail.media||[]).find(media=>media.id===button.dataset.mediaHistory);if(!item)return;
    preview.hidden=false;
    preview.innerHTML=`<div class="media-review-preview__heading"><b>Histórico de versões</b><button type="button" class="btn btn-small btn-outline" data-close-preview>Fechar histórico</button></div><div class="media-version-history">${[...(item.versions||[])].reverse().map(version=>`<article><img src="${h(version.url)}" alt="${h(version.alt_text||version.original_filename||'Versão da imagem')}"><div><b>Versão ${h(version.version_number)} ${version.isCurrent?'· Atual':'· Arquivada'}</b>${status(version.review_status)}<small>Enviada em ${h(date(version.created_at))}</small>${version.reviewed_at?`<small>Avaliada em ${h(date(version.reviewed_at))}</small>`:''}${version.curator_note?`<p>${h(version.curator_note)}</p>`:'<p>Sem observação da curadoria.</p>'}</div></article>`).join('')}</div>`;
    preview.querySelector('[data-close-preview]').addEventListener('click',()=>{preview.hidden=true;preview.innerHTML='';});
  }));
  body.querySelectorAll('[data-media-review]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const media=(detail.media||[]).find(item=>item.id===form.dataset.mediaReview);
    if(!media)return;
    const submit=form.querySelector('[type="submit"]');
    if(submit.disabled)return;
    submit.disabled=true;
    const feedback=form.querySelector('[data-feedback]');
    const data=new FormData(form);
    try{
      await api.request(`/curation/media/${encodeURIComponent(media.id)}`,{method:'PATCH',body:{status:data.get('status'),note:data.get('note'),expectedReviewedAt:media.reviewed_at||null}});
      const updated=await render(root,id);
      renderMediaReviewDialog(dialog,root,id,updated);
      notice(dialog.querySelector('[data-media-global-feedback]'),'Avaliação da imagem salva.',true);
    }catch(error){
      if(error.code==='MEDIA_REVIEW_CHANGED'){
        const updated=await render(root,id);
        renderMediaReviewDialog(dialog,root,id,updated);
        notice(dialog.querySelector('[data-media-global-feedback]'),error.message);
        return;
      }
      notice(feedback,error.message);
      submit.disabled=false;
    }
  }));
}

function openMediaReview(root,id,detail) {
  const dialog=openDialog('Imagens da candidatura','<p>Carregando imagens…</p>');
  dialog.classList.add('media-review-dialog');
  renderMediaReviewDialog(dialog,root,id,detail);
}

function exceptionRequestHtml(detail) {
  const request=detail.exceptionRequest;
  if(!request)return '<p class="workflow-empty">Esta candidatura não possui pedido especial.</p>';
  const labels={PENDING:'Aguardando análise',APPROVED:'Aprovado',DECLINED:'Recusado',WITHDRAWN:'Retirado pelo expositor'};
  const decision=request.status==='PENDING'
    ? `<form data-exception-decision><label class="form-field">Decisão<select name="status" required><option value="">Selecione</option><option value="APPROVED">Aprovar pedido</option><option value="DECLINED">Recusar pedido</option></select></label><label class="form-field">Orientação<textarea name="note" maxlength="3000"></textarea></label><p data-feedback aria-live="polite"></p><button class="btn btn-primary" type="submit">Salvar decisão</button></form>`
    : `<section class="submitted-form-section"><h3>Decisão registrada</h3><p><b>${h(labels[request.status]||request.status)}</b></p><p>${h(request.decision_note||'Nenhuma observação administrativa foi registrada.')}</p>${request.decided_at?`<small>Decidido em ${h(date(request.decided_at))}${request.decidedBy?.full_name?` por ${h(request.decidedBy.full_name)}`:''}.</small>`:''}</section>`;
  return `<div class="submitted-form-meta"><article><span>Expositor</span><b>${h(detail.exhibitor?.display_name||detail.application?.applicant_name||'Não informado')}</b></article><article><span>Edição</span><b>${h(detail.edition?.title||'Não identificada')}</b></article><article><span>Situação do pedido</span><b>${h(labels[request.status]||request.status)}</b></article><article><span>Atualização</span><b>${h(date(request.updated_at||request.created_at))}</b></article></div><section class="submitted-form-section"><h3>Justificativa do expositor</h3><p>${h(request.reason)}</p></section>${request.status==='WITHDRAWN'?'<p class="workflow-empty">Este pedido foi retirado pelo expositor e não aceita decisões.</p>':decision}`;
}

function renderExceptionRequestDialog(dialog,root,id,detail) {
  const body=dialog.querySelector('[data-dialog-body]');body.innerHTML=`<p data-exception-feedback aria-live="polite"></p>${exceptionRequestHtml(detail)}`;
  const form=body.querySelector('[data-exception-decision]');if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const submit=form.querySelector('[type="submit"]');if(submit.disabled)return;submit.disabled=true;
    const data=new FormData(form);
    try{
      await api.request(`/curation/exception-requests/${encodeURIComponent(detail.exceptionRequest.id)}`,{method:'PATCH',body:{status:data.get('status'),note:data.get('note')}});
      const updated=await render(root,id);renderExceptionRequestDialog(dialog,root,id,updated);
      notice(dialog.querySelector('[data-exception-feedback]'),'Decisão do pedido especial salva.',true);
    }catch(error){notice(form.querySelector('[data-feedback]'),error.message);submit.disabled=false;}
  });
}

function openExceptionRequest(root,id,detail) {
  const dialog=openDialog('Pedido especial','<p>Carregando pedido…</p>');
  dialog.classList.add('submitted-form-dialog');
  renderExceptionRequestDialog(dialog,root,id,detail);
}

function requestedDimensions(value) {
  const match=String(value||'').match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  return match?{width:Number(match[1].replace(',','.')),height:Number(match[2].replace(',','.'))}:null;
}

function spaceMismatch(requested,space) {
  const dimensions=requestedDimensions(requested);if(!dimensions)return false;
  return Number(space.width_m)<dimensions.width||Number(space.height_m)<dimensions.height;
}

function spaceAssignmentHtml(detail) {
  const app=detail.application||{};const spaces=detail.spaces||[];
  const current=spaces.find(space=>space.id===app.assigned_space_id)||null;
  const canAssign=['APPROVED','CONFIRMED'].includes(app.status);
  const assignable=spaces.filter(space=>space.is_available||space.id===app.assigned_space_id);
  return `<div class="submitted-form-meta"><article><span>Estrutura solicitada</span><b>${h(app.requested_space_type||'Não informada')}</b></article><article><span>Espaço atual</span><b>${current?h(`${current.code}${current.label?` · ${current.label}`:''}`):'Nenhum espaço atribuído'}</b></article><article><span>Etapa da candidatura</span><b>${h(label(app.status))}</b></article><article><span>Edição</span><b>${h(detail.edition?.title||'Não identificada')}</b></article></div><p data-space-feedback aria-live="polite"></p><div class="space-assignment-list">${spaces.map(space=>{const isCurrent=space.id===app.assigned_space_id;const mismatch=spaceMismatch(app.requested_space_type,space);return `<article class="space-assignment-card ${isCurrent?'is-current':''}"><div><b>${h(space.code)}${space.label?` · ${h(space.label)}`:''}</b><span>${h(space.width_m)} × ${h(space.height_m)} m</span></div><span>${isCurrent?'Atribuído a esta candidatura':space.is_available?'Disponível':`Ocupado${space.assignedExhibitor?` por ${h(space.assignedExhibitor)}`:''}`}</span>${mismatch?'<small class="space-warning">O espaço selecionado pode não corresponder à estrutura solicitada pelo expositor.</small>':''}</article>`;}).join('')||'<p class="workflow-empty">Nenhum espaço foi cadastrado para esta edição.</p>'}</div>${canAssign&&assignable.length?`<form data-space-assign><label class="form-field">Espaço<select name="spaceId" required><option value="">Selecione</option>${assignable.map(space=>`<option value="${h(space.id)}" ${space.id===app.assigned_space_id?'selected':''}>${h(space.code)} · ${h(space.width_m)} × ${h(space.height_m)} m</option>`).join('')}</select></label><p class="space-warning" data-space-warning hidden>O espaço selecionado pode não corresponder à estrutura solicitada pelo expositor.</p><p data-feedback aria-live="polite"></p><button class="btn btn-primary" type="submit">Atribuir e confirmar espaço</button>${app.assigned_space_id?'<button class="btn btn-outline" data-space-release type="button">Liberar espaço</button>':''}</form>`:!canAssign?'<p class="workflow-empty">A atribuição de espaço depende da aprovação da candidatura.</p>':'<p class="workflow-empty">Não existem espaços disponíveis para atribuição.</p>'}`;
}

function renderSpaceAssignmentDialog(dialog,root,id,detail) {
  const body=dialog.querySelector('[data-dialog-body]');body.innerHTML=spaceAssignmentHtml(detail);
  const form=body.querySelector('[data-space-assign]');
  if(form){
    const select=form.elements.spaceId;const warning=form.querySelector('[data-space-warning]');
    const updateWarning=()=>{const space=(detail.spaces||[]).find(item=>item.id===select.value);warning.hidden=!space||!spaceMismatch(detail.application.requested_space_type,space);};
    select.addEventListener('change',updateWarning);updateWarning();
    form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;const submit=form.querySelector('[type="submit"]');if(submit.disabled)return;submit.disabled=true;try{await api.request(`/curation/applications/${encodeURIComponent(id)}/space`,{method:'PUT',body:{spaceId:select.value}});const updated=await render(root,id);renderSpaceAssignmentDialog(dialog,root,id,updated);notice(dialog.querySelector('[data-space-feedback]'),'Espaço atribuído e participação confirmada.',true);}catch(error){notice(form.querySelector('[data-feedback]'),error.message);submit.disabled=false;}});
    const release=form.querySelector('[data-space-release]');if(release)release.addEventListener('click',()=>busy(release,async()=>{await api.request(`/curation/applications/${encodeURIComponent(id)}/space`,{method:'DELETE'});const updated=await render(root,id);renderSpaceAssignmentDialog(dialog,root,id,updated);notice(dialog.querySelector('[data-space-feedback]'),'Espaço liberado. A candidatura voltou para Aprovada.',true);},form.querySelector('[data-feedback]')));
  }
}

function openSpaceAssignment(root,id,detail) {
  const dialog=openDialog('Espaço da candidatura','<p>Carregando espaços…</p>');
  dialog.classList.add('submitted-form-dialog');renderSpaceAssignmentDialog(dialog,root,id,detail);
}

function timelineHtml(history) {
  if(!history.length)return '<p class="review-empty">Nenhuma movimentação registrada.</p>';
  return `<ol class="review-timeline">${[...history].reverse().map(event=>`<li><time>${h(date(event.created_at))}</time>${event.status?`<div>${status(event.status)}</div>`:''}<p class="review-timeline__actor">${h(event.actor?.full_name||event.actor?.email||(event.actor_user_id?'Usuário não identificado':'Sistema'))}</p>${event.note?`<p class="review-timeline__note">${h(event.note)}</p>`:''}${event.is_visible_to_exhibitor===false?'<small>Registro interno</small>':''}</li>`).join('')}</ol>`;
}

function summaryHtml(detail) {
  const app=detail.application;const exhibitor=detail.exhibitor;
  return `<div class="review-summary"><article><span>Candidato</span><b>${h(exhibitor?.display_name||app.applicant_name||'Não informado')}</b></article><article><span>Contato</span><b>${h(exhibitor?.phone||app.whatsapp||'Não informado')}</b></article><article><span>Categoria</span><b>${h((exhibitor?.categories||[]).map(item=>item.name).join(', ')||'Não informada')}</b></article><article><span>Cidade</span><b>${h([exhibitor?.city,exhibitor?.state].filter(Boolean).join(' · ')||'Não informada')}</b></article><article><span>Estrutura solicitada</span><b>${h(app.requested_space_type||'A definir')}</b></article><article><span>Envio</span><b>${h(date(app.submitted_at||app.created_at))}</b></article></div>`;
}

function actionsHtml(detail) {
  const app=detail.application;
  const latestDecision=[...(detail.history||[])].reverse().find(event=>event.status===app.status);
  const decisionOptions=(detail.allowedTransitions||[]).filter(value=>!(app.status==='SUBMITTED'&&value==='UNDER_REVIEW')).map(value=>`<option value="${value}">${h(value===app.status?`Manter ${label(value)} e atualizar orientação`:label(value))}</option>`).join('');
  return decisionOptions?`<form data-decision><h3>Decisão da curadoria</h3><label class="form-field">Próxima etapa<select name="status" required><option value="">Selecione</option>${decisionOptions}</select></label><label class="form-field">Orientação ao expositor<textarea name="note" maxlength="3000" placeholder="Explique a decisão ou os ajustes necessários">${h(app.curator_decision_note||'')}</textarea></label><label class="check-row"><input type="checkbox" name="visibleToExhibitor" ${latestDecision?.is_visible_to_exhibitor===false?'':'checked'}><span>Mostrar orientação ao expositor</span></label><p data-feedback></p><button class="btn btn-primary" type="submit">Salvar decisão</button></form>`:'<p class="review-empty">Não há novas transições disponíveis para esta candidatura.</p>';
}

async function render(root,id) {
  const detail=await api.request(`/curation/applications/${encodeURIComponent(id)}`);
  const app=detail.application;
  const spaces=await api.request(`/curation/fair-editions/${encodeURIComponent(app.fair_edition_id)}/spaces`);
  detail.spaces=spaces;
  const candidate=detail.exhibitor?.display_name||app.applicant_name||'Candidatura';
  document.title=`${candidate} | Análise da candidatura`;
  root.innerHTML=`<header class="private-heading review-heading" id="resumo"><div><span class="eyebrow">Análise da candidatura</span><h1>${h(candidate)}</h1><div class="review-heading__meta">${status(app.status)}<span>Protocolo ${h(app.id)}</span></div></div><a class="btn btn-secondary" href="curadoria.html#inscricoes">Voltar à lista</a></header><div class="review-layout"><div class="review-main"><section class="review-card"><h2>Resumo do candidato</h2>${summaryHtml(detail)}</section><section class="review-card" id="historico"><h2>Linha do tempo da análise</h2>${timelineHtml(detail.history||[])}</section></div><aside class="review-side"><section class="review-card"><h2>Pendências</h2>${checklistHtml(applicationChecklist(detail))}</section><section class="review-card review-actions" id="decisao"><h2>Decisão da curadoria</h2><p data-global-feedback aria-live="polite"></p>${actionsHtml(detail)}</section></aside></div>`;
  root.querySelector('[data-checklist-action="form"]')?.addEventListener('click',()=>app.status==='SUBMITTED'?confirmReviewStart(root,id):openSubmittedForm(detail));
  root.querySelector('[data-checklist-action="media"]')?.addEventListener('click',()=>app.status==='SUBMITTED'?confirmReviewStart(root,id,{beforeMediaReview:true}):openMediaReview(root,id,detail));
  root.querySelector('[data-checklist-action="exception"]')?.addEventListener('click',()=>openExceptionRequest(root,id,detail));
  root.querySelector('[data-checklist-action="decision"]')?.addEventListener('click',()=>{
    const decision=root.querySelector('#decisao');
    decision?.querySelector('[data-decision] select')?.focus({preventScroll:true});
  });
  root.querySelector('[data-checklist-action="space"]')?.addEventListener('click',()=>openSpaceAssignment(root,id,detail));
  bindForm(root.querySelector('[data-decision]'),async data=>{await api.request(`/curation/applications/${id}`,{method:'PATCH',body:{...data,visibleToExhibitor:!!data.visibleToExhibitor}});await render(root,id);});
  return detail;
}

export async function initializeCurationApplication() {
  const root=document.querySelector('[data-curation-application-root]');if(!root)return;
  ensureSubmittedFormStyles();
  const id=new URLSearchParams(location.search).get('id');
  if(!id){root.innerHTML='<div class="workflow-empty"><h1>Candidatura não informada</h1><p>Abra a análise a partir da lista de inscrições.</p><a class="btn btn-primary" href="curadoria.html#inscricoes">Voltar às inscrições</a></div>';return;}
  try{await render(root,id);}catch(error){root.innerHTML='<div class="workflow-empty"><h1>Não foi possível abrir a candidatura</h1><p data-feedback></p><a class="btn btn-primary" href="curadoria.html#inscricoes">Voltar às inscrições</a></div>';notice(root.querySelector('[data-feedback]'),error.message);}
}
