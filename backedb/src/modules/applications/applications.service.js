import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { supabaseGateway } from '../../lib/supabase.js';
import { validateUuid } from '../fairs/fairs.validation.js';
import { FormsService } from '../forms/forms.service.js';
import { MediaService } from '../media/media.service.js';
import { validateAnswers, validateConsents, validateDraft, validateExceptionRequest } from './applications.validation.js';

const editableStatuses = new Set(['DRAFT', 'AWAITING_UPDATE']);

function hasValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

function conditionApplies(field, answersByKey) {
  const condition = field.conditional_logic || {};
  if (!condition.fieldKey) return true;
  const current = answersByKey.get(condition.fieldKey);
  if (condition.operator === 'truthy') return Boolean(current);
  if (condition.operator === 'in') return Array.isArray(condition.value) && condition.value.includes(current);
  if (condition.operator === 'contains') return Array.isArray(current) && current.includes(condition.value);
  return current === condition.value;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateAnswerValue(field, value, optionValues) {
  if (!hasValue(value)) return;
  if (['SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'URL', 'DATE'].includes(field.type) && typeof value !== 'string') {
    throw new HttpError(422, 'INVALID_ANSWER', `Resposta inválida para ${field.label}.`);
  }
  if (field.type === 'CHECKBOX' && typeof value !== 'boolean') throw new HttpError(422, 'INVALID_ANSWER', `Resposta inválida para ${field.label}.`);
  if (field.type === 'MULTISELECT' && (!Array.isArray(value) || value.some((item) => !optionValues.has(item)))) {
    throw new HttpError(422, 'INVALID_ANSWER', `Seleção inválida para ${field.label}.`);
  }
  if (field.type === 'MULTISELECT' && new Set(value).size !== value.length) throw new HttpError(422, 'INVALID_ANSWER', `Seleção repetida em ${field.label}.`);
  if (['SELECT', 'RADIO'].includes(field.type) && !optionValues.has(value)) throw new HttpError(422, 'INVALID_ANSWER', `Opção inválida para ${field.label}.`);
  if (['FILE', 'IMAGE'].includes(field.type)) throw new HttpError(422, 'INVALID_ANSWER', `Os arquivos de ${field.label} devem ser enviados pela área de imagens.`);
  if (field.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HttpError(422, 'INVALID_ANSWER', `E-mail inválido em ${field.label}.`);
  if (field.type === 'PHONE' && value.replace(/\D/g, '').length < 8) throw new HttpError(422, 'INVALID_ANSWER', `Telefone inválido em ${field.label}.`);
  if (field.type === 'URL') {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    } catch {
      throw new HttpError(422, 'INVALID_ANSWER', `Endereço inválido em ${field.label}.`);
    }
  }
  if (field.type === 'DATE' && !isIsoDate(value)) {
    throw new HttpError(422, 'INVALID_ANSWER', `Data inválida em ${field.label}.`);
  }
  const minLength = Number(field.validation?.minLength || 0);
  const maxLength = Number(field.validation?.maxLength || 10000);
  if (typeof value === 'string' && value.length < minLength) throw new HttpError(422, 'INVALID_ANSWER', `Resposta muito curta para ${field.label}.`);
  if (typeof value === 'string' && value.length > maxLength) throw new HttpError(422, 'INVALID_ANSWER', `Resposta muito longa para ${field.label}.`);
  const minChoices = Number(field.validation?.minChoices || 0);
  const maxChoices = Number(field.validation?.maxChoices || 50);
  if (Array.isArray(value) && (value.length < minChoices || value.length > maxChoices)) throw new HttpError(422, 'INVALID_ANSWER', `Quantidade de opções inválida em ${field.label}.`);
}

export class ApplicationsService {
  constructor(gateway = supabaseGateway, formsService, mediaService) {
    this.gateway = gateway;
    this.forms = formsService || new FormsService(gateway);
    this.media = mediaService || new MediaService({
      request: gateway.request.bind(gateway),
      createSignedUploadUrl: gateway.createSignedUploadUrl,
      createSignedReadUrl: gateway.createSignedReadUrl,
      deleteStorageObjects: gateway.deleteStorageObjects
    });
  }

  async exhibitorFor(principal, approved = false) {
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Ação disponível somente para expositores.');
    const rows = await this.gateway.request(`rest/v1/exhibitors?select=*&user_id=eq.${principal.id}&limit=1`);
    const exhibitor = rows[0];
    if (!exhibitor) throw new HttpError(404, 'EXHIBITOR_NOT_FOUND', 'Perfil de expositor não encontrado.');
    if (approved && exhibitor.status === 'SUSPENDED') throw new HttpError(403, 'EXHIBITOR_SUSPENDED', 'Seu cadastro está suspenso. Entre em contato com a equipe.');
    return exhibitor;
  }

  async applicationAccess(applicationId, principal) {
    validateUuid(applicationId, 'Inscrição');
    const rows = await this.gateway.request(`rest/v1/applications?select=*&id=eq.${applicationId}&limit=1`);
    const application = rows[0];
    if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Inscrição não encontrada.');
    if (principal.role === 'BECO_ADMIN') { await this.forms.assertEditionAdmin(application.fair_edition_id, principal); return application; }
    const exhibitor = await this.exhibitorFor(principal);
    if (application.exhibitor_id !== exhibitor.id) throw new HttpError(403, 'FORBIDDEN', 'Você não tem acesso a esta inscrição.');
    return application;
  }

  async addHistory(applicationId, principal, status, note = null, visible = true, mediaAssetId = null) {
    await this.gateway.request('rest/v1/application_history', {
      method: 'POST', body: {
        application_id: applicationId,
        actor_user_id: principal?.id || null,
        status,
        note,
        is_visible_to_exhibitor: visible,
        media_asset_id: mediaAssetId
      }
    });
  }

  async createDraft(editionId, input, principal) {
    validateUuid(editionId, 'Edição');
    const exhibitor = await this.exhibitorFor(principal, true);
    const form = await this.forms.getForApplicant(editionId, principal);
    const { requestedSpaceType } = validateDraft(input);
    const rows = await this.gateway.request('rest/v1/applications', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: {
        fair_edition_id: editionId,
        exhibitor_id: exhibitor.id,
        registration_form_id: form.id,
        requested_space_type: requestedSpaceType,
        status: 'DRAFT'
      }
    });
    const application = rows[0];
    if (!application) throw new HttpError(502, 'APPLICATION_NOT_CREATED', 'Não foi possível iniciar a inscrição.');
    await this.addHistory(application.id, principal, 'DRAFT', 'Inscrição iniciada.');
    return application;
  }

  async saveAnswers(applicationId, input, principal) {
    const application = await this.applicationAccess(applicationId, principal);
    if (!editableStatuses.has(application.status)) throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'Esta inscrição não pode ser editada.');
    const answers = validateAnswers(input);
    const fieldIds = answers.map((answer) => answer.fieldId);
    const form = await this.forms.getByEdition(application.fair_edition_id, { allowUnpublished: true });
    const fields = form.sections.flatMap((section) => section.fields).filter((field) => fieldIds.includes(field.id));
    if (fields.length !== fieldIds.length) throw new HttpError(422, 'INVALID_ANSWERS', 'Uma ou mais perguntas não pertencem ao formulário desta edição.');
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const optionsByField = new Map(fields.map((field) => [field.id, new Set(field.options.map((option) => option.value))]));
    for (const answer of answers) validateAnswerValue(fieldById.get(answer.fieldId), answer.value, optionsByField.get(answer.fieldId) || new Set());
    if (answers.length) {
      await this.gateway.request('rest/v1/application_answers?on_conflict=application_id,field_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: answers.map((answer) => ({ application_id: applicationId, field_id: answer.fieldId, value_json: answer.value, updated_at: new Date().toISOString() }))
      });
    }
    if (input.requestedSpaceType !== undefined) {
      const { requestedSpaceType } = validateDraft(input);
      await this.gateway.request(`rest/v1/applications?id=eq.${applicationId}`, { method: 'PATCH', body: { requested_space_type: requestedSpaceType, updated_at: new Date().toISOString() } });
    }
    return { saved: answers.length };
  }

  async submit(applicationId, input, principal) {
    const application = await this.applicationAccess(applicationId, principal);
    if (!editableStatuses.has(application.status)) throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'Esta inscrição não pode ser enviada.');
    if (application.status === 'DRAFT') await this.forms.getForApplicant(application.fair_edition_id, principal);
    else {
      await this.exhibitorFor(principal, true);
      await this.forms.getByEdition(application.fair_edition_id, { allowUnpublished: true });
    }
    const acceptedConsentKeys = new Set(validateConsents(input));
    const form = await this.forms.getByEdition(application.fair_edition_id);
    const requiredConsents = Array.isArray(form.required_consents) ? form.required_consents : [];
    const officialConsentKeys = new Set(requiredConsents.map((consent) => consent.key));
    if (requiredConsents.some((consent) => !acceptedConsentKeys.has(consent.key)) || [...acceptedConsentKeys].some((key) => !officialConsentKeys.has(key))) {
      throw new HttpError(422, 'CONSENTS_REQUIRED', 'Todos os termos obrigatórios da edição devem ser aceitos.');
    }
    const consents = requiredConsents.map((consent) => ({ key: consent.key, text: consent.text }));
    const fields = form.sections.flatMap((section) => section.fields);
    const answers = await this.gateway.request(`rest/v1/application_answers?select=field_id,value_json&application_id=eq.${applicationId}`);
    const answerById = new Map(answers.map((answer) => [answer.field_id, answer.value_json]));
    const answersByKey = new Map(fields.map((field) => [field.field_key, answerById.get(field.id)]));
    for (const field of fields) {
      if (field.is_required && !['IMAGE', 'FILE'].includes(field.type) && conditionApplies(field, answersByKey) && !hasValue(answerById.get(field.id))) {
        throw new HttpError(422, 'REQUIRED_ANSWER_MISSING', `Responda: ${field.label}.`);
      }
    }
    const requiredMediaFields = fields.filter((field) => field.is_required && ['IMAGE', 'FILE'].includes(field.type) && conditionApplies(field, answersByKey));
    if (requiredMediaFields.length) {
      const media = await this.gateway.request(`rest/v1/application_media?select=id,field_id,role&application_id=eq.${applicationId}`);
      for (const field of requiredMediaFields) {
        const assigned = media.filter((item) => item.field_id === field.id);
        const legacy = requiredMediaFields.length === 1 ? media.filter((item) => !item.field_id && item.role === 'PORTFOLIO') : [];
        const total = assigned.length + legacy.length;
        const minimum = Number(field.validation?.minFiles || 1);
        const maximum = Number(field.validation?.maxFiles || 20);
        if (total < minimum) throw new HttpError(422, 'REQUIRED_MEDIA_MISSING', `Envie ao menos ${minimum} arquivo(s) em ${field.label}.`);
        if (total > maximum) throw new HttpError(422, 'MEDIA_LIMIT_EXCEEDED', `Envie no máximo ${maximum} arquivo(s) em ${field.label}.`);
      }
    }
    const nextStatus = application.status === 'AWAITING_UPDATE' ? 'PHOTO_REVIEW' : 'SUBMITTED';
    const historyNote = application.status === 'AWAITING_UPDATE' ? 'Ajustes reenviados.' : 'Formulário enviado para curadoria.';
    const result = await this.gateway.request('rest/v1/rpc/submit_application', {
      method: 'POST', body: {
        p_application_id: applicationId,
        p_actor_user_id: principal.id,
        p_next_status: nextStatus,
        p_consents: consents,
        p_history_note: historyNote
      }
    });
    return Array.isArray(result) ? result[0] : result;
  }

  async requestException(applicationId, input, principal) {
    const application = await this.applicationAccess(applicationId, principal);
    if (!editableStatuses.has(application.status) && !['SUBMITTED', 'PHOTO_REVIEW', 'UNDER_REVIEW'].includes(application.status)) {
      throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'Não é possível solicitar uma exceção nesta etapa.');
    }
    const data = validateExceptionRequest(input);
    const existing = await this.gateway.request(`rest/v1/application_exception_requests?select=id&application_id=eq.${applicationId}&limit=1`);
    if (existing[0]) {
      const rows = await this.gateway.request(`rest/v1/application_exception_requests?id=eq.${existing[0].id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { reason: data.reason, request_type: data.requestType, status: 'PENDING', updated_at: new Date().toISOString() }
      });
      return rows[0];
    }
    const rows = await this.gateway.request('rest/v1/application_exception_requests', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: { application_id: applicationId, reason: data.reason, request_type: data.requestType }
    });
    return rows[0];
  }

  async listMine(principal) {
    const exhibitor = await this.exhibitorFor(principal);
    const applications = await this.gateway.request(`rest/v1/applications?select=*&exhibitor_id=eq.${exhibitor.id}&order=created_at.desc`);
    if (!applications.length) return [];
    const editionIds = [...new Set(applications.map((application) => application.fair_edition_id))];
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=id,fair_id,title,slug,starts_at,ends_at,status,location_id&id=in.(${editionIds.join(',')})`);
    const fairIds = [...new Set(editions.map((edition) => edition.fair_id))];
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id,name,slug&id=in.(${fairIds.join(',')})`);
    const byEdition = new Map(editions.map((edition) => [edition.id, edition]));
    const byFair = new Map(fairs.map((fair) => [fair.id, fair]));
    return applications.map((application) => {
      const edition = byEdition.get(application.fair_edition_id);
      const { curator_decision_note, ...safeApplication } = application;
      return { ...safeApplication, edition: edition ? { ...edition, fair: byFair.get(edition.fair_id) || null } : null };
    });
  }

  async detail(applicationId, principal) {
    const application = await this.applicationAccess(applicationId, principal);
    const [form, answers, consents, exceptionRequests, history, media] = await Promise.all([
      this.forms.getByEdition(application.fair_edition_id, { allowUnpublished: true }),
      this.gateway.request(`rest/v1/application_answers?select=field_id,value_json,updated_at&application_id=eq.${applicationId}`),
      this.gateway.request(`rest/v1/application_consents?select=consent_key,consent_text,accepted_at&application_id=eq.${applicationId}`),
      this.gateway.request(`rest/v1/application_exception_requests?select=*&application_id=eq.${applicationId}`),
      this.gateway.request(`rest/v1/application_history?select=*&application_id=eq.${applicationId}&order=created_at.asc`),
      this.media.listApplicationMedia(applicationId, principal)
    ]);
    const visibleHistory = principal.role === 'BECO_ADMIN' ? history : history.filter((item) => item.is_visible_to_exhibitor);
    const { curator_decision_note, ...safeApplication } = application;
    return { application: principal.role === 'BECO_ADMIN' ? application : safeApplication, form, answers, consents, exceptionRequest: exceptionRequests[0] || null, history: visibleHistory, media };
  }

  async cancel(applicationId, principal) {
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Somente o expositor pode cancelar a própria inscrição.');
    const application = await this.applicationAccess(applicationId, principal);
    if (['CONFIRMED', 'FINISHED', 'CANCELLED', 'DECLINED'].includes(application.status)) throw new HttpError(409, 'APPLICATION_NOT_CANCELLABLE', 'Esta inscrição não pode ser cancelada.');
    const result = await this.gateway.request('rest/v1/rpc/transition_application', {
      method: 'POST', body: {
        p_application_id: applicationId,
        p_actor_user_id: principal.id,
        p_next_status: 'CANCELLED',
        p_note: 'Inscrição cancelada pelo expositor.',
        p_visible_to_exhibitor: true,
        p_mark_reviewed: false
      }
    });
    return Array.isArray(result) ? result[0] : result;
  }
}
