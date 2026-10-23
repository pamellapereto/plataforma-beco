import { HttpError } from '../../lib/http.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const editionStatuses = ['DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'CURATION', 'CONFIRMED', 'FINISHED', 'CANCELLED'];
const statusTransitions = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['DRAFT', 'REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['CURATION', 'CANCELLED'],
  CURATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: []
};

function requiredText(value, field, max) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) throw new HttpError(422, 'INVALID_INPUT', `${field} é obrigatório e deve ter até ${max} caracteres.`);
  return normalized;
}

function optionalText(value, field, max) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const normalized = String(value).trim();
  if (normalized.length > max) throw new HttpError(422, 'INVALID_INPUT', `${field} deve ter até ${max} caracteres.`);
  return normalized;
}

function dateValue(value, field, required = true) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(422, 'INVALID_DATE', `${field} possui uma data inválida.`);
  return date.toISOString();
}

function integer(value, field, { min = 0, max = 32767, required = true } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new HttpError(422, 'INVALID_NUMBER', `${field} possui um valor inválido.`);
  return parsed;
}

function coordinate(value, field, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new HttpError(422, 'INVALID_COORDINATE', `${field} possui uma coordenada inválida.`);
  return parsed;
}

function optionalUrl(value, field) {
  if (value === undefined || value === null || value === '') return null;
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new HttpError(422, 'INVALID_URL', `${field} deve ser uma URL HTTP ou HTTPS válida.`);
  }
}

function slug(value, fallback) {
  const source = String(value || fallback || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalized = source.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
  if (!normalized) throw new HttpError(422, 'INVALID_SLUG', 'Não foi possível gerar o endereço da página.');
  return normalized;
}

export function validateUuid(value, field = 'Identificador') {
  if (!uuidPattern.test(String(value || ''))) throw new HttpError(422, 'INVALID_ID', `${field} inválido.`);
  return value;
}

function categoryIds(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new HttpError(422, 'INVALID_CATEGORIES', 'As categorias devem ser uma lista.');
  return [...new Set(value.map((id) => validateUuid(id, 'Categoria')))];
}

function status(value, creation = false) {
  const normalized = String(value || 'DRAFT').toUpperCase();
  if (!editionStatuses.includes(normalized)) throw new HttpError(422, 'INVALID_STATUS', 'Status de edição inválido.');
  if (creation && !['DRAFT', 'PUBLISHED'].includes(normalized)) {
    throw new HttpError(422, 'INVALID_STATUS', 'Uma edição nova deve começar como rascunho ou publicada.');
  }
  return normalized;
}

function assertDates(startsAt, endsAt, registrationOpensAt, registrationClosesAt) {
  if (new Date(endsAt) <= new Date(startsAt)) throw new HttpError(422, 'INVALID_DATE_RANGE', 'O término da edição deve ocorrer depois do início.');
  if (registrationOpensAt && registrationClosesAt && new Date(registrationClosesAt) <= new Date(registrationOpensAt)) {
    throw new HttpError(422, 'INVALID_REGISTRATION_RANGE', 'O encerramento das inscrições deve ocorrer depois da abertura.');
  }
  if (registrationOpensAt && new Date(registrationOpensAt) >= new Date(startsAt)) {
    throw new HttpError(422, 'INVALID_REGISTRATION_RANGE', 'As inscrições devem abrir antes do início da edição.');
  }
  if (registrationClosesAt && new Date(registrationClosesAt) > new Date(startsAt)) {
    throw new HttpError(422, 'INVALID_REGISTRATION_RANGE', 'As inscrições devem encerrar até o início da edição.');
  }
}

export function validateFairCreate(input = {}) {
  const name = requiredText(input.name, 'Nome da feira', 180);
  return {
    name,
    slug: slug(input.slug, name),
    short_description: optionalText(input.shortDescription, 'Descrição curta', 500),
    description: optionalText(input.description, 'Descrição', 10000),
    categoryIds: categoryIds(input.categoryIds) || []
  };
}

export function validateFairPatch(input = {}) {
  const patch = {};
  if (input.name !== undefined) patch.name = requiredText(input.name, 'Nome da feira', 180);
  if (input.slug !== undefined) patch.slug = slug(input.slug);
  if (input.shortDescription !== undefined) patch.short_description = optionalText(input.shortDescription, 'Descrição curta', 500);
  if (input.description !== undefined) patch.description = optionalText(input.description, 'Descrição', 10000);
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') throw new HttpError(422, 'INVALID_INPUT', 'Situação ativa deve ser verdadeira ou falsa.');
    patch.is_active = input.isActive;
  }
  return { patch, categoryIds: categoryIds(input.categoryIds) };
}

