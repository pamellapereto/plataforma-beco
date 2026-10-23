const fallbackFairImage = 'assets/evento-artesanato-human.jpg';
const fallbackExhibitorImage = 'assets/expositor-madeira-human.jpg';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function date(value, options = {}) {
  if (!value) return 'Data a confirmar';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric', ...options }).format(new Date(value));
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
  return ({ REGISTRATION_OPEN: 'Inscricoes abertas', PUBLISHED: 'Programacao publicada', CURATION: 'Em curadoria', CONFIRMED: 'Confirmada', FINISHED: 'Realizada' })[status] || 'Em breve';
}

export function loading(container, message = 'Carregando informacoes...') {
  if (container) container.innerHTML = `<div class="data-state" role="status"><span class="data-spinner"></span>${escapeHtml(message)}</div>`;
}

export function error(container, message) {
  if (container) container.innerHTML = `<div class="data-state data-state-error"><b>Nao foi possivel carregar.</b><span>${escapeHtml(message)}</span></div>`;
}

export function renderFairs(container, fairs, limit) {
  const visible = limit ? fairs.slice(0, limit) : fairs;
  if (!visible.length) return error(container, 'Nenhuma feira publicada no momento.');
  container.innerHTML = visible.map(fair => {
    const edition = latestEdition(fair);
    const href = edition ? `feira-beco.html?edicao=${encodeURIComponent(edition.slug)}` : 'feiras.html';
    return `<article class="fair-card"><img src="${escapeHtml(cover(edition))}" alt="${escapeHtml(edition?.title || fair.name)}" loading="lazy"><div class="fair-card-content"><span class="tag">${escapeHtml(edition?.status === 'REGISTRATION_OPEN' && ((edition.registration_closes_at && new Date(edition.registration_closes_at)<new Date()) || new Date(edition.ends_at)<new Date()) ? 'Inscrições encerradas' : statusLabel(edition?.status))}</span><h3>${escapeHtml(edition?.title || fair.name)}</h3><p>${escapeHtml(edition ? `${date(edition.starts_at)} · ${edition.location?.city || 'Sorocaba'}` : fair.short_description || '')}</p><a class="card-link" href="${href}">Ver feira &rarr;</a></div></article>`;
  }).join('');
}

export function renderExhibitors(container, exhibitors, limit) {
  const visible = limit ? exhibitors.slice(0, limit) : exhibitors;
  if (!visible.length) return error(container, 'Nenhum expositor publico encontrado.');
  container.innerHTML = visible.map(exhibitor => `<article class="exhibitor-card" data-exhibitor-card data-category="${escapeHtml(exhibitor.categories?.[0]?.slug || '')}"><img src="${escapeHtml(portfolioCover(exhibitor))}" alt="Produtos de ${escapeHtml(exhibitor.display_name)}" loading="lazy"><div class="exhibitor-card-content"><span class="tag">${escapeHtml(exhibitor.categories?.[0]?.name || 'Economia criativa')}</span><h3>${escapeHtml(exhibitor.display_name)}</h3><p>${escapeHtml(exhibitor.bio || `${exhibitor.city || 'Sorocaba'} · ${exhibitor.state || 'SP'}`)}</p><a class="card-link" href="expositor.html?id=${encodeURIComponent(exhibitor.id)}">Ver portfolio &rarr;</a></div></article>`).join('');
}

export function renderMetrics(container, fairs, exhibitors) {
  const editions = fairs.flatMap(fair => fair.editions || []);
  const upcoming = editions.filter(item => new Date(item.ends_at) >= new Date()).length;
  const open = editions.filter(item => item.status === 'REGISTRATION_OPEN' && new Date(item.ends_at) > new Date() && (!item.registration_opens_at || new Date(item.registration_opens_at)<=new Date()) && (!item.registration_closes_at || new Date(item.registration_closes_at)>=new Date())).length;
  container.innerHTML = `<article><strong>${exhibitors.length}</strong><span>expositores publicos</span></article><article><strong>${upcoming}</strong><span>edicoes anunciadas</span></article><article><strong>${open}</strong><span>feiras com inscricoes abertas</span></article><article><strong>${fairs.length}</strong><span>feiras com identidades proprias</span></article>`;
}

export function renderCategoryOptions(select, categories) {
  if (select) select.innerHTML = '<option value="">Todas as categorias</option>' + categories.map(item => `<option value="${escapeHtml(item.slug)}">${escapeHtml(item.name)}</option>`).join('');
}

function evaluationMetrics(summary) {
  const labels={organizationCommunication:'Organização e comunicação',structure:'Estrutura',publicity:'Divulgação',audience:'Público e visitação',overall:'Experiência geral',sales:'Vendas'};
  return Object.entries(labels).map(([key,label])=>{const metric=summary?.metrics?.[key];return `<article><span>${escapeHtml(label)}</span><b>${metric?.average==null?'Amostra insuficiente':`${escapeHtml(metric.average)}/5`}</b><small>${escapeHtml(metric?.responses||0)} resposta(s)</small></article>`;}).join('');
}

