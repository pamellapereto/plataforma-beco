const fallbackFairImage = 'assets/evento-artesanato-human.jpg';
const fallbackExhibitorImage = 'assets/expositor-madeira-human.jpg';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function date(value, options = {}) {
  if (!value) return 'Data a confirmar';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric', ...options }).format(new Date(value));
}

function dateTime(value) {
  return date(value, { hour: '2-digit', minute: '2-digit' });
}

function cover(edition) {
  return edition?.media?.find(item => item.role === 'COVER')?.url || edition?.media?.[0]?.url || fallbackFairImage;
}

function portfolioCover(exhibitor) {
  return exhibitor?.portfolio?.find(item => item.is_featured)?.url || exhibitor?.portfolio?.[0]?.url || fallbackExhibitorImage;
}

function latestEdition(fair) {
  const editions = [...(fair.editions || [])].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
  return editions.find(e=>new Date(e.ends_at)>=new Date()) || editions.at(-1) || null;
}

function statusLabel(status) {
  return ({ PUBLISHED: 'Evento confirmado' })[status] || 'Em breve';
}

function registrationState(edition, now = Date.now()) {
  if (!edition || edition.status !== 'PUBLISHED') return null;
  if (['UPCOMING', 'OPEN', 'CLOSED'].includes(edition.registration_status)) return edition.registration_status;
  const opensAt = new Date(edition.registration_opens_at).getTime();
  const closesAt = new Date(edition.registration_closes_at).getTime();
  if (Number.isFinite(opensAt) && now < opensAt) return 'UPCOMING';
  if (Number.isFinite(closesAt) && now > closesAt) return 'CLOSED';
  return Number.isFinite(opensAt) && Number.isFinite(closesAt) ? 'OPEN' : 'CLOSED';
}

function registrationLabel(edition) {
  return ({ UPCOMING: 'Evento confirmado', OPEN: 'Inscrições abertas', CLOSED: 'Inscrições encerradas' })[registrationState(edition)] || statusLabel(edition?.status);
}

function registrationPeriod(edition) {
  return `Inscrições de ${dateTime(edition?.registration_opens_at)} até ${dateTime(edition?.registration_closes_at)}.`;
}

export function loading(container, message = 'Carregando informacoes...') {
  if (container) container.innerHTML = `<div class="data-state" role="status"><span class="data-spinner"></span>${escapeHtml(message)}</div>`;
}

export function error(container, message) {
  if (container) container.innerHTML = `<div class="data-state data-state-error"><b>Nao foi possivel carregar.</b><span>${escapeHtml(message)}</span></div>`;
}

export function renderFairs(container, fairs, limit) {
  const now = Date.now();
  const eligible = fairs.flatMap(fair => (fair.editions || [])
    .filter(edition => edition.status === 'PUBLISHED' && new Date(edition.ends_at).getTime() > now)
    .map(edition => ({ fair, edition })))
    .sort((left,right)=>new Date(left.edition.starts_at)-new Date(right.edition.starts_at));
  const visible = limit ? eligible.slice(0, limit) : eligible;
  if (!visible.length) return error(container, 'Nenhuma feira publicada no momento.');
  container.innerHTML = visible.map(({fair,edition}) => {
    const href = edition ? `feira-beco.html?edicao=${encodeURIComponent(edition.slug)}` : 'feiras.html';
    const title = edition?.title || 'Edição da feira';
    return `<article class="fair-card"><img src="${escapeHtml(cover(edition))}" alt="${escapeHtml(edition?.title || title)}" loading="lazy"><div class="fair-card-content"><span class="tag">${escapeHtml(registrationLabel(edition))}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(edition ? `${date(edition.starts_at)} · ${edition.location?.city || 'Sorocaba'}` : fair.short_description || '')}</p><a class="card-link" href="${href}">Ver feira &rarr;</a></div></article>`;
  }).join('');
  [...container.querySelectorAll('.fair-card')].forEach((card,index)=>{
    const edition=visible[index].edition;
    const tag=card.querySelector('.tag');
    if(tag)tag.textContent=registrationLabel(edition);
    const eventPeriod=card.querySelector('.fair-card-content > p');
    if(eventPeriod&&edition)eventPeriod.textContent=`De ${dateTime(edition.starts_at)} até ${dateTime(edition.ends_at)} · ${edition.location?.city||'Sorocaba'}`;
    if(edition?.registration_opens_at&&edition?.registration_closes_at){const period=document.createElement('p');period.className='fair-registration-period';period.textContent=registrationPeriod(edition);card.querySelector('.fair-card-content')?.insertBefore(period,card.querySelector('.card-link'));}
  });
}

