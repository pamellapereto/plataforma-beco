import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { supabaseGateway } from '../../lib/supabase.js';
import { validateUuid } from '../fairs/fairs.validation.js';
import { validateFormDefinition } from './forms.validation.js';

export class FormsService {
  constructor(gateway = supabaseGateway) {
    this.gateway = gateway;
  }

  async assertEditionAdmin(editionId, principal) {
    requireBecoAdmin(principal);
    validateUuid(editionId, 'Edição');
    const rows = await this.gateway.request(`rest/v1/fair_editions?select=id,fair_id,title,status&id=eq.${editionId}&limit=1`);
    const edition = rows[0];
    if (!edition) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id&id=eq.${edition.fair_id}&organization_id=eq.${principal.organizationId}&limit=1`);
    if (!fairs[0]) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    return edition;
  }

  async getByEdition(editionId, { allowUnpublished = false } = {}) {
    validateUuid(editionId, 'Edição');
    const forms = await this.gateway.request(`rest/v1/registration_forms?select=id,fair_edition_id,title,introduction,required_consents,version,is_published,created_at,updated_at&fair_edition_id=eq.${editionId}&limit=1`);
    const form = forms[0];
    if (!form || (!allowUnpublished && !form.is_published)) throw new HttpError(404, 'FORM_NOT_FOUND', 'Formulário não encontrado.');
    const sections = await this.gateway.request(`rest/v1/registration_form_sections?select=id,title,description,position&form_id=eq.${form.id}&order=position.asc`);
    const sectionIds = sections.map((section) => section.id);
    const fields = sectionIds.length
      ? await this.gateway.request(`rest/v1/registration_form_fields?select=id,section_id,field_key,label,help_text,type,is_required,is_sensitive,is_private,validation,conditional_logic,position&section_id=in.(${sectionIds.join(',')})&order=position.asc`)
      : [];
    const fieldIds = fields.map((field) => field.id);
    const options = fieldIds.length
      ? await this.gateway.request(`rest/v1/registration_form_field_options?select=id,field_id,value,label,position&field_id=in.(${fieldIds.join(',')})&order=position.asc`)
      : [];
    const optionsByField = new Map();
    for (const option of options) {
      if (!optionsByField.has(option.field_id)) optionsByField.set(option.field_id, []);
      optionsByField.get(option.field_id).push(option);
    }
    const fieldsBySection = new Map();
    for (const field of fields) {
      if (!fieldsBySection.has(field.section_id)) fieldsBySection.set(field.section_id, []);
      fieldsBySection.get(field.section_id).push({ ...field, options: optionsByField.get(field.id) || [] });
    }
    return { ...form, sections: sections.map((section) => ({ ...section, fields: fieldsBySection.get(section.id) || [] })) };
  }

  async getAdmin(editionId, principal) {
    await this.assertEditionAdmin(editionId, principal);
    return this.getByEdition(editionId, { allowUnpublished: true });
  }

  async getForApplicant(editionId, principal) {
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Formulário disponível somente para expositores.');
    validateUuid(editionId, 'Edição');
    const exhibitors = await this.gateway.request(`rest/v1/exhibitors?select=id,status&user_id=eq.${principal.id}&limit=1`);
    if (!exhibitors[0] || exhibitors[0].status === 'SUSPENDED') throw new HttpError(403, 'EXHIBITOR_SUSPENDED', 'Seu cadastro não está habilitado para inscrições.');
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=id,status,ends_at,registration_opens_at,registration_closes_at&id=eq.${editionId}&limit=1`);
    const edition = editions[0];
    const now = Date.now();
    if (!edition || new Date(edition.ends_at).getTime() <= now || edition.status !== 'REGISTRATION_OPEN' || (edition.registration_opens_at && now < new Date(edition.registration_opens_at).getTime()) || (edition.registration_closes_at && now > new Date(edition.registration_closes_at).getTime())) {
      throw new HttpError(409, 'REGISTRATION_CLOSED', 'As inscrições desta edição não estão abertas.');
    }
    return this.getByEdition(editionId);
  }

  async replace(editionId, input, principal) {
    const edition = await this.assertEditionAdmin(editionId, principal);
    if (!['DRAFT', 'PUBLISHED'].includes(edition.status)) {
      throw new HttpError(409, 'FORM_LOCKED', 'O formulário não pode ser alterado depois da abertura das inscrições.');
    }
    const definition = validateFormDefinition(input);
    const result = await this.gateway.request('rest/v1/rpc/replace_registration_form', {
      method: 'POST', body: {
        p_fair_edition_id: editionId,
        p_created_by_user_id: principal.id,
        p_definition: definition
      }
    });
    const formId = Array.isArray(result) ? result[0] : result;
    return { id: formId, ...(await this.getByEdition(editionId, { allowUnpublished: true })) };
  }
}