export function validateLocation(input = {}, partial = false) {
  const result = {};
  const addRequired = (key, dbKey, label, max) => {
    if (!partial || input[key] !== undefined) result[dbKey] = requiredText(input[key], label, max);
  };
  addRequired('addressLine', 'address_line', 'Endereço', 255);
  addRequired('city', 'city', 'Cidade', 120);
  addRequired('state', 'state', 'Estado', 2);
  if (result.state) result.state = result.state.toUpperCase();
  if (result.state && result.state.length !== 2) throw new HttpError(422, 'INVALID_STATE', 'Estado deve usar uma sigla com duas letras.');
  if (!partial || input.name !== undefined) result.name = optionalText(input.name, 'Nome do local', 180);
  if (!partial || input.complement !== undefined) result.complement = optionalText(input.complement, 'Complemento', 120);
  if (!partial || input.neighborhood !== undefined) result.neighborhood = optionalText(input.neighborhood, 'Bairro', 120);
  if (!partial || input.postalCode !== undefined) result.postal_code = optionalText(input.postalCode, 'CEP', 12);
  if (!partial || input.mapsUrl !== undefined) result.maps_url = optionalUrl(input.mapsUrl, 'Link do mapa');
  if (!partial || input.latitude !== undefined) result.latitude = coordinate(input.latitude, 'Latitude', -90, 90);
  if (!partial || input.longitude !== undefined) result.longitude = coordinate(input.longitude, 'Longitude', -180, 180);
  if (partial && !Object.keys(result).length) throw new HttpError(422, 'EMPTY_UPDATE', 'Informe ao menos um campo do local.');
  return result;
}

export function validateEditionCreate(input = {}) {
  const title = requiredText(input.title, 'Título da edição', 220);
  const startsAt = dateValue(input.startsAt, 'Início');
  const endsAt = dateValue(input.endsAt, 'Término');
  const registrationOpensAt = dateValue(input.registrationOpensAt, 'Abertura das inscrições', false);
  const registrationClosesAt = dateValue(input.registrationClosesAt, 'Encerramento das inscrições', false);
  assertDates(startsAt, endsAt, registrationOpensAt, registrationClosesAt);
  return {
    edition: {
      title,
      slug: slug(input.slug, title),
      edition_number: integer(input.editionNumber, 'Número da edição', { min: 1, required: false }),
      public_description: requiredText(input.publicDescription, 'Apresentação pública', 10000),
      visitor_guidance: optionalText(input.visitorGuidance, 'Orientações ao público', 10000),
      exhibitor_guidance: optionalText(input.exhibitorGuidance, 'Orientações aos expositores', 10000),
      starts_at: startsAt,
      ends_at: endsAt,
      registration_opens_at: registrationOpensAt,
      registration_closes_at: registrationClosesAt,
      exhibitor_capacity: integer(input.exhibitorCapacity, 'Capacidade de expositores', { min: 1 }),
      status: status(input.status, true)
    },
    location: validateLocation(input.location)
  };
}

export function validateEditionPatch(input = {}, current) {
  const patch = {};
  if (input.title !== undefined) patch.title = requiredText(input.title, 'Título da edição', 220);
  if (input.slug !== undefined) patch.slug = slug(input.slug);
  if (input.editionNumber !== undefined) patch.edition_number = integer(input.editionNumber, 'Número da edição', { min: 1, required: false });
  if (input.publicDescription !== undefined) patch.public_description = requiredText(input.publicDescription, 'Apresentação pública', 10000);
  if (input.visitorGuidance !== undefined) patch.visitor_guidance = optionalText(input.visitorGuidance, 'Orientações ao público', 10000);
  if (input.exhibitorGuidance !== undefined) patch.exhibitor_guidance = optionalText(input.exhibitorGuidance, 'Orientações aos expositores', 10000);
  if (input.exhibitorCapacity !== undefined) patch.exhibitor_capacity = integer(input.exhibitorCapacity, 'Capacidade de expositores', { min: 1 });
  if (input.startsAt !== undefined) patch.starts_at = dateValue(input.startsAt, 'Início');
  if (input.endsAt !== undefined) patch.ends_at = dateValue(input.endsAt, 'Término');
  if (input.registrationOpensAt !== undefined) patch.registration_opens_at = dateValue(input.registrationOpensAt, 'Abertura das inscrições', false);
  if (input.registrationClosesAt !== undefined) patch.registration_closes_at = dateValue(input.registrationClosesAt, 'Encerramento das inscrições', false);
  if (input.status !== undefined) {
    const next = status(input.status);
    if (next !== current.status && !statusTransitions[current.status].includes(next)) {
      throw new HttpError(409, 'INVALID_STATUS_TRANSITION', `Não é possível mudar a edição de ${current.status} para ${next}.`);
    }
    patch.status = next;
  }
  assertDates(
    patch.starts_at || current.starts_at,
    patch.ends_at || current.ends_at,
    patch.registration_opens_at === undefined ? current.registration_opens_at : patch.registration_opens_at,
    patch.registration_closes_at === undefined ? current.registration_closes_at : patch.registration_closes_at
  );
  if (!Object.keys(patch).length) throw new HttpError(422, 'EMPTY_UPDATE', 'Informe ao menos um campo da edição.');
  return patch;
}
