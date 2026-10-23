import { api } from '../models/api.model.js';
import { escapeHtml as h, notice, busy, status, date, openDialog, trackUnsavedChanges } from '../ui.js';

export function conditionApplies(field, answers) {
  const c=field.conditional_logic || {}; if(!c.fieldKey)return true;
  const value=answers.get(c.fieldKey);
  if(c.operator==='truthy')return !!value;
  if(c.operator==='in')return Array.isArray(c.value)&&c.value.includes(value);
  if(c.operator==='contains')return Array.isArray(value)&&value.includes(c.value);
  return value===c.value;
}
export function enabledApplicationAnswers(fields,form,valueOf) {
  return fields.filter(field => {
    if(['IMAGE','FILE'].includes(field.type))return false;
    const control=form.elements[`field_${field.id}`];
    return control&&!control.disabled;
  }).map(field=>({fieldId:field.id,value:valueOf(field)}))
    .filter(answer=>answer.value!==null&&answer.value!==undefined);
}
export function applicationDetailHtml(detail) {
  const answers=new Map(detail.answers.map(a=>[a.field_id,a.value_json]));
  return `${status(detail.application.status)}<p>Protocolo: ${h(detail.application.id)}</p>${detail.exhibitor?`<p><b>${h(detail.exhibitor.display_name)}</b> · ${h(detail.exhibitor.contact_name)} · ${h(detail.exhibitor.phone)}</p>`:''}
  ${detail.form.sections.map(section=>`<section><h3>${h(section.title)}</h3><dl>${section.fields.filter(f=>!['IMAGE','FILE'].includes(f.type)).map(f=>{const v=answers.get(f.id);const optionLabels=new Map((f.options||[]).map(o=>[o.value,o.label]));const value=typeof v==='boolean'?(v?'Sim':'Não'):Array.isArray(v)?v.map(x=>optionLabels.get(x)||x).join(', '):optionLabels.get(v)||v;return `<dt>${h(f.label)}</dt><dd>${h(value??'Não informado')}</dd>`;}).join('')}</dl></section>`).join('')}
  <h3>Imagens enviadas</h3><div class="workflow-media">${detail.media.map(m=>`<article><a href="${h(m.url)}" target="_blank" rel="noreferrer"><img src="${h(m.url)}" alt="${h(m.original_filename)}"></a><p>${h(m.original_filename)}</p>${status(m.review_status)}<p>${h(m.curator_note||'')}</p><div data-media-actions="${h(m.id)}"></div></article>`).join('')||'<p>Nenhuma imagem enviada.</p>'}</div>
  ${detail.exceptionRequest?`<h3>Pedido de exceção</h3>${status(detail.exceptionRequest.status)}<p>${h(detail.exceptionRequest.reason)}</p><p>${h(detail.exceptionRequest.decision_note||'')}</p>`:''}
  <h3>Termos aceitos</h3>${detail.consents.map(c=>`<p>${h(c.consent_text)} · ${h(date(c.accepted_at))}</p>`).join('')||'<p>Ainda não houve envio definitivo.</p>'}
  <h3>Histórico</h3><ul class="workflow-history">${detail.history.map(event=>`<li><time>${h(date(event.created_at))}</time> ${event.status?status(event.status):''}<p>${h(event.note||'')}</p></li>`).join('')}</ul>`;
}
export async function viewApplication(id) {
  const dialog=openDialog('Inscrição enviada','<p>Carregando…</p>');
  try {const detail=await api.request(`/applications/${id}`);dialog.querySelector('[data-dialog-body]').innerHTML=applicationDetailHtml(detail);}catch(error){notice(dialog.querySelector('[data-dialog-body]'),error.message);}
}
function inputHtml(f, value, uploaded) {
  const name=`field_${f.id}`;const required=f.is_required?'required':'';
  const attrs=`name="${name}" ${required} data-question-input`;
  const options=(f.options||[]).map(o=>`<option value="${h(o.value)}" ${(Array.isArray(value)?value.includes(o.value):value===o.value)?'selected':''}>${h(o.label)}</option>`).join('');
  if(['FILE','IMAGE'].includes(f.type))return `<input type="file" name="${name}" data-question-input accept="image/jpeg,image/png,image/webp" multiple><small>JPG, PNG ou WebP, até 10 MB por imagem. ${uploaded} arquivo(s) já enviado(s).</small>`;
  if(f.type==='LONG_TEXT')return `<textarea ${attrs} maxlength="${Number(f.validation?.maxLength||10000)}">${h(value||'')}</textarea>`;
  if(['SELECT','RADIO','MULTISELECT'].includes(f.type))return `<select ${attrs} ${f.type==='MULTISELECT'?'multiple':''}>${f.type!=='MULTISELECT'?'<option value="">Selecione</option>':''}${options}</select>`;
  if(f.type==='CHECKBOX')return `<input type="checkbox" ${attrs} ${value===true?'checked':''}>`;
  const type=({EMAIL:'email',PHONE:'tel',URL:'url',DATE:'date'})[f.type]||'text';
  return `<input ${attrs} type="${type}" value="${h(value||'')}" maxlength="${Number(f.validation?.maxLength||10000)}">`;
}
export async function initializeApplication() {
 const root=document.querySelector('[data-application-root]');if(!root)return;
 try {
  const params=new URLSearchParams(location.search);let applicationId=params.get('inscricao');let detail=applicationId?await api.request(`/applications/${encodeURIComponent(applicationId)}`):null;
  if(detail&&!['DRAFT','AWAITING_UPDATE'].includes(detail.application.status)){root.innerHTML=applicationDetailHtml(detail);return;}
  let editionId=detail?.application.fair_edition_id||params.get('edicao');
  if(!editionId){const fairs=await api.fairs();const editions=fairs.flatMap(f=>f.editions||[]).filter(e=>e.status==='REGISTRATION_OPEN'&&new Date(e.ends_at)>new Date()&&(!e.registration_opens_at||new Date(e.registration_opens_at)<=new Date())&&(!e.registration_closes_at||new Date(e.registration_closes_at)>=new Date()));if(editions.length!==1)throw Error('Escolha uma feira com inscrições abertas na página Nossas feiras.');editionId=editions[0].id;}
  if(!applicationId){ const existing=(await api.myApplications()).find(a=>a.fair_edition_id===editionId); if(existing){applicationId=existing.id;detail=await api.request(`/applications/${applicationId}`);history.replaceState(null,'',`inscricao-expositor.html?inscricao=${encodeURIComponent(applicationId)}`);if(!['DRAFT','AWAITING_UPDATE'].includes(detail.application.status)){root.innerHTML=applicationDetailHtml(detail);return;}} }
  const definition=detail?.form||await api.request(`/fair-editions/${encodeURIComponent(editionId)}/form`);
  let media=detail?.media||[];const fields=definition.sections.flatMap(s=>s.fields);const saved=new Map((detail?.answers||[]).map(a=>[a.field_id,a.value_json]));
  root.innerHTML=`<h2>${h(definition.title)}</h2><p>${h(definition.introduction||'')}</p>${detail?.application.status==='AWAITING_UPDATE'?`<div class="workflow-empty">A curadoria solicitou ajustes. Consulte as orientações em <a href="area-expositor.html">Minhas inscrições</a>, atualize os dados e reenvie.</div>`:''}<form data-official-form>
  ${definition.sections.map(section=>`<section class="form-section"><h3>${h(section.title)}</h3><p>${h(section.description||'')}</p><div class="form-grid">${section.fields.map(f=>`<div class="form-field full" data-question="${h(f.id)}"><label for="question_${h(f.id)}">${h(f.label)}${f.is_required?' *':''}</label>${inputHtml(f,saved.get(f.id),media.filter(m=>m.field_id===f.id).length)}<small>${h(f.help_text||'')}</small></div>`).join('')}</div></section>`).join('')}
  <section class="form-section"><label class="form-field">Estrutura desejada<select name="requestedSpaceType"><option value="">A definir</option>${['Mesa','2x2','2,5x2,5','3x3','Guarda-sol'].map(v=>`<option ${v===detail?.application.requested_space_type?'selected':''}>${v}</option>`).join('')}</select></label><label class="form-field">Pedido de exceção ou adaptação (opcional)<textarea name="exceptionReason" maxlength="3000">${h(detail?.exceptionRequest?.reason||'')}</textarea></label><p class="workflow-note">A candidatura será analisada pela curadoria e não garante uma vaga.</p></section>
  <section class="form-section"><h3>Compromissos da edição</h3>${(definition.required_consents||[]).map(c=>`<label class="check-row"><input type="checkbox" name="consent_${h(c.key)}" required><span>${h(c.text)}</span></label>`).join('')}<div data-feedback aria-live="polite"></div><div class="hero-actions"><button class="btn btn-secondary" type="submit" data-save-draft formnovalidate>Salvar rascunho</button><button class="btn btn-primary" type="submit">Enviar para curadoria</button><a class="btn btn-outline" href="area-expositor.html">Minha área</a></div></section></form><section><h3>Arquivos já enviados</h3><div class="workflow-media" data-saved-media></div></section>`;
  const form=root.querySelector('form');const feedback=form.querySelector('[data-feedback]');
  const unsaved=trackUnsavedChanges(form);
  const valueOf=f=>{const control=form.elements[`field_${f.id}`];if(['IMAGE','FILE'].includes(f.type))return null;if(f.type==='CHECKBOX')return control.checked;if(f.type==='MULTISELECT')return [...control.selectedOptions].map(o=>o.value);return control.value;};
  const conditions=()=>{const values=new Map(fields.map(f=>[f.field_key,valueOf(f)]));for(const f of fields){const wrapper=form.querySelector(`[data-question="${f.id}"]`);const input=wrapper.querySelector('[data-question-input]');input.id=`question_${f.id}`;const visible=conditionApplies(f,values);wrapper.hidden=!visible;input.disabled=!visible;}};
  form.addEventListener('change',conditions);conditions();
  const renderMedia=()=>{root.querySelector('[data-saved-media]').innerHTML=media.map(m=>`<article><img src="${h(m.url)}" alt="${h(m.original_filename)}"><p>${h(m.original_filename)}</p>${status(m.review_status)}<p>${h(m.curator_note||'')}</p><button class="btn btn-small btn-secondary" type="button" data-remove-media="${h(m.id)}">Remover imagem</button></article>`).join('')||'<p>Nenhum arquivo enviado.</p>';};renderMedia();
  root.addEventListener('click',e=>{const button=e.target.closest('[data-remove-media]');if(!button)return;busy(button,async()=>{await api.request(`/applications/${applicationId}/media/${button.dataset.removeMedia}`,{method:'DELETE'});media=media.filter(m=>m.id!==button.dataset.removeMedia);renderMedia();},feedback);});
  let saving=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;const draft=event.submitter?.hasAttribute('data-save-draft');if(!draft&&!form.reportValidity())return;
    saving=true;const savedRevision=unsaved.revision;const buttons=[...form.querySelectorAll('button[type=submit]')];buttons.forEach(b=>b.disabled=true);notice(feedback,'Salvando e enviando arquivos…',true);
    try{
      if(!applicationId){const created=await api.request(`/fair-editions/${editionId}/applications`,{method:'POST',body:{requestedSpaceType:form.elements.requestedSpaceType.value}});applicationId=created.id;history.replaceState(null,'',`inscricao-expositor.html?inscricao=${encodeURIComponent(applicationId)}`);}
      const answers=enabledApplicationAnswers(fields,form,valueOf);
      await api.request(`/applications/${applicationId}/answers`,{method:'PUT',body:{answers,requestedSpaceType:form.elements.requestedSpaceType.value}});
      for(const f of fields.filter(f=>['IMAGE','FILE'].includes(f.type))){const input=form.elements[`field_${f.id}`];if(input.disabled)continue;const files=[...input.files];const existing=media.filter(m=>m.field_id===f.id).length;if(existing+files.length>Number(f.validation?.maxFiles||20))throw Error(`Excesso de arquivos em ${f.label}.`);if(!draft&&f.is_required&&existing+files.length<Number(f.validation?.minFiles||1))throw Error(`Envie as imagens solicitadas em ${f.label}.`);
       for(const file of files){await api.upload(file,`/applications/${applicationId}/media`,{fieldId:f.id,role:'PORTFOLIO'});input.value='';media=(await api.request(`/applications/${applicationId}`)).media;renderMedia();}
      }
      const reason=form.elements.exceptionReason.value.trim();if(reason)await api.request(`/applications/${applicationId}/exception-request`,{method:'PUT',body:{reason}});
      if(draft){unsaved.markSaved(savedRevision);notice(feedback,unsaved.revision===savedRevision?'Rascunho salvo. Você pode continuar pela sua área.':'Rascunho salvo, mas há novas alterações. Salve novamente antes de sair.',true);return;}
      const consents=(definition.required_consents||[]).map(c=>({key:c.key,accepted:form.elements[`consent_${c.key}`].checked}));
      await api.request(`/applications/${applicationId}/submit`,{method:'POST',body:{consents}});unsaved.markSaved();location.href=`area-expositor.html?enviada=${encodeURIComponent(applicationId)}`;
    }catch(error){notice(feedback,error.message);}finally{saving=false;buttons.forEach(b=>b.disabled=false);}
  });
 }catch(error){root.innerHTML='<div data-feedback></div><a class="btn btn-secondary" href="feiras.html">Ver feiras</a>';notice(root.querySelector('[data-feedback]'),error.message);}
}
