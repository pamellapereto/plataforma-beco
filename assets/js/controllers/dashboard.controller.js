import { api } from '../models/api.model.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function date(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)) : 'A definir';
}

function applicationStatus(status) {
  return ({ DRAFT: 'Rascunho', SUBMITTED: 'Recebida', PHOTO_REVIEW: 'Fotos em analise', UNDER_REVIEW: 'Em analise', AWAITING_UPDATE: 'Ajuste solicitado', WAITLISTED: 'Lista de espera', APPROVED: 'Aprovada', CONFIRMED: 'Confirmada', DECLINED: 'Nao selecionada', CANCELLED: 'Cancelada' })[status] || status;
}

function statusClass(status) {
  if (['APPROVED', 'CONFIRMED'].includes(status)) return 'approved';
  if (['DECLINED', 'CANCELLED'].includes(status)) return 'rejected';
  if (['UNDER_REVIEW', 'PHOTO_REVIEW', 'SUBMITTED'].includes(status)) return 'review';
  return 'pending';
}

async function exhibitorDashboard() {
  const [profile, applications] = await Promise.all([api.myExhibitor(), api.myApplications()]);
  const stats = document.querySelector('.dash-stats');
  const next = applications.filter(item => new Date(item.edition?.ends_at) >= new Date()).sort((a, b) => new Date(a.edition?.starts_at) - new Date(b.edition?.starts_at))[0];
  const confirmed = applications.filter(item => item.status === 'CONFIRMED').length;
  if (stats) stats.innerHTML = `<article><span>Cadastro</span><b>${escapeHtml(profile.status === 'APPROVED' ? 'Aprovado' : 'Em analise')}</b></article><article><span>Proxima feira</span><b>${escapeHtml(next?.edition?.fair?.name || 'Nenhuma')}</b></article><article><span>Participacoes confirmadas</span><b>${confirmed}</b></article><article><span>Perfil</span><b>${profile.profile_visibility === 'PUBLIC' ? 'Publico' : 'Privado'}</b></article>`;
  const table = document.querySelector('#historico tbody');
  if (table) table.innerHTML = applications.map(item => `<tr><td>${escapeHtml(item.edition?.fair?.name || item.edition?.title || 'Feira')}</td><td>${escapeHtml(date(item.edition?.starts_at))}</td><td><span class="status ${statusClass(item.status)}">${escapeHtml(applicationStatus(item.status))}</span></td><td>${escapeHtml(item.requested_space_type || 'A definir')}</td></tr>`).join('') || '<tr><td colspan="4">Nenhuma inscricao encontrada.</td></tr>';
}

async function curationDashboard() {
  const [dashboard, fairs] = await Promise.all([api.curationDashboard(), api.adminFairs()]);
  const stats = document.querySelector('.dash-stats');
  if (stats) stats.innerHTML = `<article><span>Inscricoes em analise</span><b>${dashboard.applicationsInReview}</b></article><article><span>Fotos pendentes</span><b>${dashboard.mediaPending}</b></article><article><span>Pedidos de isencao</span><b>${dashboard.exceptionRequestsPending}</b></article><article><span>Feiras com inscricoes abertas</span><b>${dashboard.registrationsOpen}</b></article>`;

  const editions = fairs.flatMap(fair => (fair.editions || []).map(edition => ({ ...edition, fair })));
  const context = document.querySelector('.fair-context');
  if (context) context.innerHTML = editions.slice(0, 4).map((edition, index) => `<article class="fair-context-card${index === 0 ? ' active' : ''}"><span class="eyebrow">${index === 0 ? 'Edicao em foco' : 'Feira cadastrada'}</span><h2>${escapeHtml(edition.title)}</h2><p>${escapeHtml(date(edition.starts_at))} · ${escapeHtml(edition.location?.city || 'Sorocaba')}</p><div><span class="status ${statusClass(edition.status)}">${escapeHtml(edition.status === 'REGISTRATION_OPEN' ? 'Inscricoes abertas' : edition.status)}</span><b>${edition.exhibitor_capacity} vagas</b></div></article>`).join('');

  const focus = editions.find(item => item.status === 'REGISTRATION_OPEN') || editions[0];
  if (!focus) return;
  const applications = await api.curationApplications(focus.id);
  const tbody = document.querySelector('#inscricoes tbody');
  if (tbody) tbody.innerHTML = applications.map(item => `<tr><td><div class="table-person"><div><b>${escapeHtml(item.exhibitor?.display_name || 'Expositor')}</b><span>${escapeHtml(item.exhibitor?.city || '')}</span></div></div></td><td>${escapeHtml(item.exhibitor?.categories?.[0]?.name || 'Sem categoria')}</td><td><span class="status approved">Recebido</span></td><td><span class="status ${item.mediaSummary?.every(status => status === 'APPROVED') ? 'approved' : 'review'}">${item.mediaSummary?.length || 0} arquivo(s)</span></td><td>${item.exceptionRequest ? `<span class="status pending">${escapeHtml(item.exceptionRequest.status)}</span>` : 'Nao solicitada'}</td><td><span class="status ${statusClass(item.status)}">${escapeHtml(applicationStatus(item.status))}</span></td><td><button class="btn btn-small btn-primary" type="button" data-application-id="${escapeHtml(item.id)}">Ver formulario</button></td></tr>`).join('') || '<tr><td colspan="7">Nenhuma inscricao nesta edicao.</td></tr>';
}

export async function initializeDashboard(page) {
  try {
    if (page === 'exhibitor-dashboard') await exhibitorDashboard();
    if (page === 'curation-dashboard') await curationDashboard();
  } catch (problem) {
    window.becoShowToast?.(problem.message || 'Nao foi possivel carregar o painel.');
  }
}