export function renderExhibitors(container, exhibitors, limit) {
  const visible = limit ? exhibitors.slice(0, limit) : exhibitors;
  if (!visible.length) return error(container, 'Nenhum expositor publico encontrado.');
  container.innerHTML = visible.map(exhibitor => `<article class="exhibitor-card" data-exhibitor-card data-category="${escapeHtml(exhibitor.categories?.[0]?.slug || '')}"><img src="${escapeHtml(portfolioCover(exhibitor))}" alt="Produtos de ${escapeHtml(exhibitor.display_name)}" loading="lazy"><div class="exhibitor-card-content"><span class="tag">${escapeHtml(exhibitor.categories?.[0]?.name || 'Economia criativa')}</span><h3>${escapeHtml(exhibitor.display_name)}</h3><p>${escapeHtml(exhibitor.bio || `${exhibitor.city || 'Sorocaba'} · ${exhibitor.state || 'SP'}`)}</p><a class="card-link" href="expositor.html?id=${encodeURIComponent(exhibitor.id)}">Ver portfolio &rarr;</a></div></article>`).join('');
}

export function renderMetrics(container, fairs, exhibitors) {
  const editions = fairs.flatMap(fair => fair.editions || []);
  const upcoming = editions.filter(item => new Date(item.ends_at) >= new Date()).length;
  const open = editions.filter(item => registrationState(item) === 'OPEN').length;
  container.innerHTML = `<article><strong>${exhibitors.length}</strong><span>expositores publicos</span></article><article><strong>${upcoming}</strong><span>edicoes anunciadas</span></article><article><strong>${open}</strong><span>feiras com inscricoes abertas</span></article>`;
}

export function renderCategoryOptions(select, categories) {
  if (select) select.innerHTML = '<option value="">Todas as categorias</option>' + categories.map(item => `<option value="${escapeHtml(item.slug)}">${escapeHtml(item.name)}</option>`).join('');
}

function evaluationMetrics(summary) {
  const labels={organizationCommunication:'Organização e comunicação',structure:'Estrutura',publicity:'Divulgação',audience:'Público e visitação',overall:'Experiência geral',sales:'Vendas'};
  return Object.entries(labels).map(([key,label])=>{const metric=summary?.metrics?.[key];return `<article><span>${escapeHtml(label)}</span><b>${metric?.average==null?'Amostra insuficiente':`${escapeHtml(metric.average)}/5`}</b><small>${escapeHtml(metric?.responses||0)} resposta(s)</small></article>`;}).join('');
}

function imageAlt(item,index,context) {
  return item.altText || item.alt_text || `Imagem ${index + 1} de ${context}`;
}

