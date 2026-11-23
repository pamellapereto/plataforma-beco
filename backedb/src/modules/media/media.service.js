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
  const rows = await gateway.request(`rest/v1/applications?select=id,exhibitor_id,fair_edition_id,registration_form_id,status&id=eq.${encodeURIComponent(applicationId)}`);
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
    if (sections[0]?.form_id !== application.registration_form_id) throw new HttpError(422, 'INVALID_MEDIA_FIELD', 'A pergunta não pertence à versão do formulário vinculada a esta candidatura.');
    return field.id;
  }

  async replacementFor(application, mediaAssetId, fieldId, role) {
    if (!mediaAssetId) return null;
    validateUuid(mediaAssetId, 'Imagem a substituir');
    const links = await this.gateway.request(`rest/v1/application_media?select=id,application_id,media_asset_id,field_id,role,position,version_group_id,version_number,archived_at&application_id=eq.${encodeURIComponent(application.id)}&media_asset_id=eq.${encodeURIComponent(mediaAssetId)}&archived_at=is.null&limit=1`);
    const link = links[0];
    if (!link) throw new HttpError(404, 'MEDIA_CURRENT_VERSION_NOT_FOUND', 'A imagem atual não foi encontrada nesta candidatura.');
    const assets = await this.gateway.request(`rest/v1/media_assets?select=id,review_status&id=eq.${encodeURIComponent(mediaAssetId)}&limit=1`);
    if (application.status !== 'AWAITING_UPDATE' || !['CHANGES_REQUESTED', 'REJECTED'].includes(assets[0]?.review_status)) {
      throw new HttpError(409, 'MEDIA_REPLACEMENT_NOT_ALLOWED', 'Somente imagens com ajuste solicitado podem ser substituídas nesta etapa.');
    }
    if (link.field_id !== fieldId || link.role !== role) {
      throw new HttpError(409, 'MEDIA_REPLACEMENT_CONTEXT_INVALID', 'A nova versão deve permanecer vinculada à mesma pergunta e finalidade.');
    }
    return link;
  }

  async createUploadUrl(applicationId, principal, input) {
    const { application, exhibitor } = await this.assertApplicationAccess(applicationId, principal);
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'O envio é feito pela conta do expositor.');
    if (exhibitor.status === 'SUSPENDED') throw new HttpError(403, 'EXHIBITOR_SUSPENDED', 'O cadastro do expositor está suspenso.');
    if (!uploadableApplicationStatuses.has(application.status)) {
      throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'Esta inscrição não aceita novos envios de imagem.');
    }
    if (application.status === 'DRAFT') await new FormsService(this.gateway).getForApplicant(application.fair_edition_id, principal);
    const role = mediaRole(input?.role);
    const fieldId = await this.assertMediaField(application, input?.fieldId);
    await this.replacementFor(application, input?.replaceMediaId, fieldId, role);
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
    if (application.status === 'DRAFT') await new FormsService(this.gateway).getForApplicant(application.fair_edition_id, principal);
    const role = mediaRole(input?.role);
    const fieldId = await this.assertMediaField(application, input?.fieldId);
    const replacement = await this.replacementFor(application, input?.replaceMediaId, fieldId, role);
    const prefix = `exhibitors/${exhibitor.id}/applications/${application.id}/${role.toLowerCase()}/`;
    if (!String(input.objectPath).startsWith(prefix)) throw new HttpError(400, 'INVALID_OBJECT_PATH', 'Caminho de arquivo inválido.');
    if (!String(input.originalFilename || '').trim()) throw new HttpError(422, 'INVALID_FILENAME', 'Informe o nome original da imagem.');
    if (input.altText && String(input.altText).trim().length > 255) throw new HttpError(422, 'INVALID_ALT_TEXT', 'O texto alternativo deve ter até 255 caracteres.');
    if (!config.upload.allowedMimeTypes.includes(input.mimeType)) throw new HttpError(400, 'INVALID_MEDIA_TYPE', 'Formato de imagem não permitido.');
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > config.upload.maxBytes) throw new HttpError(400, 'INVALID_MEDIA_SIZE', 'Tamanho de imagem inválido.');
    await assertStoredImage(this.gateway, config.supabase.curationSubmissionsBucket, input);
    if (!replacement) {
      const existing = await this.gateway.request(`rest/v1/application_media?select=position&application_id=eq.${encodeURIComponent(application.id)}&role=eq.${role}&archived_at=is.null&order=position.desc&limit=1`);
      const position = (existing[0]?.position ?? -1) + 1;
      if (position >= roleLimits[role]) throw new HttpError(409, 'APPLICATION_MEDIA_LIMIT', `O limite para ${role} é de ${roleLimits[role]} arquivo(s).`);
    }
    try {
      const result = await this.gateway.request('rest/v1/rpc/register_application_media', {
        method: 'POST', body: {
          p_application_id: application.id,
          p_actor_user_id: principal.id,
          p_storage_bucket: config.supabase.curationSubmissionsBucket,
          p_object_path: input.objectPath,
          p_original_filename: cleanFilename(input.originalFilename),
          p_mime_type: input.mimeType,
          p_byte_size: input.byteSize,
          p_alt_text: input.altText || null,
          p_field_id: fieldId,
          p_role: role,
          p_replace_media_asset_id: replacement?.media_asset_id || null
        }
      });
      const mediaAsset = Array.isArray(result) ? result[0] : result;
      if (!mediaAsset) throw new HttpError(502, 'MEDIA_NOT_RECORDED', 'Não foi possível registrar a imagem.');
      return mediaAsset;
    } catch (error) {
      await this.gateway.deleteStorageObjects(config.supabase.curationSubmissionsBucket, [input.objectPath]).catch(() => undefined);
      throw error;
    }
  }

  async listApplicationMedia(applicationId, principal) {
    await this.assertApplicationAccess(applicationId, principal);
    const links = await this.gateway.request(`rest/v1/application_media?select=id,field_id,role,position,media_asset_id,version_group_id,version_number,archived_at,replaces_application_media_id&application_id=eq.${encodeURIComponent(applicationId)}&archived_at=is.null&order=role.asc,position.asc`);
    return Promise.all(links.map(async (link) => {
      const assets = await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path,original_filename,mime_type,alt_text,review_status,visibility,curator_note,reviewed_at,reviewed_by_user_id&id=eq.${encodeURIComponent(link.media_asset_id)}`);
      const asset = assets[0];
      if (!asset) return null;
      const signed = await this.gateway.createSignedReadUrl(asset.storage_bucket, asset.object_path);
      const current = { ...link, ...asset, url: new URL(signed.signedURL || signed.url, config.supabase.url).href };
      if (principal.role !== 'BECO_ADMIN') return current;
      const versionLinks = await this.gateway.request(`rest/v1/application_media?select=id,field_id,role,position,media_asset_id,version_group_id,version_number,archived_at,replaces_application_media_id&application_id=eq.${encodeURIComponent(applicationId)}&version_group_id=eq.${encodeURIComponent(link.version_group_id)}&order=version_number.asc`);
      const versions = await Promise.all(versionLinks.map(async (versionLink) => {
        const versionAssets = await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path,original_filename,mime_type,alt_text,review_status,visibility,curator_note,reviewed_at,reviewed_by_user_id,created_at&id=eq.${encodeURIComponent(versionLink.media_asset_id)}&limit=1`);
        const versionAsset = versionAssets[0];
        if (!versionAsset) return null;
        const versionUrl = await this.gateway.createSignedReadUrl(versionAsset.storage_bucket, versionAsset.object_path);
        return { ...versionLink, ...versionAsset, url: new URL(versionUrl.signedURL || versionUrl.url, config.supabase.url).href, isCurrent: versionLink.archived_at === null };
      }));
      return { ...current, versions: versions.filter(Boolean), versionCount: versions.filter(Boolean).length };
    })).then((items) => items.filter(Boolean));
  }

  async removeApplicationMedia(applicationId, mediaAssetId, principal) {
    const { application } = await this.assertApplicationAccess(applicationId, principal);
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Somente o expositor remove o próprio envio.');
    if (application.status !== 'DRAFT') {
      throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'Esta inscrição não permite remover imagens.');
    }
    if (application.status === 'DRAFT') await new FormsService(this.gateway).getForApplicant(application.fair_edition_id, principal);
    const result = await this.gateway.request('rest/v1/rpc/remove_draft_application_media', {
      method: 'POST', body: {
        p_application_id: applicationId,
        p_media_asset_id: mediaAssetId,
        p_actor_user_id: principal.id
      }
    });
    const asset = Array.isArray(result) ? result[0] : result;
    if (!asset) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'Imagem não encontrada nesta inscrição.');
    const storageDeleted = await this.gateway.deleteStorageObjects(asset.storage_bucket, [asset.object_path])
      .then(() => true).catch(() => false);
    return { deleted: true, storageDeleted };
  }
}
