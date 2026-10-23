import { assertStoredImage } from '../../lib/storage.js';
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { supabaseGateway } from '../../lib/supabase.js';
import { validateUuid } from '../fairs/fairs.validation.js';

const roles = new Set(['COVER', 'GALLERY', 'PROMOTION', 'BADGE_TEMPLATE', 'MAP']);
const singletonRoles = new Set(['COVER', 'BADGE_TEMPLATE', 'MAP']);

function cleanFilename(name = 'imagem') {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120) || 'imagem';
}

function requiredText(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new HttpError(422, 'INVALID_INPUT', `Informe ${label}.`);
  return result;
}

function optionalText(value, max, label) {
  if (value === undefined || value === null || value === '') return null;
  const result = String(value).trim();
  if (result.length > max) throw new HttpError(422, 'INVALID_INPUT', `${label} deve ter até ${max} caracteres.`);
  return result;
}

function validateRole(value) {
  const role = String(value || '').toUpperCase();
  if (!roles.has(role)) throw new HttpError(422, 'INVALID_MEDIA_ROLE', 'Papel da imagem da feira inválido.');
  return role;
}

function validateFile(input) {
  const originalFilename = requiredText(input?.originalFilename, 'o nome original da imagem');
  if (!config.upload.allowedMimeTypes.includes(input?.mimeType)) throw new HttpError(422, 'INVALID_MEDIA_TYPE', 'Formato de imagem inválido.');
  if (!Number.isInteger(input?.byteSize) || input.byteSize <= 0 || input.byteSize > config.upload.maxBytes) {
    throw new HttpError(422, 'INVALID_MEDIA_SIZE', 'Tamanho de imagem inválido.');
  }
  return { originalFilename, mimeType: input.mimeType, byteSize: input.byteSize };
}

function mediaUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${config.supabase.url}${path}`;
}

function publicUrl(asset) {
  const base = config.supabase.url?.replace(/\/$/, '') || '';
  const path = asset.object_path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${encodeURIComponent(asset.storage_bucket)}/${path}`;
}

export class FairMediaService {
  constructor(gateway = supabaseGateway) {
    this.gateway = gateway;
  }

  async assertEdition(editionId, principal) {
    requireBecoAdmin(principal);
    validateUuid(editionId, 'Edição');
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=id,fair_id,title&id=eq.${editionId}&limit=1`);
    const edition = editions[0];
    if (!edition) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id&id=eq.${edition.fair_id}&organization_id=eq.${principal.organizationId}&limit=1`);
    if (!fairs[0]) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    return edition;
  }

  async nextPosition(editionId, role) {
    if (singletonRoles.has(role)) return 0;
    const links = await this.gateway.request(`rest/v1/fair_edition_media?select=position&fair_edition_id=eq.${editionId}&role=eq.${role}&order=position.desc&limit=1`);
    return (links[0]?.position ?? -1) + 1;
  }

  async createUploadUrl(editionId, input, principal) {
    await this.assertEdition(editionId, principal);
    const role = validateRole(input?.role);
    const file = validateFile(input);
    const path = `fair-editions/${editionId}/${role.toLowerCase()}/${randomUUID()}-${cleanFilename(file.originalFilename)}`;
    const signed = await this.gateway.createSignedUploadUrl(config.supabase.publicMediaBucket, path);
    return {
      bucket: config.supabase.publicMediaBucket,
      objectPath: path,
      uploadUrl: mediaUrl(signed.url || signed.signedURL),
      token: signed.token,
      role
    };
  }

  async completeUpload(editionId, input, principal) {
    await this.assertEdition(editionId, principal);
    const role = validateRole(input?.role);
    const file = validateFile(input);
    const prefix = `fair-editions/${editionId}/${role.toLowerCase()}/`;
    if (!String(input?.objectPath || '').startsWith(prefix)) throw new HttpError(422, 'INVALID_OBJECT_PATH', 'Caminho da imagem inválido.');
    await assertStoredImage(this.gateway, config.supabase.publicMediaBucket, input);
    const position = input.position === undefined ? await this.nextPosition(editionId, role) : Number(input.position);
    if (!Number.isInteger(position) || position < 0 || position > 500) throw new HttpError(422, 'INVALID_POSITION', 'Posição da imagem inválida.');
    if (singletonRoles.has(role) && position !== 0) throw new HttpError(422, 'INVALID_POSITION', 'Este tipo de imagem aceita somente a posição zero.');

    const occupied = await this.gateway.request(`rest/v1/fair_edition_media?select=id&fair_edition_id=eq.${editionId}&role=eq.${role}&position=eq.${position}&limit=1`);
    if (occupied[0]) throw new HttpError(409, 'MEDIA_POSITION_OCCUPIED', 'Já existe uma imagem neste papel e posição.');

    const assets = await this.gateway.request('rest/v1/media_assets', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: {
        owner_user_id: principal.id,
        storage_bucket: config.supabase.publicMediaBucket,
        object_path: input.objectPath,
        original_filename: cleanFilename(file.originalFilename),
        mime_type: file.mimeType,
        byte_size: file.byteSize,
        alt_text: optionalText(input.altText, 255, 'Texto alternativo'),
        visibility: 'PUBLIC',
        review_status: 'APPROVED',
        reviewed_by_user_id: principal.id,
        reviewed_at: new Date().toISOString()
      }
    });
    const asset = assets[0];
    if (!asset) throw new HttpError(502, 'MEDIA_NOT_CREATED', 'Não foi possível registrar a imagem.');
    try {
      const links = await this.gateway.request('rest/v1/fair_edition_media', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: {
          fair_edition_id: editionId,
          media_asset_id: asset.id,
          role,
          position
        }
      });
      return { ...links[0], asset: { ...asset, url: publicUrl(asset) } };
    } catch (error) {
      await this.gateway.request(`rest/v1/media_assets?id=eq.${asset.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw error;
    }
  }

  async list(editionId, principal) {
    await this.assertEdition(editionId, principal);
    const links = await this.gateway.request(`rest/v1/fair_edition_media?select=id,media_asset_id,role,position&fair_edition_id=eq.${editionId}&order=role.asc,position.asc`);
    const assetIds = links.map((link) => link.media_asset_id);
    const assets = assetIds.length
      ? await this.gateway.request(`rest/v1/media_assets?select=*&id=in.(${assetIds.join(',')})`)
      : [];
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return links.map((link) => {
      const asset = byId.get(link.media_asset_id);
      return { ...link, asset: asset ? { ...asset, url: publicUrl(asset) } : null };
    });
  }

  async remove(editionId, mediaId, principal) {
    await this.assertEdition(editionId, principal);
    validateUuid(mediaId, 'Mídia');
    const links = await this.gateway.request(`rest/v1/fair_edition_media?select=id,media_asset_id&id=eq.${mediaId}&fair_edition_id=eq.${editionId}&limit=1`);
    if (!links[0]) throw new HttpError(404, 'FAIR_MEDIA_NOT_FOUND', 'Imagem da feira não encontrada.');
    const assets = await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path&id=eq.${links[0].media_asset_id}&limit=1`);
    const asset = assets[0];
    if (!asset) throw new HttpError(404, 'FAIR_MEDIA_NOT_FOUND', 'Imagem da feira não encontrada.');
    await this.gateway.request(`rest/v1/media_assets?id=eq.${links[0].media_asset_id}`, { method: 'DELETE' });
    const storageDeleted = await this.gateway.deleteStorageObjects(asset.storage_bucket, [asset.object_path])
      .then(() => true).catch(() => false);
    return { deleted: true, storageDeleted };
  }
}