export function renderFairDetail(main, edition, evaluationSummary, organizationSummary) {
  const exhibitors = edition.confirmedExhibitors || [];
  const registrationOpen = edition.status === 'REGISTRATION_OPEN' && new Date(edition.ends_at) > new Date() && (!edition.registration_opens_at || new Date(edition.registration_opens_at) <= new Date()) && (!edition.registration_closes_at || new Date(edition.registration_closes_at) >= new Date());
  main.innerHTML = `<section class="fair-landing"><div class="fair-landing-media"><img src="${escapeHtml(cover(edition))}" alt="${escapeHtml(edition.title)}"></div><div><span class="eyebrow">${escapeHtml(edition.edition_number ? `${edition.edition_number}a edicao` : edition.fair.name)}</span><h1>${escapeHtml(edition.title)}</h1><p>${escapeHtml(edition.public_description)}</p><div class="event-meta"><div><span>Data</span><b>${escapeHtml(date(edition.starts_at))}</b></div><div><span>Local</span><b>${escapeHtml(`${edition.location?.name || edition.location?.neighborhood || 'Sorocaba'} · ${edition.location?.city || 'Sorocaba'}`)}</b></div><div><span>Curadoria</span><b>Equipe da Associacao</b></div><div><span>Inscricoes</span><b>${escapeHtml(registrationOpen ? `Abertas ate ${date(edition.registration_closes_at)}` : (edition.status === 'REGISTRATION_OPEN' ? 'Inscrições encerradas' : statusLabel(edition.status)))}</b></div></div><div class="hero-actions">${registrationOpen ? `<a class="btn btn-primary" href="inscricao-expositor.html?edicao=${encodeURIComponent(edition.id)}">Quero participar</a>` : ''}<a class="btn btn-outline" href="#confirmados">Ver confirmados</a></div></div></section><section class="section" id="confirmados"><div class="section-heading"><div><span class="eyebrow">Proxima edicao</span><h2>Expositores confirmados</h2></div><p>Lista atualizada diretamente pela curadoria.</p></div><div class="confirmed-list">${exhibitors.length ? exhibitors.map(item => `<article class="confirmed-person"><img src="${escapeHtml(portfolioCover(item))}" alt="${escapeHtml(item.display_name)}"><b>${escapeHtml(item.display_name)}</b><span>${escapeHtml(item.city || '')}</span><a class="card-link" href="expositor.html?id=${encodeURIComponent(item.id)}">Ver perfil</a></article>`).join('') : '<div class="data-state">Os expositores confirmados aparecerao aqui.</div>'}</div></section><section class="section"><div class="section-heading"><div><span class="eyebrow">Avaliação dos participantes</span><h2>Como foi esta edição</h2></div><p>Médias publicadas a partir de três respostas elegíveis.</p></div><div class="dash-stats">${evaluationMetrics(evaluationSummary)}</div><h3>A Associação como produtora</h3><div class="dash-stats">${evaluationMetrics(organizationSummary)}</div></section><section class="section"><div class="section-heading"><div><span class="eyebrow">Endereco</span><h2>Onde a feira acontece</h2></div><p>${escapeHtml([edition.location?.address_line, edition.location?.neighborhood, edition.location?.city, edition.location?.state].filter(Boolean).join(' · '))}</p></div><div data-event-map></div></section>`;
  document.title = `${edition.title} | BECO`;
}

export function renderExhibitorDetail(main, exhibitor) {
  const image = portfolioCover(exhibitor);
  const social = Object.entries(exhibitor.social_links || {}).filter(([, url]) => /^https?:\/\//.test(url));
  main.innerHTML = `<section class="profile-hero"><img src="${escapeHtml(image)}" alt="Produtos de ${escapeHtml(exhibitor.display_name)}"><div><span class="eyebrow">Expositor BECO</span><h1>${escapeHtml(exhibitor.display_name)}</h1><span class="tag">${escapeHtml(exhibitor.categories?.[0]?.name || 'Economia criativa')}</span><p>${escapeHtml(exhibitor.bio || '')}</p><div class="social-row">${social.map(([name, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`).join('')}</div></div></section><section class="section"><div class="section-heading"><div><span class="eyebrow">Galeria</span><h2>Produtos e processos</h2></div><p>Imagens aprovadas pela curadoria e publicadas pelo expositor.</p></div><div class="gallery-grid">${exhibitor.portfolio?.length ? exhibitor.portfolio.map(item => `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt_text || exhibitor.display_name)}" loading="lazy">`).join('') : `<img src="${escapeHtml(image)}" alt="${escapeHtml(exhibitor.display_name)}">`}</div></section><section class="section"><div class="section-heading"><div><span class="eyebrow">Participacoes</span><h2>Feiras confirmadas</h2></div></div><div class="fair-grid">${(exhibitor.fairHistory || []).map(item => `<article class="fair-card"><div class="fair-card-content"><span class="tag">${escapeHtml(date(item.starts_at))}</span><h3>${escapeHtml(item.title)}</h3><a class="card-link" href="feira-beco.html?edicao=${encodeURIComponent(item.slug)}">Ver feira &rarr;</a></div></article>`).join('') || '<div class="data-state">Nenhuma participacao publica no momento.</div>'}</div></section>`;
  document.title = `${exhibitor.display_name} | Expositor BECO`;
}