function createImageCarousel(images,{eyebrow,title,description,context}) {
  const section=document.createElement('section');
  section.className='section edition-gallery';
  if(!images.length){
    section.innerHTML=`<div class="section-heading"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2></div><p>${escapeHtml(description)}</p></div><div class="data-state">Este expositor ainda não possui imagens públicas.</div>`;
    return section;
  }
  const multiple=images.length>1;
  section.innerHTML=`<div class="section-heading"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2></div><p>${escapeHtml(description)}</p></div><div class="edition-gallery-shell${multiple?'':' single-image'}"><button type="button" class="edition-gallery-arrow previous" aria-label="Imagens anteriores" ${multiple?'':'hidden'}>‹</button><div class="edition-gallery-track">${images.map((item,index)=>`<button type="button" class="edition-gallery-slide" data-gallery-image="${index}" aria-label="Ampliar: ${escapeHtml(imageAlt(item,index,context))}"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(imageAlt(item,index,context))}" loading="lazy"></button>`).join('')}</div><button type="button" class="edition-gallery-arrow next" aria-label="Próximas imagens" ${multiple?'':'hidden'}>›</button></div>`;
  const track=section.querySelector('.edition-gallery-track');
  let timer;
  const pause=()=>clearInterval(timer);
  const advance=direction=>{const distance=Math.max(280,track.clientWidth*.82)*direction;if(direction>0&&track.scrollLeft+track.clientWidth>=track.scrollWidth-8)track.scrollTo({left:0,behavior:'smooth'});else track.scrollBy({left:distance,behavior:'smooth'});};
  const start=()=>{pause();if(multiple)timer=setInterval(()=>advance(1),5000);};
  if(multiple){
    section.querySelector('.previous').addEventListener('click',()=>{advance(-1);start();});
    section.querySelector('.next').addEventListener('click',()=>{advance(1);start();});
    ['pointerenter','focusin','touchstart'].forEach(type=>section.addEventListener(type,pause));
    ['pointerleave','focusout','touchend'].forEach(type=>section.addEventListener(type,start));
  }
  section.querySelectorAll('[data-gallery-image]').forEach(button=>button.addEventListener('click',()=>{
    pause();
    const index=Number(button.dataset.galleryImage);
    const item=images[index];
    const lightbox=document.createElement('dialog');
    lightbox.className='gallery-lightbox';
    lightbox.innerHTML=`<button type="button" aria-label="Fechar">×</button><img src="${escapeHtml(item.url)}" alt="${escapeHtml(imageAlt(item,index,context))}">`;
    document.body.append(lightbox);
    lightbox.querySelector('button').addEventListener('click',()=>lightbox.close());
    lightbox.addEventListener('click',event=>{if(event.target===lightbox)lightbox.close();});
    lightbox.addEventListener('close',()=>{lightbox.remove();start();},{once:true});
    lightbox.showModal();
  }));
  start();
  return section;
}

