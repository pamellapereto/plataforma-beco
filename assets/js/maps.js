import {escapeHtml as h,notice} from './ui.js';
import {coordinates,locationAddress,directionsUrl} from './map-utils.js';
let leafletPromise;
export function loadLeaflet(){
 if(window.L)return Promise.resolve(window.L);
 if(!leafletPromise)leafletPromise=new Promise((resolve,reject)=>{
  if(!document.querySelector('[data-leaflet-style]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/assets/vendor/leaflet/leaflet.css';css.dataset.leafletStyle='';document.head.append(css);}
  const script=document.createElement('script');script.src='/assets/vendor/leaflet/leaflet.js';script.onload=()=>resolve(window.L);script.onerror=()=>{script.remove();leafletPromise=null;reject(Error('Não foi possível carregar o mapa. Tente novamente.'));};document.head.append(script);
 });
 return leafletPromise;
}
export async function createMap(container,{center,zoom=17,feedback}={}){
 const L=await loadLeaflet();if(!container.isConnected)throw Error('Mapa fechado.');
 const map=L.map(container,{scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView(center||[-23.5015,-47.4526],center?zoom:13);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
 let warned=false;tiles.on('tileerror',()=>{if(!warned){warned=true;notice(feedback,'O fundo do mapa não carregou. Você ainda pode usar o endereço e o botão Como chegar.');}});
 let removed=false;const destroy=()=>{if(removed)return;removed=true;observer.disconnect();map.stop();map.remove();};const observer=new MutationObserver(()=>{if(!container.isConnected)destroy();});observer.observe(document.body,{childList:true,subtree:true});map.on('unload',()=>{removed=true;observer.disconnect();});
 requestAnimationFrame(()=>{if(!removed&&container.isConnected)map.invalidateSize();});
 return {map,L,destroy};
}
export function pin(L,map,point,title,{draggable=false,onMove,onClick}={}){
 const marker=L.marker(point,{draggable,keyboard:true,title,alt:title}).addTo(map);
 const text=document.createElement('span');text.textContent=title;marker.bindTooltip(text,{direction:'top'});
 let dragged=false;marker.on('dragstart',()=>{dragged=true;});
 if(onClick)marker.on('click',()=>{if(!dragged)onClick();});
 marker.on('dragend',()=>{if(onMove)onMove(marker);setTimeout(()=>{dragged=false;},300);});return marker;
}
export function mountLocation(root,location,{stand=null,title='Localização do evento'}={}){
 if(!root)return;
 const eventPoint=coordinates(location),standPoint=coordinates(stand),point=standPoint||eventPoint;
 const hasDestination=point||location?.address_line||location?.name;
 const destination=standPoint?{latitude:standPoint[0],longitude:standPoint[1]}:location;
 root.innerHTML=`<h3>${h(title)}</h3><p>${h(locationAddress(location))}</p>${stand?`<p><strong>Seu estande: ${h(stand.code)}</strong> ${h(stand.label||'')}</p>${standPoint?'':'<p>A curadoria ainda não posicionou seu estande no mapa. A rota abaixo leva ao local do evento.</p>'}`:''}${point?'<button class="btn btn-secondary" type="button" data-load-map>Ver mapa interativo</button><div class="event-map" data-map hidden aria-label="Mapa do local"></div>':'<p>O ponto no mapa será publicado pela organização.</p>'}${hasDestination?`<div class="workflow-toolbar"><label class="form-field">Origem da rota (opcional)<input data-route-origin maxlength="300" placeholder="Digite endereço e cidade"></label><label class="form-field">Transporte<select data-route-mode><option value="driving">Carro</option><option value="walking">A pé</option><option value="transit">Transporte público</option><option value="bicycling">Bicicleta</option></select></label><button type="button" class="btn btn-secondary" data-locate>Usar minha localização</button><a class="btn btn-primary" data-directions target="_blank" rel="noopener noreferrer">Como chegar no Google Maps</a></div><p class="workflow-note">Sua origem não é salva na plataforma. Ao abrir a rota, ela será enviada ao Google Maps. A localização atual depende da sua permissão.</p>`:''}<p data-map-feedback aria-live="polite"></p>`;
 const feedback=root.querySelector('[data-map-feedback]');let instance;
 const loader=root.querySelector('[data-load-map]');if(loader)loader.onclick=async()=>{
  loader.disabled=true;const canvas=root.querySelector('[data-map]');canvas.hidden=false;
  try{instance=await createMap(canvas,{center:point,feedback});pin(instance.L,instance.map,point,standPoint?`Seu estande: ${stand.code}`:(location?.name||'Local do evento'));loader.remove();}catch(error){notice(feedback,error.message);loader.disabled=false;}
 };
 if(hasDestination){
  const origin=root.querySelector('[data-route-origin]'),mode=root.querySelector('[data-route-mode]'),link=root.querySelector('[data-directions]');
  const update=()=>{link.href=directionsUrl(destination,origin.value,mode.value);};origin.oninput=update;mode.onchange=update;update();
  const button=root.querySelector('[data-locate]');button.onclick=()=>{
   if(!navigator.geolocation){notice(feedback,'Localização indisponível. Digite sua origem.');return;}
   button.disabled=true;notice(feedback,'Aguardando sua localização…',true);
   navigator.geolocation.getCurrentPosition(position=>{button.disabled=false;origin.value=`${position.coords.latitude},${position.coords.longitude}`;update();notice(feedback,'Origem preenchida. Clique em Como chegar para abrir a rota.',true);},()=>{button.disabled=false;notice(feedback,'Não foi possível obter a localização. Você pode digitar sua origem.');},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
  };
 }
 return ()=>instance?.destroy();
}
