import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { supabaseGateway } from '../../lib/supabase.js';
import { validateUuid } from '../fairs/fairs.validation.js';
import { FormsService } from '../forms/forms.service.js';

export function geographicCoordinates(input) {
  if(input.latitude===undefined && input.longitude===undefined)return {};
  const blank=value=>value===null||value==='';
  if(blank(input.latitude)&&blank(input.longitude))return {latitude:null,longitude:null};
  if(input.latitude===undefined||input.longitude===undefined||blank(input.latitude)||blank(input.longitude)||typeof input.latitude==='boolean'||typeof input.longitude==='boolean')throw new HttpError(422,'INVALID_COORDINATES','Informe latitude e longitude juntas.');
  const latitude=Number(input.latitude),longitude=Number(input.longitude);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -90||latitude > 90||longitude < -180||longitude > 180)throw new HttpError(422,'INVALID_COORDINATES','Coordenadas geográficas inválidas.');
  return {latitude,longitude};
}

function spaceInput(input) {
  const code = String(input.code || '').trim().toUpperCase();
  const label = input.label ? String(input.label).trim() : null;
  const width = Number(input.widthM);
  const height = Number(input.heightM);
  const x = input.xCoordinate === undefined || input.xCoordinate === null ? null : Number(input.xCoordinate);
  const y = input.yCoordinate === undefined || input.yCoordinate === null ? null : Number(input.yCoordinate);
  if (!code || code.length > 40) throw new HttpError(422, 'INVALID_SPACE', 'Código do espaço inválido.');
  if (!Number.isFinite(width) || width <= 0 || width > 100 || !Number.isFinite(height) || height <= 0 || height > 100) throw new HttpError(422, 'INVALID_SPACE', 'Dimensões do espaço inválidas.');
  if ((x !== null && !Number.isFinite(x)) || (y !== null && !Number.isFinite(y))) throw new HttpError(422, 'INVALID_SPACE', 'Coordenadas do espaço inválidas.');
  return { ...geographicCoordinates(input), code, label, width_m: width, height_m: height, x_coordinate: x, y_coordinate: y, is_available: true };
}

function spacePatch(input) {
  const patch = geographicCoordinates(input);
  if (input.code !== undefined) {
    const code = String(input.code || '').trim().toUpperCase();
    if (!code || code.length > 40) throw new HttpError(422, 'INVALID_SPACE', 'Código do espaço inválido.');
    patch.code = code;
  }
  if (input.label !== undefined) patch.label = input.label ? String(input.label).trim().slice(0, 100) : null;
  for (const [source, target, label] of [
    ['widthM', 'width_m', 'largura'], ['heightM', 'height_m', 'altura']
  ]) {
    if (input[source] !== undefined) {
      const value = Number(input[source]);
      if (!Number.isFinite(value) || value <= 0 || value > 100) throw new HttpError(422, 'INVALID_SPACE', `A ${label} do espaço é inválida.`);
      patch[target] = value;
    }
  }
  for (const [source, target] of [['xCoordinate', 'x_coordinate'], ['yCoordinate', 'y_coordinate']]) {
    if (input[source] !== undefined) {
      const value = input[source] === null ? null : Number(input[source]);
      if (value !== null && !Number.isFinite(value)) throw new HttpError(422, 'INVALID_SPACE', 'Coordenadas do espaço inválidas.');
      patch[target] = value;
    }
  }
  if (!Object.keys(patch).length) throw new HttpError(422, 'EMPTY_UPDATE', 'Informe ao menos um campo do espaço.');
  return patch;
}

export class SpacesService {
  constructor(gateway = supabaseGateway, formsService) {
    this.gateway = gateway;
    this.forms = formsService || new FormsService(gateway);
  }

  async list(editionId, principal) {
    await this.forms.assertEditionAdmin(editionId, principal);
    const [spaces,applications]=await Promise.all([
      this.gateway.request(`rest/v1/fair_spaces?select=*&fair_edition_id=eq.${editionId}&order=code.asc`),
      this.gateway.request(`rest/v1/applications?select=assigned_space_id,exhibitor:exhibitors(display_name)&fair_edition_id=eq.${editionId}&status=eq.CONFIRMED`)
    ]);
    const names=new Map(applications.map(a=>[a.assigned_space_id,a.exhibitor?.display_name]));
    return spaces.map(space=>({...space,assignedExhibitor:names.get(space.id)||null}));
  }

