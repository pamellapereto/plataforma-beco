import {api} from '../models/api.model.js';
import {escapeHtml as h,field,notice,busy,bindForm,openDialog} from '../ui.js';
import {createMap,pin} from '../maps.js';
import {coordinates,locationAddress} from '../map-utils.js';
export async function manageStandMap(edition,refresh){
 const dialog=openDialog('Mapa e estandes da edição','<p>Carregando…</p>');const root=dialog.querySelector('[data-dialog-body]');
 let instance,disposed=false,adding=false;const markers=new Map();
 dialog.addEventListener('close',()=>{disposed=true;instance?.destroy();});
 const endpoint=`/curation/fair-editions/${edition.id}/spaces`;
 async function load(){
  const spaces=await api.request(endpoint);if(disposed)return;instance?.destroy();instance=null;markers.clear();
  root.innerHTML=`<h3>${h(edition.title)}</h3><p>${h(locationAddress(edition.location))}</p><p>Este mapa de estandes é privado. Você vê todos os espaços; cada expositor confirmado recebe somente seu próprio ponto.</p><div class="workflow-toolbar"><button class="btn btn-primary" data-add-pin>Adicionar estande no mapa</button><button class="btn btn-secondary" data-add-manual>Novo estande por coordenadas</button><button class="btn btn-outline" data-fit>Ver todos os pontos</button></div><p data-feedback aria-live="polite"></p><div class="map-layout"><div><div class="event-map stand-map" data-stand-map aria-label="Mapa administrativo dos estandes"></div><div class="map-public-point"><p>Para escolher a entrada pública do evento, mova o mapa e use o centro. Isso não publica os estandes.</p><button class="btn btn-secondary" data-save-location>Usar centro como entrada do evento</button><p data-location-feedback aria-live="polite"></p></div><p>Arraste um pin para reposicionar o estande; a nova posição será salva. Clique no pin para editar seus dados.</p></div><div class="map-space-list">${spaces.map(space=>`<article class="workflow-question"><h4>${h(space.code)} · ${h(space.label||'')}</h4><p>${h(space.width_m)} × ${h(space.height_m)} m · ${space.is_available?'Disponível':`Ocupado${space.assignedExhibitor?' · '+h(space.assignedExhibitor):''}`}</p><p>${coordinates(space)?'Posicionado no mapa':'Aguardando posição no mapa'}</p><button class="btn btn-small btn-secondary" data-edit="${h(space.id)}">Editar</button> <button class="btn btn-small btn-outline" data-focus="${h(space.id)}" ${coordinates(space)?'':'disabled'}>Localizar</button> <button class="btn btn-small btn-outline" data-remove="${h(space.id)}" ${space.is_available?'':'disabled'}>Excluir</button></article>`).join('')||'<p>Nenhum estande criado. Use Adicionar estande no mapa.</p>'}</div></div>`;
  const feedback=root.querySelector('[data-feedback]');
  const edit=(space,point)=>{
   const selected=point||coordinates(space);
   const modal=openDialog(space?'Editar estande':'Novo estande',`<form><div class="form-grid">${field('code','Código',space?.code||'','text','required maxlength="40"')}${field('label','Nome descritivo',space?.label||'','text','maxlength="100"')}${field('widthM','Largura (m)',space?.width_m||2,'number','required min="0.1" max="100" step="0.1"')}${field('heightM','Profundidade (m)',space?.height_m||2,'number','required min="0.1" max="100" step="0.1"')}${field('latitude','Latitude',selected?.[0]??'','number','min="-90" max="90" step="0.000001"')}${field('longitude','Longitude',selected?.[1]??'','number','min="-180" max="180" step="0.000001"')}</div><p>Informe as duas coordenadas, ou deixe ambas vazias para posicionar depois. No mapa, você pode arrastar o pin para ajustar a posição.</p><p data-feedback></p><button class="btn btn-primary" type="submit">Salvar estande</button></form>`);
   bindForm(modal.querySelector('form'),async data=>{
    if((data.latitude==='')!==(data.longitude===''))throw Error('Informe latitude e longitude juntas.');
    await api.request(space?`${endpoint}/${space.id}`:endpoint,{method:space?'PATCH':'POST',body:{...data,latitude:data.latitude===''?null:Number(data.latitude),longitude:data.longitude===''?null:Number(data.longitude)}});
    modal.close();await load();await refresh();
   });
  };
  root.querySelector('[data-add-manual]').onclick=()=>edit(null,null);
  root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(spaces.find(s=>s.id===b.dataset.edit)));
  root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('Excluir este estande?'))busy(b,async()=>{await api.request(`${endpoint}/${b.dataset.remove}`,{method:'DELETE'});await load();await refresh();},feedback);});
  root.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>{const marker=markers.get(b.dataset.focus);if(marker){instance.map.setView(marker.getLatLng(),19);marker.openTooltip();}});
  const addButton=root.querySelector('[data-add-pin]');addButton.onclick=()=>{adding=!adding;addButton.textContent=adding?'Cancelar adição no mapa':'Adicionar estande no mapa';notice(feedback,adding?'Clique no local desejado do mapa para criar um estande.':'Adição cancelada.',true);};
  try{
   const points=spaces.map(coordinates).filter(Boolean),locationPoint=coordinates(edition.location);
   instance=await createMap(root.querySelector('[data-stand-map]'),{center:locationPoint||points[0],feedback});if(disposed){instance.destroy();return;}
   const {map,L}=instance;
   if(locationPoint)L.circleMarker(locationPoint,{radius:9,color:'#16784b',fillOpacity:0.8}).addTo(map).bindTooltip('Entrada pública do evento');
   for(const space of spaces){const point=coordinates(space);if(!point)continue;
    const marker=pin(L,map,point,`${space.code}${space.assignedExhibitor?' · '+space.assignedExhibitor:''}`,{draggable:true,onClick:()=>edit(space),onMove:async marker=>{
      const previous=coordinates(space);const next=marker.getLatLng();marker.dragging.disable();
      try{const saved=await api.request(`${endpoint}/${space.id}`,{method:'PATCH',body:{latitude:Number(next.lat.toFixed(6)),longitude:Number(next.lng.toFixed(6))}});space.latitude=saved.latitude;space.longitude=saved.longitude;notice(feedback,`Posição do estande ${space.code} salva.`,true);}catch(error){marker.setLatLng(previous);notice(feedback,error.message);}finally{if(!disposed)marker.dragging.enable();}
    }});markers.set(space.id,marker);
   }
   const fit=()=>{const all=[...spaces.map(coordinates).filter(Boolean),...(locationPoint?[locationPoint]:[])];if(all.length)map.fitBounds(all,{padding:[30,30],maxZoom:18});};fit();
   root.querySelector('[data-fit]').onclick=fit;
   map.on('click',event=>{if(!adding)return;adding=false;addButton.textContent='Adicionar estande no mapa';edit(null,[Number(event.latlng.lat.toFixed(6)),Number(event.latlng.lng.toFixed(6))]);});
   root.querySelector('[data-save-location]').onclick=event=>busy(event.currentTarget,async()=>{
    const center=map.getCenter();const latitude=Number(center.lat.toFixed(6)),longitude=Number(center.lng.toFixed(6));
    await api.request(`/admin/locations/${edition.location_id}`,{method:'PATCH',body:{latitude,longitude}});edition.location={...edition.location,latitude,longitude};await load();await refresh();notice(root.querySelector('[data-location-feedback]'),'Entrada pública salva. Ela será exibida na página do evento.',true);
   },root.querySelector('[data-location-feedback]'));
  }catch(error){notice(feedback,error.message);root.querySelector('[data-add-pin]').disabled=true;root.querySelector('[data-save-location]').disabled=true;}
 }
 try{await load();}catch(error){notice(root,error.message);}
}
