import { FormsService } from '../forms/forms.service.js';
import { assertStoredImage } from '../../lib/storage.js';
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { HttpError } from '../../lib/http.js';
import { createSignedReadUrl, createSignedUploadUrl, deleteStorageObjects, supabaseRequest } from '../../lib/supabase.js';
import { validateUuid } from '../fairs/fairs.validation.js';

const uploadableApplicationStatuses = new Set(['DRAFT', 'PHOTO_REVIEW', 'AWAITING_UPDATE']);
const applicationMediaRoles = new Set(['PORTFOLIO', 'BADGE_PHOTO', 'PROMOTION', 'DOCUMENT']);
const roleLimits = Object.freeze({ PORTFOLIO: 20, BADGE_PHOTO: 1, PROMOTION: 6, DOCUMENT: 10 });

const defaultGateway = Object.freeze({
  request: supabaseRequest,
  createSignedReadUrl,
  createSignedUploadUrl,
  deleteStorageObjects
});

function cleanFilename(name = 'imagem') {
  const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120) || 'imagem';
}

function mediaRole(value) {
  const role = String(value || 'PORTFOLIO').toUpperCase();
  if (!applicationMediaRoles.has(role)) throw new HttpError(422, 'INVALID_MEDIA_ROLE', 'Finalidade da imagem inválida.');
  return role;
}

async function getApplication(gateway, applicationId) {
  const rows = await gateway.request(`rest/v1/applications?select=id,exhibitor_id,fair_edition_id,status&id=eq.${encodeURIComponent(applicationId)}`);
  if (!rows[0]) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Inscrição não encontrada.');
  return rows[0];
}

async function getExhibitor(gateway, exhibitorId) {
  const rows = await gateway.request(`rest/v1/exhibitors?select=id,user_id,status&id=eq.${encodeURIComponent(exhibitorId)}`);
  if (!rows[0]) throw new HttpError(404, 'EXHIBITOR_NOT_FOUND', 'Expositor não encontrado.');
  return rows[0];
}

export class MediaService {
  constructor(gateway = defaultGateway) {
    this.gateway = gateway;
  }

  async assertApplicationAccess(applicationId, principal) {
    const application = await getApplication(this.gateway, applicationId);
    const exhibitor = await getExhibitor(this.gateway, application.exhibitor_id);
    if (principal.role === 'BECO_ADMIN') await new FormsService(this.gateway).assertEditionAdmin(application.fair_edition_id, principal);
    if (principal.role !== 'BECO_ADMIN' && exhibitor.user_id !== principal.id) {
      throw new HttpError(403, 'FORBIDDEN', 'Você não tem acesso a esta inscrição.');
    }
    return { application, exhibitor };
  }

  async assertMediaField(application, fieldId) {
    if (fieldId === undefined || fieldId === null || fieldId === '') return null;
    validateUuid(fieldId, 'Pergunta de imagem');
    const fields = await this.gateway.request(`rest/v1/registration_form_fields?select=id,section_id,type&id=eq.${fieldId}&limit=1`);
    const field = fields[0];
    if (!field || !['IMAGE', 'FILE'].includes(field.type)) throw new HttpError(422, 'INVALID_MEDIA_FIELD', 'A pergunta informada não aceita arquivo.');
    const sections = await this.gateway.request(`rest/v1/registration_form_sections?select=form_id&id=eq.${field.section_id}&limit=1`);
    const forms = sections[0]
      ? await this.gateway.request(`rest/v1/registration_forms?select=fair_edition_id&id=eq.${sections[0].form_id}&limit=1`)
      : [];
    if (forms[0]?.fair_edition_id !== application.fair_edition_id) throw new HttpError(422, 'INVALID_MEDIA_FIELD', 'A pergunta não pertence ao formulário desta edição.');
    return field.id;
  }