export function renderFairDetail(main, edition, evaluationSummary, organizationSummary) {
  const exhibitors = edition.confirmedExhibitors || [];
  const registrationOpen = registrationState(edition) === 'OPEN';
  main.innerHTML = `<section class="fair-landing"><div class="fair-landing-media"><img src="${escapeHtml(cover(edition))}" alt="${escapeHtml(edition.title)}"></div><div><span class="eyebrow">${escapeHtml(edition.edition_number ? `${edition.edition_number}º edicao` : edition.fair.name)}</span><h1>${escapeHtml(edition.title)}</h1><p>${escapeHtml(edition.public_description)}</p><div class="event-meta"><div><span>Data</span><b>${escapeHtml(date(edition.starts_at))}</b></div><div><span>Local</span><b>${escapeHtml(`${edition.location?.name || edition.location?.neighborhood || 'Sorocaba'} · ${edition.location?.city || 'Sorocaba'}`)}</b></div><div><span>Curadoria</span><b>Equipe da Associacao</b></div><div><span>Inscricoes</span><b>${escapeHtml(registrationOpen ? `Abertas ate ${date(edition.registration_closes_at)}` : (edition.status === 'REGISTRATION_OPEN' ? 'Inscrições encerradas' : statusLabel(edition.status)))}</b></div></div><div class="hero-actions">${registrationOpen ? `<a class="btn btn-primary" href="inscricao-expositor.html?edicao=${encodeURIComponent(edition.id)}">Quero participar</a>` : ''}<a class="btn btn-outline" href="#confirmados">Ver confirmados</a></div></div></section><section class="section" id="confirmados"><div class="section-heading"><div><span class="eyebrow">Proxima edicao</span><h2>Expositores confirmados</h2></div><p>Lista atualizada diretamente pela curadoria.</p></div><div class="confirmed-list">${exhibitors.length ? exhibitors.map(item => `<article class="confirmed-person"><img src="${escapeHtml(portfolioCover(item))}" alt="${escapeHtml(item.display_name)}"><b>${escapeHtml(item.display_name)}</b><span>${escapeHtml(item.city || '')}</span><a class="card-link" href="expositor.html?id=${encodeURIComponent(item.id)}">Ver perfil</a></article>`).join('') : '<div class="data-state">Os expositores confirmados aparecerao aqui.</div>'}</div></section><section class="section" hidden><div class="section-heading"><div><span class="eyebrow">Avaliação dos participantes</span><h2>Como foi esta edição</h2></div><p>Médias publicadas a partir de três respostas elegíveis.</p></div><div class="dash-stats">${evaluationMetrics(evaluationSummary)}</div><h3>A Associação como produtora</h3><div class="dash-stats">${evaluationMetrics(organizationSummary)}</div></section><section class="section edition-location"><div class="section-heading"><div><span class="eyebrow">Endereço</span><h2>Onde a feira acontece</h2></div></div><p class="edition-location-address">${escapeHtml([edition.location?.address_line,edition.location?.address_number,edition.location?.complement,edition.location?.neighborhood,edition.location?.city,edition.location?.state].filter(Boolean).join(', '))}</p><div data-event-map></div></section>`;
  const confirmedSection=main.querySelector('#confirmados');
  const confirmedEyebrow=confirmedSection?.querySelector('.section-heading .eyebrow');
  if(confirmedEyebrow)confirmedEyebrow.textContent='Veja quem estará esperando por você nesta edição';
  confirmedSection?.querySelector(':scope > .section-heading > p')?.remove();
  if(!exhibitors.length){
    const emptyConfirmed=confirmedSection?.querySelector('.data-state');
    const state=registrationState(edition);
    if(emptyConfirmed&&state==='UPCOMING')emptyConfirmed.textContent=`Aguarde. As inscrições para tentar fazer parte dos expositores confirmados abrirão em ${dateTime(edition.registration_opens_at)} e seguirão até ${dateTime(edition.registration_closes_at)}.`;
    else if(emptyConfirmed&&state==='OPEN')emptyConfirmed.textContent=`Seleção em andamento. As inscrições estão abertas até ${dateTime(edition.registration_closes_at)}. Os expositores confirmados serão apresentados aqui após a conclusão da curadoria.`;
    else if(emptyConfirmed)emptyConfirmed.textContent='Aguarde a divulgação dos expositores confirmados desta edição.';
  }
  const locationAddress=main.querySelector('.edition-location-address');
  if(locationAddress&&edition.location?.postal_code)locationAddress.textContent+=`, CEP ${edition.location.postal_code}`;
  const galleryImages=(edition.media||[]).filter(item=>item.role==='GALLERY');
  if(galleryImages.length)main.querySelector('#confirmados')?.before(createImageCarousel(galleryImages,{eyebrow:'Galeria',title:'Imagens desta edição',description:'Conheça os espaços, produtos e momentos preparados para a feira.',context:'esta edição'}));
  const eventMetaItems=[...main.querySelectorAll('.event-meta > div')];
  const eventDateMeta=eventMetaItems.find(item=>item.querySelector('span')?.textContent.trim()==='Data')?.querySelector('b');
  if(eventDateMeta)eventDateMeta.textContent=`De ${dateTime(edition.starts_at)} até ${dateTime(edition.ends_at)}`;
  eventMetaItems.find(item=>item.querySelector('span')?.textContent.trim()==='Curadoria')?.remove();
  const registrationMeta=eventMetaItems.find(item=>item.querySelector('span')?.textContent.trim()==='Inscricoes')?.querySelector('b');
  if(registrationMeta){const state=registrationState(edition);registrationMeta.textContent=state==='OPEN'?`Inscrições abertas · ${registrationPeriod(edition)}`:state==='CLOSED'?`Inscrições encerradas · ${registrationPeriod(edition)}`:`Evento confirmado · ${registrationPeriod(edition)}`;}
  document.title = `${edition.title} | BECO`;
}

