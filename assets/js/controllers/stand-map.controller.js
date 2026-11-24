import {api} from '../models/api.model.js';
import {escapeHtml as h,field,notice,busy,bindForm,openDialog} from '../ui.js';

const positioned=space=>space.x_coordinate!==null&&space.x_coordinate!==undefined&&space.y_coordinate!==null&&space.y_coordinate!==undefined&&Number.isFinite(Number(space.x_coordinate))&&Number.isFinite(Number(space.y_coordinate));
const pointFromEvent=(stage,event)=>{const rect=stage.getBoundingClientRect();return{xCoordinate:Number((((event.clientX-rect.left)/rect.width)*100).toFixed(3)),yCoordinate:Number((((event.clientY-rect.top)/rect.height)*100).toFixed(3))};};

export async function manageStandMap(edition,refresh){
 const dialog=openDialog('Planta e estandes da edição','<p>Carregando…</p>');
 const root=dialog.querySelector('[data-dialog-body]');
 const endpoint=`/curation/fair-editions/${edition.id}/spaces`;
 const mediaEndpoint=`/admin/fair-editions/${edition.id}/media`;
 let adding=false,spaceToPosition=null;
 const spaceList=spaces=>spaces.map(space=>`<article class="workflow-question"><h4>${h(space.code)} · ${h(space.label||'')}</h4><p>${h(space.width_m)} × ${h(space.height_m)} m · ${space.is_available?'Disponível':`Ocupado${space.assignedExhibitor?' · '+h(space.assignedExhibitor):''}`}</p><p>${positioned(space)?'Posicionado na imagem':'Aguardando posição na imagem'}</p><button class="btn btn-small btn-secondary" data-edit="${h(space.id)}">Editar</button> ${positioned(space)?'':`<button class="btn btn-small btn-secondary" data-position="${h(space.id)}">Posicionar</button>`} <button class="btn btn-small btn-outline" data-remove="${h(space.id)}" ${space.is_available?'':'disabled'}>Excluir</button></article>`).join('')||'<p>Nenhum estande criado. Use “Adicionar estande no mapa do evento”.</p>';

 async function load(){
  const [spaces,media]=await Promise.all([api.request(endpoint),api.request(mediaEndpoint)]);
  const plan=media.find(item=>item.role==='MAP');
  root.innerHTML=`<h3>${h(edition.title)}</h3><p>Envie uma imagem da planta ou do espaço do evento. A organização visualiza todos os estandes; cada expositor confirmado visualiza a imagem completa e somente o próprio pin.</p><form class="space-plan-upload"><label class="form-field">Imagem do espaço do evento<input type="file" name="plan" accept="image/jpeg,image/png,image/webp" ${plan?'':'required'}></label><label class="form-field">Descrição<input name="altText" maxlength="255" required value="${h(plan?.asset?.alt_text||`Planta do espaço de ${edition.title}`)}"></label><button class="btn btn-secondary" type="submit">${plan?'Substituir imagem':'Enviar imagem'}</button></form><p data-feedback aria-live="polite"></p>${plan?`<div class="workflow-toolbar"><button class="btn btn-primary" type="button" data-add-pin>Adicionar estande no mapa do evento</button><button class="btn btn-outline" type="button" data-remove-plan>Remover imagem do espaço</button></div><div class="map-layout"><div><div class="space-plan-stage" data-plan-stage><img src="${h(plan.asset.url)}" alt="${h(plan.asset.alt_text||'Planta do espaço do evento')}">${spaces.filter(positioned).map(space=>`<button type="button" class="space-plan-pin${space.is_available?'':' is-assigned'}" style="left:${Number(space.x_coordinate)}%;top:${Number(space.y_coordinate)}%" data-pin="${h(space.id)}" title="${h(space.code)}${space.assignedExhibitor?' · '+h(space.assignedExhibitor):''}"><span>${h(space.code)}</span></button>`).join('')}</div><p>Arraste um pin para reposicioná-lo. Clique nele para editar os dados do estande.</p></div><div class="map-space-list">${spaceList(spaces)}</div></div>`:`<div class="empty-state"><p>Envie primeiro a imagem do espaço para posicionar os estandes.</p></div>`}`;
  const feedback=root.querySelector('[data-feedback]');
  const upload=root.querySelector('.space-plan-upload');
  bindForm(upload,async data=>{const file=upload.elements.plan.files[0];if(!file){notice(feedback,'Escolha uma imagem para substituir a planta.');return;}await api.upload(file,mediaEndpoint,{role:'MAP',altText:data.altText,position:0,replaceMediaId:plan?.id});await load();await refresh();});
  if(!plan)return;
  root.querySelector('[data-remove-plan]').onclick=()=>{if(confirm('Remover a imagem do espaço? Os estandes continuarão cadastrados, mas ficarão sem planta visível.'))busy(root.querySelector('[data-remove-plan]'),async()=>{await api.request(`${mediaEndpoint}/${plan.id}`,{method:'DELETE'});await load();await refresh();},feedback);};
  const stage=root.querySelector('[data-plan-stage]');
  const addButton=root.querySelector('[data-add-pin]');
  addButton.onclick=()=>{adding=!adding;spaceToPosition=null;addButton.textContent=adding?'Cancelar adição':'Adicionar estande no mapa do evento';notice(feedback,adding?'Clique na imagem onde o novo estande deve ficar.':'Adição cancelada.',true);};
  stage.onclick=event=>{if(event.target.closest('[data-pin]'))return;const point=pointFromEvent(stage,event);if(spaceToPosition){const selected=spaceToPosition;spaceToPosition=null;savePosition(selected,point,feedback);return;}if(!adding)return;adding=false;addButton.textContent='Adicionar estande no mapa do evento';editSpace(null,point);};
  root.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>editSpace(spaces.find(space=>space.id===button.dataset.edit)));
  root.querySelectorAll('[data-position]').forEach(button=>button.onclick=()=>{spaceToPosition=spaces.find(space=>space.id===button.dataset.position);adding=false;addButton.textContent='Adicionar estande no mapa do evento';notice(feedback,`Clique na imagem para posicionar o estande ${spaceToPosition.code}.`,true);});
  root.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{if(confirm('Excluir este estande?'))busy(button,async()=>{await api.request(`${endpoint}/${button.dataset.remove}`,{method:'DELETE'});await load();await refresh();},feedback);});
  root.querySelectorAll('[data-pin]').forEach(button=>bindPin(button,spaces.find(space=>space.id===button.dataset.pin),stage,feedback));

  function editSpace(space,point){
   const modal=openDialog(space?'Editar estande':'Novo estande',`<form><div class="form-grid">${field('code','Código',space?.code||'','text','required maxlength="40"')}${field('label','Nome descritivo',space?.label||'','text','maxlength="100"')}${field('widthM','Largura (m)',space?.width_m||2,'number','required min="0.1" max="100" step="0.1"')}${field('heightM','Profundidade (m)',space?.height_m||2,'number','required min="0.1" max="100" step="0.1"')}</div><p data-feedback></p><button class="btn btn-primary" type="submit">Salvar estande</button></form>`);
   bindForm(modal.querySelector('form'),async data=>{await api.request(space?`${endpoint}/${space.id}`:endpoint,{method:space?'PATCH':'POST',body:{...data,...(point||{})}});modal.close();await load();await refresh();});
  }
  async function savePosition(space,point,target){try{await api.request(`${endpoint}/${space.id}`,{method:'PATCH',body:point});notice(target,`Posição do estande ${space.code} salva.`,true);await load();await refresh();}catch(error){notice(target,error.message);}}
  function bindPin(button,space,container,target){let moved=false;button.onpointerdown=event=>{if(event.button!==0)return;moved=false;button.setPointerCapture(event.pointerId);const move=moveEvent=>{moved=true;const point=pointFromEvent(container,moveEvent);button.style.left=`${Math.max(0,Math.min(100,point.xCoordinate))}%`;button.style.top=`${Math.max(0,Math.min(100,point.yCoordinate))}%`;};const up=async upEvent=>{button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',up);if(moved)await savePosition(space,pointFromEvent(container,upEvent),target);};button.addEventListener('pointermove',move);button.addEventListener('pointerup',up);};button.onclick=()=>{if(!moved)editSpace(space);};}
 }
 try{await load();}catch(error){notice(root,error.message);}
}