  async createUploadUrl(applicationId, principal, input) {
    const { application, exhibitor } = await this.assertApplicationAccess(applicationId, principal);
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'O envio é feito pela conta do expositor.');
    if (exhibitor.status === 'SUSPENDED') throw new HttpError(403, 'EXHIBITOR_SUSPENDED', 'O cadastro do expositor está suspenso.');
    if (!uploadableApplicationStatuses.has(application.status)) {
      throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'Esta inscrição não aceita novos envios de imagem.');
    }
    const role = mediaRole(input?.role);
    const fieldId = await this.assertMediaField(application, input?.fieldId);
    if (!String(input?.originalFilename || '').trim()) throw new HttpError(422, 'INVALID_FILENAME', 'Informe o nome original da imagem.');
    if (!config.upload.allowedMimeTypes.includes(input.mimeType)) throw new HttpError(400, 'INVALID_MEDIA_TYPE', 'Formato de imagem não permitido.');
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > config.upload.maxBytes) {
      throw new HttpError(400, 'INVALID_MEDIA_SIZE', 'A imagem excede o limite permitido.');
    }
    const objectPath = `exhibitors/${exhibitor.id}/applications/${application.id}/${role.toLowerCase()}/${randomUUID()}-${cleanFilename(input.originalFilename)}`;
    const signed = await this.gateway.createSignedUploadUrl(config.supabase.curationSubmissionsBucket, objectPath);
    return { bucket: config.supabase.curationSubmissionsBucket, objectPath, uploadUrl: new URL(signed.url, config.supabase.url).href, token: signed.token, role, fieldId };
  }

  async completeUpload(applicationId, principal, input) {
    const { application, exhibitor } = await this.assertApplicationAccess(applicationId, principal);
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Somente o expositor registra o próprio envio.');
    if (exhibitor.status === 'SUSPENDED') throw new HttpError(403, 'EXHIBITOR_SUSPENDED', 'O cadastro do expositor está suspenso.');
    if (!uploadableApplicationStatuses.has(application.status)) {
      throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'Esta inscrição não aceita novos envios de imagem.');
    }
    const role = mediaRole(input?.role);
    const fieldId = await this.assertMediaField(application, input?.fieldId);
    const prefix = `exhibitors/${exhibitor.id}/applications/${application.id}/${role.toLowerCase()}/`;
    if (!String(input.objectPath).startsWith(prefix)) throw new HttpError(400, 'INVALID_OBJECT_PATH', 'Caminho de arquivo inválido.');
    if (!String(input.originalFilename || '').trim()) throw new HttpError(422, 'INVALID_FILENAME', 'Informe o nome original da imagem.');
    if (input.altText && String(input.altText).trim().length > 255) throw new HttpError(422, 'INVALID_ALT_TEXT', 'O texto alternativo deve ter até 255 caracteres.');
    if (!config.upload.allowedMimeTypes.includes(input.mimeType)) throw new HttpError(400, 'INVALID_MEDIA_TYPE', 'Formato de imagem não permitido.');
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > config.upload.maxBytes) throw new HttpError(400, 'INVALID_MEDIA_SIZE', 'Tamanho de imagem inválido.');
    await assertStoredImage(this.gateway, config.supabase.curationSubmissionsBucket, input);
    const existing = await this.gateway.request(`rest/v1/application_media?select=position&application_id=eq.${encodeURIComponent(application.id)}&role=eq.${role}&order=position.desc&limit=1`);
    const position = (existing[0]?.position ?? -1) + 1;
    if (position >= roleLimits[role]) throw new HttpError(409, 'APPLICATION_MEDIA_LIMIT', `O limite para ${role} é de ${roleLimits[role]} arquivo(s).`);
    const assets = await this.gateway.request('rest/v1/media_assets', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: {
        owner_user_id: principal.id, owner_exhibitor_id: exhibitor.id, storage_bucket: config.supabase.curationSubmissionsBucket,
        object_path: input.objectPath, original_filename: cleanFilename(input.originalFilename), mime_type: input.mimeType,
        byte_size: input.byteSize, alt_text: input.altText || null,
        visibility: 'PRIVATE', review_status: 'PENDING'
      }
    });
    const mediaAsset = assets[0];
    if (!mediaAsset) throw new HttpError(502, 'MEDIA_NOT_RECORDED', 'Não foi possível registrar a imagem.');
    try {
      await this.gateway.request('rest/v1/application_media', {
        method: 'POST',
        body: { application_id: application.id, media_asset_id: mediaAsset.id, field_id: fieldId, role, position }
      });
    } catch (error) {
      await this.gateway.request(`rest/v1/media_assets?id=eq.${encodeURIComponent(mediaAsset.id)}`, { method: 'DELETE' }).catch(() => undefined);
      throw error;
    }
    return mediaAsset;
  }

  async listApplicationMedia(applicationId, principal) {
    await this.assertApplicationAccess(applicationId, principal);
    const links = await this.gateway.request(`rest/v1/application_media?select=id,field_id,role,position,media_asset_id&application_id=eq.${encodeURIComponent(applicationId)}&order=role.asc,position.asc`);
    return Promise.all(links.map(async (link) => {
      const assets = await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path,original_filename,mime_type,review_status,visibility,curator_note&id=eq.${encodeURIComponent(link.media_asset_id)}`);
      const asset = assets[0];
      if (!asset) return null;
      const signed = await this.gateway.createSignedReadUrl(asset.storage_bucket, asset.object_path);
      return { ...link, ...asset, url: new URL(signed.signedURL || signed.url, config.supabase.url).href };
    })).then((items) => items.filter(Boolean));
  }

  async removeApplicationMedia(applicationId, mediaAssetId, principal) {
    const { application } = await this.assertApplicationAccess(applicationId, principal);
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Somente o expositor remove o próprio envio.');
    if (!uploadableApplicationStatuses.has(application.status)) {
      throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'Esta inscrição não permite remover imagens.');
    }
    const links = await this.gateway.request(`rest/v1/application_media?select=media_asset_id&application_id=eq.${encodeURIComponent(applicationId)}&media_asset_id=eq.${encodeURIComponent(mediaAssetId)}&limit=1`);
    if (!links[0]) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'Imagem não encontrada nesta inscrição.');
    const assets = await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path&id=eq.${encodeURIComponent(mediaAssetId)}&limit=1`);
    const asset = assets[0];
    if (!asset) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'Imagem não encontrada.');
    await this.gateway.request(`rest/v1/media_assets?id=eq.${encodeURIComponent(mediaAssetId)}`, { method: 'DELETE' });
    const storageDeleted = await this.gateway.deleteStorageObjects(asset.storage_bucket, [asset.object_path])
      .then(() => true).catch(() => false);
    return { deleted: true, storageDeleted };
  }
}
