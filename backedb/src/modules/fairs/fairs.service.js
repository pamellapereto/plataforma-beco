import { requireBecoAdmin } from '../../lib/auth.js';
import { config } from '../../config.js';
import { HttpError } from '../../lib/http.js';
import { supabaseGateway } from '../../lib/supabase.js';
import {
  validateEditionCreate,
  validateEditionPatch,
  validateFairCreate,
  validateFairPatch,
  validateLocation,
  validateUuid
} from './fairs.validation.js';

function idsFilter(ids) {
  return ids.join(',');
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item);
    return groups;
  }, new Map());
}

function publicMediaUrl(asset) {
  const base = config.supabase.url?.replace(/\/$/, '') || '';
  const path = asset.object_path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${encodeURIComponent(asset.storage_bucket)}/${path}`;
}

export class FairsService {
  constructor(gateway = supabaseGateway) {
    this.gateway = gateway;
  }

  async categories() {
    return this.gateway.request('rest/v1/fair_categories?select=id,parent_id,name,slug&is_active=eq.true&order=name.asc');
  }

  async categoryMap(fairIds) {
    if (!fairIds.length) return new Map();
    const links = await this.gateway.request(`rest/v1/fair_category_links?select=fair_id,category_id&fair_id=in.(${idsFilter(fairIds)})`);
    const categoryIds = [...new Set(links.map((link) => link.category_id))];
    const categories = categoryIds.length
      ? await this.gateway.request(`rest/v1/fair_categories?select=id,parent_id,name,slug&id=in.(${idsFilter(categoryIds)})`)
      : [];
    const byId = new Map(categories.map((category) => [category.id, category]));
    const result = new Map();
    for (const link of links) {
      if (!result.has(link.fair_id)) result.set(link.fair_id, []);
      if (byId.has(link.category_id)) result.get(link.fair_id).push(byId.get(link.category_id));
    }
    return result;
  }

  async publicMediaMap(editionIds) {
    if (!editionIds.length) return new Map();
    const links = await this.gateway.request(`rest/v1/fair_edition_media?select=id,fair_edition_id,media_asset_id,role,position&fair_edition_id=in.(${idsFilter(editionIds)})&order=position.asc`);
    const assetIds = links.map((link) => link.media_asset_id);
    const assets = assetIds.length
      ? await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path,original_filename,mime_type,alt_text&id=in.(${idsFilter(assetIds)})&visibility=eq.PUBLIC&review_status=eq.APPROVED`)
      : [];
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const result = new Map();
    for (const link of links) {
      const asset = byId.get(link.media_asset_id);
      if (!asset) continue;
      if (!result.has(link.fair_edition_id)) result.set(link.fair_edition_id, []);
      result.get(link.fair_edition_id).push({
        id: link.id,
        role: link.role,
        position: link.position,
        altText: asset.alt_text,
        mimeType: asset.mime_type,
        url: publicMediaUrl(asset)
      });
    }
    return result;
  }

  async list({ admin = false, city, principal } = {}) {
    if (admin) requireBecoAdmin(principal);
    const fairFilter = admin ? `&organization_id=eq.${principal.organizationId}` : '&is_active=eq.true';
    const fairSelect = admin
      ? 'id,organization_id,name,slug,short_description,description,is_active,created_at,updated_at'
      : 'id,name,slug,short_description,description';
    const fairs = await this.gateway.request(`rest/v1/fairs?select=${fairSelect}${fairFilter}&order=name.asc`);
    if (!fairs.length) return [];
    const fairIds = fairs.map((fair) => fair.id);
    const statusFilter = admin ? '' : '&status=not.in.(DRAFT,CANCELLED)';
    let editions = await this.gateway.request(`rest/v1/fair_editions?select=id,fair_id,location_id,title,slug,edition_number,public_description,starts_at,ends_at,registration_opens_at,registration_closes_at,exhibitor_capacity,status&fair_id=in.(${idsFilter(fairIds)})${statusFilter}&order=starts_at.desc`);
    const locationIds = [...new Set(editions.map((edition) => edition.location_id))];
    const locations = locationIds.length
      ? await this.gateway.request(`rest/v1/locations?select=id,name,address_line,complement,neighborhood,city,state,postal_code,maps_url,latitude,longitude&id=in.(${idsFilter(locationIds)})`)
      : [];
    const locationById = new Map(locations.map((location) => [location.id, location]));
    if (city) editions = editions.filter((edition) => locationById.get(edition.location_id)?.city.toLowerCase() === city.trim().toLowerCase());
    const mediaByEdition = await this.publicMediaMap(editions.map((edition) => edition.id));
    const editionsByFair = groupBy(editions.map((edition) => ({
      ...edition,
      location: locationById.get(edition.location_id) || null,
      media: mediaByEdition.get(edition.id) || []
    })), 'fair_id');
    const categoriesByFair = await this.categoryMap(fairIds);
    return fairs
      .map((fair) => ({ ...fair, categories: categoriesByFair.get(fair.id) || [], editions: editionsByFair.get(fair.id) || [] }))
      .filter((fair) => admin || fair.editions.length > 0);
  }

  async publicEdition(slug) {
    const editionFields = 'id,fair_id,location_id,title,slug,edition_number,public_description,visitor_guidance,starts_at,ends_at,registration_opens_at,registration_closes_at,exhibitor_capacity,status';
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=${editionFields}&slug=eq.${encodeURIComponent(slug)}&status=not.in.(DRAFT,CANCELLED)&limit=1`);
    const edition = editions[0];
    if (!edition) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const [fairs, locations, categoriesByFair, mediaByEdition] = await Promise.all([
      this.gateway.request(`rest/v1/fairs?select=id,name,slug,short_description,description,is_active&id=eq.${edition.fair_id}&is_active=eq.true&limit=1`),
      this.gateway.request(`rest/v1/locations?select=*&id=eq.${edition.location_id}&limit=1`),
      this.categoryMap([edition.fair_id]),
      this.publicMediaMap([edition.id])
    ]);
    if (!fairs[0]) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const applications = await this.gateway.request(`rest/v1/applications?select=exhibitor_id&fair_edition_id=eq.${edition.id}&status=eq.CONFIRMED`);
    const exhibitorIds = [...new Set(applications.map((application) => application.exhibitor_id))];
    const exhibitors = exhibitorIds.length
      ? await this.gateway.request(`rest/v1/exhibitors?select=id,display_name,bio,city,state,instagram_url,social_links&id=in.(${idsFilter(exhibitorIds)})&profile_visibility=eq.PUBLIC`)
      : [];
    const exhibitorsWithPortfolio = await Promise.all(exhibitors.map(async (exhibitor) => {
      const links = await this.gateway.request(`rest/v1/exhibitor_portfolio_media?select=media_asset_id,position,is_featured&exhibitor_id=eq.${exhibitor.id}&order=position.asc`);
      const assetIds = links.map((link) => link.media_asset_id);
      const assets = assetIds.length
        ? await this.gateway.request(`rest/v1/media_assets?select=id,storage_bucket,object_path,alt_text,mime_type&id=in.(${assetIds.join(',')})&visibility=eq.PUBLIC&review_status=eq.APPROVED`)
        : [];
      const assetById = new Map(assets.map((asset) => [asset.id, asset]));
      return {
        ...exhibitor,
        portfolio: links.map((link) => {
          const asset = assetById.get(link.media_asset_id);
          return asset ? { ...link, ...asset, url: publicMediaUrl(asset) } : null;
        }).filter(Boolean)
      };
    }));
    return {
      ...edition,
      fair: fairs[0],
      location: locations[0] || null,
      categories: categoriesByFair.get(edition.fair_id) || [],
      media: mediaByEdition.get(edition.id) || [],
      confirmedExhibitors: exhibitorsWithPortfolio
    };
  }

  async assertCategories(categoryIds) {
    if (!categoryIds.length) return;
    const categories = await this.gateway.request(`rest/v1/fair_categories?select=id&id=in.(${idsFilter(categoryIds)})&is_active=eq.true`);
    if (categories.length !== categoryIds.length) throw new HttpError(422, 'INVALID_CATEGORIES', 'Uma ou mais categorias não existem ou estão inativas.');
  }

  async replaceCategories(fairId, categoryIds) {
    await this.assertCategories(categoryIds);
    const oldLinks = await this.gateway.request(`rest/v1/fair_category_links?select=fair_id,category_id&fair_id=eq.${fairId}`);
    await this.gateway.request(`rest/v1/fair_category_links?fair_id=eq.${fairId}`, { method: 'DELETE' });
    if (!categoryIds.length) return;
    try {
      await this.gateway.request('rest/v1/fair_category_links', {
        method: 'POST', body: categoryIds.map((categoryId) => ({ fair_id: fairId, category_id: categoryId }))
      });
    } catch (error) {
      if (oldLinks.length) await this.gateway.request('rest/v1/fair_category_links', { method: 'POST', body: oldLinks }).catch(() => undefined);
      throw error;
    }
  }

  async createFair(input, principal) {
    requireBecoAdmin(principal);
    const data = validateFairCreate(input);
    await this.assertCategories(data.categoryIds);
    const rows = await this.gateway.request('rest/v1/fairs', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: {
        organization_id: principal.organizationId,
        name: data.name,
        slug: data.slug,
        short_description: data.short_description,
        description: data.description,
        is_active: true
      }
    });
    const fair = rows[0];
    if (!fair) throw new HttpError(502, 'FAIR_NOT_CREATED', 'Não foi possível criar a feira.');
    try {
      if (data.categoryIds.length) {
        await this.gateway.request('rest/v1/fair_category_links', {
          method: 'POST', body: data.categoryIds.map((categoryId) => ({ fair_id: fair.id, category_id: categoryId }))
        });
      }
    } catch (error) {
      await this.gateway.request(`rest/v1/fairs?id=eq.${fair.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw error;
    }
    return { ...fair, categories: data.categoryIds };
  }

  async updateFair(fairId, input, principal) {
    requireBecoAdmin(principal);
    validateUuid(fairId, 'Feira');
    const existing = await this.gateway.request(`rest/v1/fairs?select=id&id=eq.${fairId}&organization_id=eq.${principal.organizationId}&limit=1`);
    if (!existing[0]) throw new HttpError(404, 'FAIR_NOT_FOUND', 'Feira não encontrada.');
    const { patch, categoryIds } = validateFairPatch(input);
    if (!Object.keys(patch).length && categoryIds === undefined) throw new HttpError(422, 'EMPTY_UPDATE', 'Informe ao menos um campo da feira.');
    let fair = existing[0];
    if (Object.keys(patch).length) {
      const rows = await this.gateway.request(`rest/v1/fairs?id=eq.${fairId}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { ...patch, updated_at: new Date().toISOString() }
      });
      fair = rows[0];
    }
    if (categoryIds !== undefined) await this.replaceCategories(fairId, categoryIds);
    return fair;
  }

  async createEdition(fairId, input, principal) {
    requireBecoAdmin(principal);
    validateUuid(fairId, 'Feira');
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id&id=eq.${fairId}&organization_id=eq.${principal.organizationId}&limit=1`);
    if (!fairs[0]) throw new HttpError(404, 'FAIR_NOT_FOUND', 'Feira não encontrada.');
    const data = validateEditionCreate(input);
    const locations = await this.gateway.request('rest/v1/locations', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: data.location
    });
    const location = locations[0];
    if (!location) throw new HttpError(502, 'LOCATION_NOT_CREATED', 'Não foi possível criar o local.');
    try {
      const editions = await this.gateway.request('rest/v1/fair_editions', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: { ...data.edition, fair_id: fairId, location_id: location.id, created_by_user_id: principal.id }
      });
      if (!editions[0]) throw new HttpError(502, 'FAIR_EDITION_NOT_CREATED', 'Não foi possível criar a edição.');
      return { ...editions[0], location };
    } catch (error) {
      await this.gateway.request(`rest/v1/locations?id=eq.${location.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw error;
    }
  }

  async updateEdition(editionId, input, principal) {
    requireBecoAdmin(principal);
    validateUuid(editionId, 'Edição');
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=*&id=eq.${editionId}&limit=1`);
    const current = editions[0];
    if (!current) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id&id=eq.${current.fair_id}&organization_id=eq.${principal.organizationId}&limit=1`);
    if (!fairs[0]) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const patch = validateEditionPatch(input, current);
    if (patch.status === 'REGISTRATION_OPEN') {
      const forms = await this.gateway.request(`rest/v1/registration_forms?select=id&fair_edition_id=eq.${editionId}&is_published=eq.true&limit=1`);
      if (!forms[0]) throw new HttpError(409, 'FORM_REQUIRED', 'Publique o formulário antes de abrir as inscrições.');
      const opensAt = patch.registration_opens_at === undefined ? current.registration_opens_at : patch.registration_opens_at;
      const closesAt = patch.registration_closes_at === undefined ? current.registration_closes_at : patch.registration_closes_at;
      if (!opensAt || !closesAt) {
        throw new HttpError(409, 'REGISTRATION_DATES_REQUIRED', 'Defina a abertura e o encerramento das inscrições.');
      }
    }
    const rows = await this.gateway.request(`rest/v1/fair_editions?id=eq.${editionId}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { ...patch, updated_at: new Date().toISOString() }
    });
    return rows[0];
  }

  async updateLocation(locationId, input, principal) {
    requireBecoAdmin(principal);
    validateUuid(locationId, 'Local');
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=fair_id&location_id=eq.${locationId}&limit=1`);
    if (!editions[0]) throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Local não encontrado.');
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id&id=eq.${editions[0].fair_id}&organization_id=eq.${principal.organizationId}&limit=1`);
    if (!fairs[0]) throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Local não encontrado.');
    const rows = await this.gateway.request(`rest/v1/locations?id=eq.${locationId}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: validateLocation(input, true)
    });
    if (!rows[0]) throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Local não encontrado.');
    return rows[0];
  }
}