export function renderExhibitorDetail(main, exhibitor) {
  const images=exhibitor.portfolio||[];
  const featuredImage=images.find(item=>item.is_featured)||images[0]||null;
  const image=featuredImage?.url||null;
  const socialLinks={...(exhibitor.social_links||{})};
  if(exhibitor.instagram_url&&!socialLinks.instagram)socialLinks.instagram=exhibitor.instagram_url;
  const social=Object.entries(socialLinks).filter(([,url])=>/^https?:\/\//.test(url));
  const socialLabels={instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',youtube:'YouTube',website:'Site',whatsapp:'WhatsApp',catalog:'Catálogo'};
  const categories=(exhibitor.categories||[]).map(item=>`<span class="tag">${escapeHtml(item.name)}</span>`).join('')||'<span class="tag">Economia criativa</span>';
  const location=[exhibitor.city,exhibitor.state].filter(Boolean).join(' · ');
  const phone=String(exhibitor.phone||'').trim();
  const phoneHref=phone.replace(/\D/g,'');
  const contactItems=[
    exhibitor.contact_name?`<div><span>Contato</span><b>${escapeHtml(exhibitor.contact_name)}</b></div>`:'',
    phone?`<div><span>Celular / WhatsApp</span><b><a href="${phoneHref?`https://wa.me/${escapeHtml(phoneHref)}`:'#'}" ${phoneHref?'target="_blank" rel="noopener noreferrer"':''}>${escapeHtml(phone)}</a></b></div>`:'',
    location?`<div><span>Localização</span><b>${escapeHtml(location)}</b></div>`:''
  ].filter(Boolean).join('');
  main.innerHTML=`<section class="fair-landing exhibitor-landing"><div class="fair-landing-media exhibitor-landing-media${image?'':' is-empty'}">${image?`<img src="${escapeHtml(image)}" alt="${escapeHtml(featuredImage.alt_text||`Produtos de ${exhibitor.display_name}`)}">`:'<div class="exhibitor-image-empty" aria-label="Perfil sem imagens públicas"><span aria-hidden="true">BECO</span><p>Imagens do portfólio serão apresentadas aqui quando estiverem disponíveis.</p></div>'}</div><div><span class="eyebrow">Expositor BECO</span><h1>${escapeHtml(exhibitor.display_name)}</h1><div class="exhibitor-category-list">${categories}</div><p>${escapeHtml(exhibitor.bio||'Este expositor ainda não publicou uma apresentação.')}</p>${contactItems?`<div class="event-meta exhibitor-meta">${contactItems}</div>`:''}${social.length?`<div class="exhibitor-links"><span>Links do expositor</span><div class="social-row">${social.map(([name,url])=>`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(socialLabels[name]||name)}</a>`).join('')}</div></div>`:''}</div></section><div data-exhibitor-gallery></div><section class="section"><div class="section-heading"><div><span class="eyebrow">Participações</span><h2>Feiras confirmadas</h2></div></div><div class="fair-grid">${(exhibitor.fairHistory||[]).map(item=>`<article class="fair-card"><div class="fair-card-content"><span class="tag">${escapeHtml(date(item.starts_at))}</span><h3>${escapeHtml(item.title)}</h3><a class="card-link" href="feira-beco.html?edicao=${encodeURIComponent(item.slug)}">Ver feira &rarr;</a></div></article>`).join('')||'<div class="data-state">Nenhuma participação pública no momento.</div>'}</div></section>`;
  main.querySelector('[data-exhibitor-gallery]').replaceWith(createImageCarousel(images,{eyebrow:'Galeria',title:'Produtos e processos',description:'Imagens aprovadas pela curadoria e publicadas pelo expositor.',context:`${exhibitor.display_name}`}));
  document.title = `${exhibitor.display_name} | Expositor BECO`;
}
