import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { EmailService } from '../../lib/email.js';
import { supabaseGateway } from '../../lib/supabase.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { validateUuid } from '../fairs/fairs.validation.js';
import { validateDecision, validateExceptionDecision, validateMediaReview } from './curation.validation.js';

import { participationHistory } from './participation-history.js';

const transitions = {
  SUBMITTED: ['PHOTO_REVIEW', 'UNDER_REVIEW', 'AWAITING_UPDATE', 'WAITLISTED', 'APPROVED', 'DECLINED'],
  PHOTO_REVIEW: ['UNDER_REVIEW', 'AWAITING_UPDATE', 'DECLINED'],
  UNDER_REVIEW: ['AWAITING_UPDATE', 'WAITLISTED', 'APPROVED', 'DECLINED'],
  AWAITING_UPDATE: ['PHOTO_REVIEW', 'UNDER_REVIEW', 'DECLINED'],
  WAITLISTED: ['APPROVED', 'DECLINED'],
  APPROVED: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  DRAFT: [], DECLINED: [], CANCELLED: [], FINISHED: []
};

export class CurationService {
  constructor(gateway = supabaseGateway, applicationsService, emailService = new EmailService()) {
    this.gateway = gateway;
    this.applications = applicationsService || new ApplicationsService(gateway);
    this.email = emailService;
  }