  async create(editionId, input, principal) {
    await this.forms.assertEditionAdmin(editionId, principal);
    const source = Array.isArray(input.spaces) ? input.spaces : [input];
    if (!source.length || source.length > 300) throw new HttpError(422, 'INVALID_SPACE', 'Informe entre 1 e 300 espaços.');
    const codes = new Set();
    const spaces = source.map((item) => {
      const parsed = spaceInput(item);
      if (codes.has(parsed.code)) throw new HttpError(422, 'DUPLICATE_SPACE', `O espaço ${parsed.code} está repetido.`);
      codes.add(parsed.code);
      return { ...parsed, fair_edition_id: editionId };
    });
    return this.gateway.request('rest/v1/fair_spaces', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: spaces
    });
  }

  async update(editionId, spaceId, input, principal) {
    await this.forms.assertEditionAdmin(editionId, principal);
    validateUuid(spaceId, 'Espaço');
    const rows = await this.gateway.request(`rest/v1/fair_spaces?id=eq.${spaceId}&fair_edition_id=eq.${editionId}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: spacePatch(input)
    });
    if (!rows[0]) throw new HttpError(404, 'SPACE_NOT_FOUND', 'Espaço não encontrado.');
    return rows[0];
  }

  async remove(editionId, spaceId, principal) {
    await this.forms.assertEditionAdmin(editionId, principal);
    validateUuid(spaceId, 'Espaço');
    const assigned = await this.gateway.request(`rest/v1/applications?select=id&assigned_space_id=eq.${spaceId}&limit=1`);
    if (assigned[0]) throw new HttpError(409, 'SPACE_ASSIGNED', 'Libere o espaço da inscrição antes de excluí-lo.');
    const rows = await this.gateway.request(`rest/v1/fair_spaces?select=id&id=eq.${spaceId}&fair_edition_id=eq.${editionId}&limit=1`);
    if (!rows[0]) throw new HttpError(404, 'SPACE_NOT_FOUND', 'Espaço não encontrado.');
    await this.gateway.request(`rest/v1/fair_spaces?id=eq.${spaceId}`, { method: 'DELETE' });
    return { deleted: true };
  }

  async assign(applicationId, spaceId, principal) {
    requireBecoAdmin(principal);
    validateUuid(applicationId, 'Inscrição');
    validateUuid(spaceId, 'Espaço');
    const rows = await this.gateway.request(`rest/v1/applications?select=fair_edition_id&id=eq.${applicationId}&limit=1`);
    if (!rows[0]) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Inscrição não encontrada.');
    await this.forms.assertEditionAdmin(rows[0].fair_edition_id, principal);
    const result = await this.gateway.request('rest/v1/rpc/assign_application_space', {
      method: 'POST', body: {
        p_application_id: applicationId,
        p_space_id: spaceId,
        p_actor_user_id: principal.id
      }
    });
    return Array.isArray(result) ? result[0] : result;
  }

  async release(applicationId, principal) {
    requireBecoAdmin(principal);
    validateUuid(applicationId, 'Inscrição');
    const rows = await this.gateway.request(`rest/v1/applications?select=fair_edition_id&id=eq.${applicationId}&limit=1`);
    if (!rows[0]) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Inscrição não encontrada.');
    await this.forms.assertEditionAdmin(rows[0].fair_edition_id, principal);
    const result = await this.gateway.request('rest/v1/rpc/release_application_space', {
      method: 'POST', body: { p_application_id: applicationId, p_actor_user_id: principal.id }
    });
    return Array.isArray(result) ? result[0] : result;
  }

  async mySpace(principal) {
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Ação disponível somente para expositores.');
    const exhibitors = await this.gateway.request(`rest/v1/exhibitors?select=id&user_id=eq.${principal.id}&limit=1`);
    if (!exhibitors[0]) throw new HttpError(404, 'EXHIBITOR_NOT_FOUND', 'Expositor não encontrado.');
    const applications = await this.gateway.request(`rest/v1/applications?select=id,fair_edition_id,assigned_space_id,status&exhibitor_id=eq.${exhibitors[0].id}&status=eq.CONFIRMED&order=space_assigned_at.desc`);
    const editionIds = [...new Set(applications.map((item) => item.fair_edition_id))];
    if (!editionIds.length) return [];
    const assignedIds=applications.map(a=>a.assigned_space_id).filter(Boolean);
    const [spaces,editions]=await Promise.all([
      assignedIds.length?this.gateway.request(`rest/v1/fair_spaces?select=id,code,label,width_m,height_m,latitude,longitude,fair_edition_id&id=in.(${assignedIds.join(',')})`):[],
      this.gateway.request(`rest/v1/fair_editions?select=id,title,slug,starts_at,ends_at,location_id&id=in.(${editionIds.join(',')})`)
    ]);
    const locationIds=[...new Set(editions.map(e=>e.location_id).filter(Boolean))];
    const locations=locationIds.length?await this.gateway.request(`rest/v1/locations?select=id,name,address_line,neighborhood,city,state,latitude,longitude&id=in.(${locationIds.join(',')})`):[];
    const byLocation=new Map(locations.map(l=>[l.id,l]));
    const byEdition=new Map(editions.map(e=>[e.id,{...e,location:byLocation.get(e.location_id)||null}]));
    return applications.map(application=>({
      ...application,
      edition:byEdition.get(application.fair_edition_id)||null,
      assignedSpace:spaces.find(space=>space.id===application.assigned_space_id&&space.fair_edition_id===application.fair_edition_id)||null
    }));
  }
}
