import { assertStoredImage } from '../../lib/storage.js';
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { supabaseGateway } from '../../lib/supabase.js';
import { validateUuid } from '../fairs/fairs.validation.js';

function cleanFilename(name = 'imagem') {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120) || 'imagem';
}

function optionalText(value, max, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const result = String(value).trim();
  if (result.length > max) throw new HttpError(422, 'INVALID_INPUT', `${label} deve ter até ${max} caracteres.`);
  return result;
}

function mediaUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${config.supabase.url}${path}`;
}

function socialLinks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, 'INVALID_SOCIAL_LINKS', 'Informe as redes sociais em um objeto válido.');
  const allowed = new Set(['instagram', 'facebook', 'tiktok', 'youtube', 'website', 'whatsapp', 'catalog']);
  const result = {};
  for (const [key, rawUrl] of Object.entries(value)) {
    if (!allowed.has(key)) throw new HttpError(422, 'INVALID_SOCIAL_LINKS', `Rede social não reconhecida: ${key}.`);
    if (rawUrl === null || rawUrl === '') continue;
    const url = String(rawUrl).trim();
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || url.length > 500) throw new Error('invalid');
    } catch {
      throw new HttpError(422, 'INVALID_SOCIAL_LINKS', `Link inválido em ${key}.`);
    }
    result[key] = url;
  }
  return result;
}

function publicUrl(value, label) {
  if (value === undefined || value === null || value === '') return null;
  try {
    return socialLinks({ website: value }).website;
  } catch {
    throw new HttpError(422, 'INVALID_URL', `${label} deve ser uma URL HTTP ou HTTPS válida.`);
  }
}

export class ExhibitorsService {
  constructor(gateway = supabaseGateway) {
    this.gateway = gateway;
  }

  async profileFor(principal, approved = false) {
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Ação disponível somente para expositores.');
    const rows = await this.gateway.request(`rest/v1/exhibitors?select=*&user_id=eq.${principal.id}&limit=1`);
    const profile = rows[0];
    if (!profile) throw new HttpError(404, 'EXHIBITOR_NOT_FOUND', 'Perfil não encontrado.');
    if (approved && profile.status === 'SUSPENDED') throw new HttpError(403, 'EXHIBITOR_NOT_APPROVED', 'Seu cadastro ainda não está aprovado.');
    return profile;
  }

  async categories() {
    return this.gateway.request('rest/v1/exhibitor_categories?select=id,name,slug&is_active=eq.true&order=name.asc');
  }

  async categoryMap(exhibitorIds) {
    if (!exhibitorIds.length) return new Map();
    const links = await this.gateway.request(`rest/v1/exhibitor_category_links?select=exhibitor_id,category_id&exhibitor_id=in.(${exhibitorIds.join(',')})`);
    const ids = [...new Set(links.map((link) => link.category_id))];
    const categories = ids.length ? await this.gateway.request(`rest/v1/exhibitor_categories?select=id,name,slug&id=in.(${ids.join(',')})`) : [];
    const byId = new Map(categories.map((item) => [item.id, item]));
    const result = new Map();
    for (const link of links) {
      if (!result.has(link.exhibitor_id)) result.set(link.exhibitor_id, []);
      if (byId.has(link.category_id)) result.get(link.exhibitor_id).push(byId.get(link.category_id));
    }
    return result;
  }

  async listPublic({ city } = {}) {
    const cityFilter = city ? `&city=ilike.${encodeURIComponent(city.trim())}` : '';
    const profiles = await this.gateway.request(`rest/v1/exhibitors?select=id,display_name,bio,city,state,instagram_url,social_links&status=eq.APPROVED&profile_visibility=eq.PUBLIC${cityFilter}&order=display_name.asc`);
    const categories = await this.categoryMap(profiles.map((profile) => profile.id));
    return Promise.all(profiles.map(async (profile) => ({
      ...profile,
      categories: categories.get(profile.id) || [],
      portfolio: await this.portfolio(profile.id, true)
    })));
  }

  async portfolio(exhibitorId, publicOnly) {
    const links = await this.gateway.request(`rest/v1/exhibitor_portfolio_media?select=id,media_asset_id,position,is_featured&exhibitor_id=eq.${exhibitorId}&order=position.asc`);
    if (!links.length) return [];
    const ids = links.map((link) => link.media_asset_id);
    const filter = publicOnly ? '&review_status=eq.APPROVED' : '';
    const assets = await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path,original_filename,mime_type,alt_text,review_status,curator_note&id=in.(${ids.join(',')})${filter}`);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const result = [];
    for (const link of links) {
      const asset = byId.get(link.media_asset_id);
      if (!asset) continue;
      const signed = await this.gateway.createSignedReadUrl(asset.storage_bucket, asset.object_path, publicOnly ? 3600 : 900);
      const { curator_note, ...publicAsset } = asset;
      result.push({ ...link, ...(publicOnly ? publicAsset : asset), url: mediaUrl(signed.signedURL || signed.url) });
    }
    return result;
  }

  async publicDetail(exhibitorId) {
    validateUuid(exhibitorId, 'Expositor');
    const rows = await this.gateway.request(`rest/v1/exhibitors?select=id,display_name,bio,city,state,instagram_url,social_links&id=eq.${exhibitorId}&status=eq.APPROVED&profile_visibility=eq.PUBLIC&limit=1`);
    const profile = rows[0];
    if (!profile) throw new HttpError(404, 'EXHIBITOR_NOT_FOUND', 'Expositor não encontrado.');
    const [categories, portfolio, applications] = await Promise.all([
      this.categoryMap([profile.id]),
      this.portfolio(profile.id, true),
      this.gateway.request(`rest/v1/applications?select=fair_edition_id,status,assigned_space_id&exhibitor_id=eq.${profile.id}&status=in.(CONFIRMED)`)
    ]);
    const editionIds = applications.map((item) => item.fair_edition_id);
    const editions = editionIds.length
      ? await this.gateway.request(`rest/v1/fair_editions?select=id,fair_id,title,slug,starts_at,ends_at,status&id=in.(${editionIds.join(',')})`)
      : [];
    return { ...profile, categories: categories.get(profile.id) || [], portfolio, fairHistory: editions };
  }

  async adminDetail(exhibitorId, principal) {
    requireBecoAdmin(principal);
    validateUuid(exhibitorId, 'Expositor');
    const rows = await this.gateway.request(`rest/v1/exhibitors?select=*&id=eq.${exhibitorId}&limit=1`);
    const profile = rows[0];
    if (!profile) throw new HttpError(404, 'EXHIBITOR_NOT_FOUND', 'Expositor não encontrado.');
    const [users, categories, portfolio, applications] = await Promise.all([
      this.gateway.request(`rest/v1/app_users?select=id,email,full_name,is_active,created_at&id=eq.${profile.user_id}&limit=1`),
      this.categoryMap([profile.id]),
      this.portfolio(profile.id, false),
      this.gateway.request(`rest/v1/applications?select=*&exhibitor_id=eq.${profile.id}&order=created_at.desc`)
    ]);
    const editionIds = [...new Set(applications.map((item) => item.fair_edition_id))];
    const editions = editionIds.length
      ? await this.gateway.request(`rest/v1/fair_editions?select=id,fair_id,title,slug,starts_at,ends_at,status&id=in.(${editionIds.join(',')})`)
      : [];
    const fairIds = [...new Set(editions.map((item) => item.fair_id))];
    const fairs = fairIds.length
      ? await this.gateway.request(`rest/v1/fairs?select=id,name,slug&id=in.(${fairIds.join(',')})`)
      : [];
    const editionById = new Map(editions.map((item) => [item.id, item]));
    const fairById = new Map(fairs.map((item) => [item.id, item]));
    return {
      ...profile,
      account: users[0] || null,
      categories: categories.get(profile.id) || [],
      portfolio,
      applications: applications.map((application) => {
        const edition = editionById.get(application.fair_edition_id);
        return { ...application, edition: edition ? { ...edition, fair: fairById.get(edition.fair_id) || null } : null };
      })
    };
  }

  async mine(principal) {
    const profile = await this.profileFor(principal);
    const [categories, portfolio] = await Promise.all([this.categoryMap([profile.id]), this.portfolio(profile.id, false)]);
    return { ...profile, categories: categories.get(profile.id) || [], portfolio };
  }

  async updateMine(input, principal) {
    const profile = await this.profileFor(principal);
    const patch = {};
    if (input.displayName !== undefined) {
      const name = String(input.displayName || '').trim();
      if (name.length < 2 || name.length > 180) throw new HttpError(422, 'INVALID_INPUT', 'Nome público inválido.');
      patch.display_name = name;
    }
    if (input.contactName !== undefined) { const name = String(input.contactName || '').trim(); if (name.length < 3 || name.length > 180) throw new HttpError(422, 'INVALID_INPUT', 'Informe um nome de contato válido.'); patch.contact_name = name; }
    if (input.phone !== undefined) { const phone = String(input.phone || '').trim(); if (phone.length > 30 || phone.replace(/\D/g, '').length < 8) throw new HttpError(422, 'INVALID_PHONE', 'Informe um telefone válido.'); patch.phone = phone; }
    if (input.instagramUrl !== undefined) patch.instagram_url = publicUrl(input.instagramUrl, 'Instagram');
    if (input.socialLinks !== undefined) patch.social_links = socialLinks(input.socialLinks);
    if (input.bio !== undefined) patch.bio = optionalText(input.bio, 5000, 'Biografia');
    if (input.city !== undefined) patch.city = optionalText(input.city, 120, 'Cidade');
    if (input.state !== undefined) {
      const state = String(input.state || '').trim().toUpperCase();
      if (state.length !== 2) throw new HttpError(422, 'INVALID_STATE', 'Estado deve ter duas letras.');
      patch.state = state;
    }
    if (input.profileVisibility !== undefined) {
      const visibility = String(input.profileVisibility).toUpperCase();
      if (!['PUBLIC', 'PRIVATE'].includes(visibility)) throw new HttpError(422, 'INVALID_VISIBILITY', 'Visibilidade inválida.');
      patch.profile_visibility = visibility;
    }
    const categoryIds = input.categoryIds;
    if (!Object.keys(patch).length && categoryIds === undefined) throw new HttpError(422, 'EMPTY_UPDATE', 'Informe ao menos um campo.');
    if (categoryIds !== undefined) {
      if (!Array.isArray(categoryIds) || categoryIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new HttpError(422, 'INVALID_CATEGORIES', 'Categorias inválidas.');
      const unique = [...new Set(categoryIds)];
      const valid = unique.length ? await this.gateway.request(`rest/v1/exhibitor_categories?select=id&id=in.(${unique.join(',')})&is_active=eq.true`) : [];
      if (valid.length !== unique.length) throw new HttpError(422, 'INVALID_CATEGORIES', 'Uma categoria não existe ou está inativa.');
      await this.gateway.request('rest/v1/rpc/replace_exhibitor_categories', {
        method: 'POST',
        body: { p_exhibitor_id: profile.id, p_category_ids: unique }
      });
    }
    if (Object.keys(patch).length) {
      const rows = await this.gateway.request(`rest/v1/exhibitors?id=eq.${profile.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { ...patch, updated_at: new Date().toISOString() }
      });
      return rows[0];
    }
    return profile;
  }

  async uploadUrl(input, principal) {
    const profile = await this.profileFor(principal, true);
    if (!String(input.originalFilename || '').trim()) throw new HttpError(422, 'INVALID_FILENAME', 'Informe o nome da imagem.');
    if (!config.upload.allowedMimeTypes.includes(input.mimeType)) throw new HttpError(422, 'INVALID_MEDIA_TYPE', 'Formato de imagem inválido.');
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > config.upload.maxBytes) throw new HttpError(422, 'INVALID_MEDIA_SIZE', 'Tamanho de imagem inválido.');
    const path = `exhibitors/${profile.id}/portfolio/${randomUUID()}-${cleanFilename(input.originalFilename)}`;
    const signed = await this.gateway.createSignedUploadUrl(config.supabase.curationSubmissionsBucket, path);
    return { bucket: config.supabase.curationSubmissionsBucket, objectPath: path, uploadUrl: mediaUrl(signed.url), token: signed.token };
  }

  async completeUpload(input, principal) {
    const profile = await this.profileFor(principal, true);
    const prefix = `exhibitors/${profile.id}/portfolio/`;
    if (!String(input.objectPath || '').startsWith(prefix)) throw new HttpError(422, 'INVALID_OBJECT_PATH', 'Caminho da imagem inválido.');
    if (!String(input.originalFilename || '').trim() || !config.upload.allowedMimeTypes.includes(input.mimeType) || !Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > config.upload.maxBytes) {
      throw new HttpError(422, 'INVALID_MEDIA', 'Metadados da imagem inválidos.');
    }
    await assertStoredImage(this.gateway, config.supabase.curationSubmissionsBucket, input);
    const links = await this.gateway.request(`rest/v1/exhibitor_portfolio_media?select=position&exhibitor_id=eq.${profile.id}&order=position.desc&limit=1`);
    const position = (links[0]?.position ?? -1) + 1;
    if (position >= 30) throw new HttpError(409, 'PORTFOLIO_LIMIT', 'A galeria pode ter no máximo 30 imagens.');
    const assets = await this.gateway.request('rest/v1/media_assets', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: {
        owner_user_id: principal.id, owner_exhibitor_id: profile.id,
        storage_bucket: config.supabase.curationSubmissionsBucket,
        object_path: input.objectPath, original_filename: cleanFilename(input.originalFilename),
        mime_type: input.mimeType, byte_size: input.byteSize,
        alt_text: optionalText(input.altText, 255, 'Texto alternativo'),
        visibility: 'PRIVATE', review_status: 'PENDING'
      }
    });
    const asset = assets[0];
    try {
      await this.gateway.request('rest/v1/exhibitor_portfolio_media', {
        method: 'POST', body: { exhibitor_id: profile.id, media_asset_id: asset.id, position, is_featured: position === 0 }
      });
    } catch (error) {
      await this.gateway.request(`rest/v1/media_assets?id=eq.${asset.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw error;
    }
    return asset;
  }

  async removePortfolioMedia(mediaAssetId, principal) {
    validateUuid(mediaAssetId, 'Mídia');
    const profile = await this.profileFor(principal);
    const links = await this.gateway.request(`rest/v1/exhibitor_portfolio_media?select=media_asset_id&exhibitor_id=eq.${profile.id}&media_asset_id=eq.${mediaAssetId}&limit=1`);
    if (!links[0]) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'Imagem não encontrada na sua galeria.');
    const assets = await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path&id=eq.${mediaAssetId}&limit=1`);
    const asset = assets[0];
    if (!asset) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'Imagem não encontrada.');
    await this.gateway.request(`rest/v1/media_assets?id=eq.${mediaAssetId}`, { method: 'DELETE' });
    const storageDeleted = await this.gateway.deleteStorageObjects(asset.storage_bucket, [asset.object_path])
      .then(() => true).catch(() => false);
    return { deleted: true, storageDeleted };
  }
}