  async assertEdition(editionId, principal) {
    requireBecoAdmin(principal);
    validateUuid(editionId, 'Edição');
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=id,fair_id,title,status,starts_at&id=eq.${editionId}&limit=1`);
    const edition = editions[0];
    if (!edition) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id&id=eq.${edition.fair_id}&organization_id=eq.${principal.organizationId}&limit=1`);
    if (!fairs[0]) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    return edition;
  }

  async list(editionId, filters, principal) {
    const edition = await this.assertEdition(editionId, principal);
    const allowed = ['DRAFT', 'SUBMITTED', 'PHOTO_REVIEW', 'UNDER_REVIEW', 'AWAITING_UPDATE', 'WAITLISTED', 'APPROVED', 'CONFIRMED', 'DECLINED', 'CANCELLED'];
    const status = filters.status ? String(filters.status).toUpperCase() : null;
    if (status && !allowed.includes(status)) throw new HttpError(422, 'INVALID_STATUS', 'Filtro de status inválido.');
    const statusFilter = status ? `&status=eq.${status}` : '';
    const applications = await this.gateway.request(`rest/v1/applications?select=*&fair_edition_id=eq.${editionId}${statusFilter}&order=created_at.desc`);
    if (!applications.length) return [];
    const applicationIds = applications.map((item) => item.id);
    const exhibitorIds = [...new Set(applications.map((item) => item.exhibitor_id))];
    const [exhibitors, media, exceptions, categoryLinks, history] = await Promise.all([
      this.gateway.request(`rest/v1/exhibitors?select=id,display_name,contact_name,phone,instagram_url,city,state&id=in.(${exhibitorIds.join(',')})`),
      this.gateway.request(`rest/v1/application_media?select=application_id,media_asset_id&application_id=in.(${applicationIds.join(',')})`),
      this.gateway.request(`rest/v1/application_exception_requests?select=application_id,status,request_type&application_id=in.(${applicationIds.join(',')})`),
      this.gateway.request(`rest/v1/exhibitor_category_links?select=exhibitor_id,category_id&exhibitor_id=in.(${exhibitorIds.join(',')})`),
      participationHistory(this.gateway, principal.organizationId, edition, exhibitorIds)
    ]);
    const categoryIds = [...new Set(categoryLinks.map((item) => item.category_id))];
    const categories = categoryIds.length
      ? await this.gateway.request(`rest/v1/exhibitor_categories?select=id,name,slug&id=in.(${categoryIds.join(',')})`)
      : [];
    const assetsIds = media.map((item) => item.media_asset_id);
    const assets = assetsIds.length
      ? await this.gateway.request(`rest/v1/media_assets?select=id,review_status&id=in.(${assetsIds.join(',')})`)
      : [];
    const exhibitorById = new Map(exhibitors.map((item) => [item.id, item]));
    const reviewByAsset = new Map(assets.map((item) => [item.id, item.review_status]));
    const mediaByApplication = new Map();
    for (const item of media) {
      if (!mediaByApplication.has(item.application_id)) mediaByApplication.set(item.application_id, []);
      mediaByApplication.get(item.application_id).push(reviewByAsset.get(item.media_asset_id));
    }
    const exceptionByApplication = new Map(exceptions.map((item) => [item.application_id, item]));
    const categoryById = new Map(categories.map((item) => [item.id, item]));
    const categoriesByExhibitor = new Map();
    for (const link of categoryLinks) {
      if (!categoriesByExhibitor.has(link.exhibitor_id)) categoriesByExhibitor.set(link.exhibitor_id, []);
      const category = categoryById.get(link.category_id);
      if (category) categoriesByExhibitor.get(link.exhibitor_id).push(category);
    }
    return applications.map((application) => ({
      ...application,
      exhibitor: exhibitorById.has(application.exhibitor_id)
        ? { ...exhibitorById.get(application.exhibitor_id), categories: categoriesByExhibitor.get(application.exhibitor_id) || [] }
        : null,
      participationHistory: history.get(application.exhibitor_id),
      mediaSummary: mediaByApplication.get(application.id) || [],
      exceptionRequest: exceptionByApplication.get(application.id) || null
    }));
  }

  async detail(applicationId, principal) {
    requireBecoAdmin(principal);
    const detail = await this.applications.detail(applicationId, principal);
    const exhibitors = await this.gateway.request(`rest/v1/exhibitors?select=*&id=eq.${detail.application.exhibitor_id}&limit=1`);
    const exhibitor = exhibitors[0];
    if (!exhibitor) return { ...detail, exhibitor: null };
    const [users, categoryLinks] = await Promise.all([
      this.gateway.request(`rest/v1/app_users?select=id,email,full_name,is_active&id=eq.${exhibitor.user_id}&limit=1`),
      this.gateway.request(`rest/v1/exhibitor_category_links?select=category_id&exhibitor_id=eq.${exhibitor.id}`)
    ]);
    const categoryIds = categoryLinks.map((item) => item.category_id);
    const categories = categoryIds.length
      ? await this.gateway.request(`rest/v1/exhibitor_categories?select=id,name,slug&id=in.(${categoryIds.join(',')})`)
      : [];
    return { ...detail, exhibitor: { ...exhibitor, account: users[0] || null, categories } };
  }

  async decide(applicationId, input, principal) {
    requireBecoAdmin(principal);
    const application = await this.applications.applicationAccess(applicationId, principal);
    const decision = validateDecision(input);
    if (decision.status !== application.status && !(transitions[application.status] || []).includes(decision.status)) {
      throw new HttpError(409, 'INVALID_STATUS_TRANSITION', `Não é possível mudar a inscrição de ${application.status} para ${decision.status}.`);
    }
    if (['APPROVED','CONFIRMED'].includes(decision.status)) {
      const links = await this.gateway.request(`rest/v1/application_media?select=media_asset_id&application_id=eq.${applicationId}`);
      if (links.length) { const assets = await this.gateway.request(`rest/v1/media_assets?select=review_status&id=in.(${links.map(m=>m.media_asset_id).join(',')})`); if (assets.some(m=>m.review_status!=='APPROVED')) throw new HttpError(409, 'MEDIA_REVIEW_REQUIRED', 'Conclua a aprovação das imagens antes de selecionar o expositor.'); }
    }
    if (decision.status === 'CONFIRMED' && !application.assigned_space_id) {
      throw new HttpError(409, 'SPACE_REQUIRED', 'Atribua um espaço antes de confirmar a participação.');
    }
    const result = await this.gateway.request('rest/v1/rpc/transition_application', {
      method: 'POST', body: {
        p_application_id: applicationId,
        p_actor_user_id: principal.id,
        p_next_status: decision.status,
        p_note: decision.note,
        p_visible_to_exhibitor: decision.visible,
        p_mark_reviewed: true
      }
    });
    await this.notify(application, decision.status, decision.note);
    return Array.isArray(result) ? result[0] : result;
  }

  async notify(application, status, note) {
    const exhibitors = await this.gateway.request(`rest/v1/exhibitors?select=user_id,display_name&id=eq.${application.exhibitor_id}&limit=1`);
    if (!exhibitors[0]) return;
    const users = await this.gateway.request(`rest/v1/app_users?select=email,full_name&id=eq.${exhibitors[0].user_id}&limit=1`);
    if (!users[0]?.email) return;
    const labels = {
      AWAITING_UPDATE: 'Sua inscrição precisa de ajustes',
      WAITLISTED: 'Sua inscrição está na lista de espera',
      APPROVED: 'Sua inscrição foi aprovada',
      CONFIRMED: 'Sua participação foi confirmada',
      DECLINED: 'Atualização sobre sua inscrição',
      PHOTO_REVIEW: 'Suas fotos estão em análise',
      UNDER_REVIEW: 'Sua inscrição está em análise'
    };
    await this.email.send({
      to: users[0].email,
      subject: labels[status] || 'Atualização da sua inscrição BECO',
      title: labels[status] || 'Atualização da inscrição',
      message: note || 'Acesse sua área de expositor para acompanhar os detalhes.'
    }).catch(() => ({ sent: false }));
  }

  async reviewMedia(mediaId, input, principal) {
    requireBecoAdmin(principal);
    validateUuid(mediaId, 'Imagem');
    const review = validateMediaReview(input);
    const assets = await this.gateway.request(`rest/v1/media_assets?select=id&id=eq.${mediaId}&limit=1`);
    if (!assets[0]) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'Imagem não encontrada.');
    const links = await this.gateway.request(`rest/v1/application_media?select=application_id&media_asset_id=eq.${mediaId}&limit=1`);
    const portfolioLinks = links[0] ? [] : await this.gateway.request(`rest/v1/exhibitor_portfolio_media?select=exhibitor_id&media_asset_id=eq.${mediaId}&limit=1`);
    if (!links[0] && !portfolioLinks[0]) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'Imagem não está vinculada a uma inscrição ou galeria.');
    if (links[0]) { const application = await this.applications.applicationAccess(links[0].application_id, principal); if (['CONFIRMED','CANCELLED','DECLINED'].includes(application.status)) throw new HttpError(409, 'APPLICATION_FINAL', 'Esta candidatura já foi concluída.'); }
    const now = new Date().toISOString();
    const rows = await this.gateway.request(`rest/v1/media_assets?id=eq.${mediaId}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: {
        review_status: review.status,
        ...(review.status !== 'APPROVED' ? { visibility: 'PRIVATE' } : {}),
        curator_note: review.note,
        reviewed_by_user_id: principal.id,
        reviewed_at: now,
        updated_at: now
      }
    });
    if (links[0] && review.status !== 'APPROVED') {
      await this.gateway.request(`rest/v1/applications?id=eq.${links[0].application_id}`, {
        method: 'PATCH', body: { status: 'AWAITING_UPDATE', updated_at: now }
      });
      await this.applications.addHistory(links[0].application_id, principal, 'AWAITING_UPDATE', review.note, true, mediaId);
      const applications = await this.gateway.request(`rest/v1/applications?select=*&id=eq.${links[0].application_id}&limit=1`);
      if (applications[0]) await this.notify(applications[0], 'AWAITING_UPDATE', review.note);
    } else if (links[0]) {
      await this.applications.addHistory(links[0].application_id, principal, null, 'Foto aprovada pela curadoria.', true, mediaId);
    }
    if (portfolioLinks[0] && review.status !== 'APPROVED') {
      const exhibitors = await this.gateway.request(`rest/v1/exhibitors?select=user_id,display_name&id=eq.${portfolioLinks[0].exhibitor_id}&limit=1`);
      const users = exhibitors[0]
        ? await this.gateway.request(`rest/v1/app_users?select=email&id=eq.${exhibitors[0].user_id}&limit=1`)
        : [];
      await this.email.send({
        to: users[0]?.email,
        subject: 'Ajuste solicitado em uma foto da sua galeria',
        title: 'Sua galeria precisa de um ajuste',
        message: review.note || 'Acesse sua área de expositor para conferir a orientação da curadoria.'
      }).catch(() => ({ sent: false }));
    }
    return rows[0];
  }

  async decideException(requestId, input, principal) {
    requireBecoAdmin(principal);
    validateUuid(requestId, 'Pedido');
    const decision = validateExceptionDecision(input);
    const rows = await this.gateway.request(`rest/v1/application_exception_requests?id=eq.${requestId}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: {
        status: decision.status,
        decision_note: decision.note,
        decided_by_user_id: principal.id,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    if (!rows[0]) throw new HttpError(404, 'EXCEPTION_REQUEST_NOT_FOUND', 'Pedido não encontrado.');
    return rows[0];
  }

  async dashboard(principal) {
    requireBecoAdmin(principal);
    const [applications, media, exceptions, editions, exhibitors, categoryLinks, categories] = await Promise.all([
      this.gateway.request('rest/v1/applications?select=id,status,exhibitor_id,fair_edition_id'),
      this.gateway.request('rest/v1/media_assets?select=id,review_status'),
      this.gateway.request('rest/v1/application_exception_requests?select=id,status'),
      this.gateway.request('rest/v1/fair_editions?select=id,status'),
      this.gateway.request('rest/v1/exhibitors?select=id,display_name,status'),
      this.gateway.request('rest/v1/exhibitor_category_links?select=exhibitor_id,category_id'),
      this.gateway.request('rest/v1/exhibitor_categories?select=id,name,slug&is_active=eq.true')
    ]);
    const applicationStatus = Object.fromEntries([...new Set(applications.map((item) => item.status))]
      .map((status) => [status, applications.filter((item) => item.status === status).length]));
    const confirmedCounts = new Map();
    for (const application of applications.filter((item) => item.status === 'CONFIRMED')) {
      confirmedCounts.set(application.exhibitor_id, (confirmedCounts.get(application.exhibitor_id) || 0) + 1);
    }
    const exhibitorById = new Map(exhibitors.map((item) => [item.id, item]));
    const topExhibitors = [...confirmedCounts.entries()]
      .map(([id, participations]) => ({ id, displayName: exhibitorById.get(id)?.display_name || 'Expositor', participations }))
      .sort((a, b) => b.participations - a.participations || a.displayName.localeCompare(b.displayName))
      .slice(0, 10);
    const categoryById = new Map(categories.map((item) => [item.id, item]));
    const categoryCounts = new Map();
    for (const link of categoryLinks) categoryCounts.set(link.category_id, (categoryCounts.get(link.category_id) || 0) + 1);
    const exhibitorCategories = [...categoryCounts.entries()].map(([id, total]) => ({
      id,
      name: categoryById.get(id)?.name || 'Categoria inativa',
      slug: categoryById.get(id)?.slug || null,
      total
    })).sort((a, b) => b.total - a.total);
    return {
      applicationsInReview: applications.filter((item) => ['SUBMITTED', 'PHOTO_REVIEW', 'UNDER_REVIEW'].includes(item.status)).length,
      mediaPending: media.filter((item) => item.review_status === 'PENDING').length,
      exceptionRequestsPending: exceptions.filter((item) => item.status === 'PENDING').length,
      registrationsOpen: editions.filter((item) => item.status === 'REGISTRATION_OPEN').length,
      exhibitorsApproved: exhibitors.filter((item) => item.status === 'APPROVED').length,
      applicationStatus,
      exhibitorCategories,
      topExhibitors
    };
  }
}
