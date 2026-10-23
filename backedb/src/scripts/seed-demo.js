import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { adminCreateAuthUser, supabaseRequest } from '../lib/supabase.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bucket = config.supabase.publicMediaBucket;

function password() {
  return `${randomBytes(24).toString('base64url')}Aa1!`;
}

function encodedPath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

async function upsert(table, body, conflict) {
  const suffix = conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : '';
  const rows = await supabaseRequest(`rest/v1/${table}${suffix}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function findOne(table, query) {
  const rows = await supabaseRequest(`rest/v1/${table}?${query}&limit=1`);
  return rows[0] || null;
}

async function authUser(email, fullName) {
  const response = await fetch(`${config.supabase.url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: {
      apikey: config.supabase.serviceRoleKey,
      Authorization: `Bearer ${config.supabase.serviceRoleKey}`
    }
  });
  if (!response.ok) throw new Error(`Falha ao consultar usuarios do Auth (${response.status}).`);
  const existing = (await response.json()).users?.find(user => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing;
  const created = await adminCreateAuthUser({ email, password: password(), fullName });
  return created.user || created;
}

async function upload(file, objectPath, mimeType, owner = {}) {
  const bytes = await readFile(path.join(root, file));
  const response = await fetch(`${config.supabase.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(objectPath)}`, {
    method: 'POST',
    headers: {
      apikey: config.supabase.serviceRoleKey,
      Authorization: `Bearer ${config.supabase.serviceRoleKey}`,
      'Content-Type': mimeType,
      'x-upsert': 'true'
    },
    body: bytes
  });
  if (!response.ok) throw new Error(`Falha no upload ${objectPath}: ${response.status} ${await response.text()}`);
  return upsert('media_assets', {
    owner_user_id: owner.userId || null,
    owner_exhibitor_id: owner.exhibitorId || null,
    storage_bucket: bucket,
    object_path: objectPath,
    original_filename: path.basename(file),
    mime_type: mimeType,
    byte_size: bytes.length,
    alt_text: owner.altText || null,
    visibility: 'PUBLIC',
    review_status: 'APPROVED',
    reviewed_by_user_id: owner.adminId || null,
    reviewed_at: new Date().toISOString()
  }, 'storage_bucket,object_path');
}

async function seed() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) throw new Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY antes do seed.');

  let organization = await findOne('organizations', `select=*&display_name=eq.${encodeURIComponent('BECO memória viva')}`);
  if (!organization) {
    organization = await upsert('organizations', {
      legal_name: 'Associação Cultural de Fomento à Arte e Memória de Sorocaba e Região',
      display_name: 'BECO memória viva',
      website_url: 'https://www.memoriavivasorocaba.com/',
      email: 'associacaoculturalsorocaba@gmail.com'
    });
  }

  const adminAuth = await authUser('dados-plataforma@beco.example', 'Equipe BECO');
  const admin = await upsert('app_users', {
    id: adminAuth.id,
    organization_id: organization.id,
    email: adminAuth.email,
    role: 'BECO_ADMIN',
    full_name: 'Equipe BECO',
    is_active: true
  }, 'id');

  const fairCategories = await supabaseRequest('rest/v1/fair_categories?select=id,slug');
  const fairCategoryBySlug = new Map(fairCategories.map(item => [item.slug, item.id]));
  const exhibitorCategories = await supabaseRequest('rest/v1/exhibitor_categories?select=id,slug');
  const exhibitorCategoryBySlug = new Map(exhibitorCategories.map(item => [item.slug, item.id]));

  const fairsData = [
    {
      slug: 'beco-do-inferno', name: 'Feira Beco do Inferno', short: 'Arte autoral, cultura independente e economia criativa no Centro de Sorocaba.',
      description: 'Desde 2016, a Feira Beco do Inferno ocupa o Centro de Sorocaba e aproxima artistas, expositores e público.',
      edition: { slug: '37-feira-beco-do-inferno', title: '37ª Feira Beco do Inferno', number: 37, status: 'REGISTRATION_OPEN', starts: '2026-10-18T10:00:00-03:00', ends: '2026-10-18T19:00:00-03:00', opens: '2026-09-20T09:00:00-03:00', closes: '2026-10-17T23:59:00-03:00', capacity: 60 },
      address: 'Rua Dr. Arthur Martins, 219', neighborhood: 'Centro', cover: 'assets/beco-feira.jpg', categories: ['arte-cultura', 'economia-criativa']
    },
    {
      slug: 'oca-feira-cultural', name: 'OCA Feira Cultural', short: 'Produção autoral, comunidade e diversidade cultural.',
      description: 'A OCA Feira Cultural cria um espaço de encontro entre produção local, educação e convivência comunitária.',
      edition: { slug: 'oca-feira-cultural-novembro-2026', title: 'OCA Feira Cultural · Novembro 2026', number: 12, status: 'PUBLISHED', starts: '2026-11-15T10:00:00-03:00', ends: '2026-11-15T18:00:00-03:00', opens: null, closes: null, capacity: 45 },
      address: 'Praça Frei Baraúna', neighborhood: 'Centro', cover: 'assets/oca-feira.png', categories: ['arte-cultura', 'economia-criativa']
    },
    {
      slug: 'feira-vila-operaria', name: 'Feira da Vila Operária', short: 'Memória, cultura e histórias do bairro Santa Rosália.',
      description: 'A Feira da Vila Operária valoriza a memória do trabalho, a identidade do bairro e os produtores de Sorocaba.',
      edition: { slug: 'feira-vila-operaria-dezembro-2026', title: 'Feira da Vila Operária · Dezembro 2026', number: 8, status: 'PUBLISHED', starts: '2026-12-06T10:00:00-03:00', ends: '2026-12-06T18:00:00-03:00', opens: null, closes: null, capacity: 40 },
      address: 'Praça Pio XII', neighborhood: 'Santa Rosália', cover: 'assets/vila-operaria.png', categories: ['memoria-patrimonio', 'economia-criativa']
    },
    {
      slug: 'reviva', name: 'REVIVA', short: 'Objetos, antiguidades, coleções e histórias que ganham novos encontros.',
      description: 'A REVIVA reúne memória material, antiguidades, sebos e colecionadores em uma experiência cultural acessível.',
      edition: { slug: 'reviva-fevereiro-2027', title: 'REVIVA · Fevereiro 2027', number: 5, status: 'PUBLISHED', starts: '2027-02-07T09:00:00-03:00', ends: '2027-02-07T17:00:00-03:00', opens: null, closes: null, capacity: 35 },
      address: 'Rua da Penha, 673', neighborhood: 'Centro', cover: 'assets/reviva-feira.jpg', categories: ['memoria-patrimonio', 'arte-cultura']
    }
  ];

  const editions = new Map();
  for (const item of fairsData) {
    const fair = await upsert('fairs', {
      organization_id: organization.id, name: item.name, slug: item.slug,
      short_description: item.short, description: item.description, is_active: true
    }, 'slug');
    for (const slug of item.categories) {
      if (fairCategoryBySlug.has(slug)) await upsert('fair_category_links', { fair_id: fair.id, category_id: fairCategoryBySlug.get(slug) }, 'fair_id,category_id');
    }
    const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${item.address}, ${item.neighborhood}, Sorocaba SP`)}&output=embed`;
    let location = await findOne('locations', `select=*&maps_url=eq.${encodeURIComponent(mapUrl)}`);
    if (!location) location = await upsert('locations', { name: item.name, address_line: item.address, neighborhood: item.neighborhood, city: 'Sorocaba', state: 'SP', maps_url: mapUrl });
    const edition = await upsert('fair_editions', {
      fair_id: fair.id, location_id: location.id, created_by_user_id: admin.id,
      title: item.edition.title, slug: item.edition.slug, edition_number: item.edition.number,
      public_description: item.description, visitor_guidance: 'Evento cultural aberto ao público. Consulte a programação e respeite as orientações da equipe.',
      exhibitor_guidance: 'A montagem e a localização dos espaços serão comunicadas após a confirmação da curadoria.',
      starts_at: item.edition.starts, ends_at: item.edition.ends,
      registration_opens_at: item.edition.opens, registration_closes_at: item.edition.closes,
      exhibitor_capacity: item.edition.capacity, status: item.edition.status
    }, 'slug');
    editions.set(item.slug, edition);
    const mimeType = item.cover.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const media = await upload(item.cover, `demo/fairs/${item.slug}/${path.basename(item.cover)}`, mimeType, { adminId: admin.id, altText: `Imagem da ${item.edition.title}` });
    await upsert('fair_edition_media', { fair_edition_id: edition.id, media_asset_id: media.id, role: 'COVER', position: 0 }, 'fair_edition_id,role,position');
  }

  const becoEdition = editions.get('beco-do-inferno');
  const form = await upsert('registration_forms', {
    fair_edition_id: becoEdition.id, title: 'Inscrição de expositores · 37ª Feira Beco do Inferno',
    introduction: 'Informações utilizadas exclusivamente pela curadoria da Associação.',
    required_consents: [{ key: 'responsibility', text: 'Declaro que as informações enviadas são verdadeiras e aceito os termos de participação.', required: true }],
    version: 1, is_published: true, created_by_user_id: admin.id
  }, 'fair_edition_id');
  const section = await upsert('registration_form_sections', { form_id: form.id, title: 'Identificação e proposta', description: 'Dados principais para análise da curadoria.', position: 0 }, 'form_id,position');
  await upsert('registration_form_fields', { section_id: section.id, field_key: 'presentation', label: 'Conte sobre seu trabalho', type: 'LONG_TEXT', is_required: true, is_sensitive: false, is_private: true, validation: { minLength: 20, maxLength: 2000 }, conditional_logic: {}, position: 0 }, 'section_id,field_key');

  const spaces = [];
  for (const [index, code] of ['L1', 'L2', 'F1', 'E4', 'E8', 'E9'].entries()) {
    spaces.push(await upsert('fair_spaces', { fair_edition_id: becoEdition.id, code, label: `Espaço ${code}`, width_m: code.startsWith('F') ? 3 : 2, height_m: code.startsWith('F') ? 3 : 2, x_coordinate: 12 + index * 13, y_coordinate: index % 2 ? 62 : 34, is_available: index >= 4 }, 'fair_edition_id,code'));
  }

  const exhibitorsData = [
    ['arte-em-madeira', 'Arte em Madeira', 'Artesanato', 'artesanato', 'Peças autorais em madeira reaproveitada, criadas para casa, afeto e memória.', 'assets/expositor-madeira-human.jpg'],
    ['ceramica-natural', 'Cerâmica Natural', 'Cerâmica', 'artesanato', 'Objetos e utilitários feitos à mão em pequenos lotes.', 'assets/expositor-ceramica-human.jpg'],
    ['luz-do-design', 'Luz do Design', 'Design', 'artes-visuais', 'Iluminação e objetos autorais para espaços mais acolhedores.', 'assets/expositor-luz-human.jpg'],
    ['trama-livre', 'Trama Livre', 'Moda autoral', 'moda-autoral', 'Têxteis, fios e roupas produzidos em pequena escala.', 'assets/expositor-trama-human.jpg'],
    ['cozinha-da-roca', 'Cozinha da Roça', 'Gastronomia', 'gastronomia', 'Sabores artesanais, receitas afetivas e produção local.', 'assets/evento-gastronomia-human.jpg'],
    ['papel-de-rua', 'Papel de Rua', 'Literatura', 'literatura-publicacoes', 'Gravuras, impressos independentes e pequenas edições.', 'assets/evento-arte-human.jpg']
  ];

  const exhibitors = [];
  for (const [slug, displayName, categoryName, categorySlug, bio, image] of exhibitorsData) {
    const user = await authUser(`${slug}@beco.example`, displayName);
    await upsert('app_users', { id: user.id, email: user.email, role: 'EXHIBITOR', full_name: displayName, is_active: true, terms_accepted_at: new Date().toISOString(), terms_version: '2026-10' }, 'id');
    const exhibitor = await upsert('exhibitors', {
      user_id: user.id, display_name: displayName, contact_name: displayName, phone: '(15) 3000-0000',
      instagram_url: 'https://www.instagram.com/', social_links: { instagram: 'https://www.instagram.com/', website: 'https://www.memoriavivasorocaba.com/' },
      bio, city: 'Sorocaba', state: 'SP', profile_visibility: 'PUBLIC', status: 'APPROVED'
    }, 'user_id');
    if (exhibitorCategoryBySlug.has(categorySlug)) await upsert('exhibitor_category_links', { exhibitor_id: exhibitor.id, category_id: exhibitorCategoryBySlug.get(categorySlug) }, 'exhibitor_id,category_id');
    const asset = await upload(image, `demo/exhibitors/${slug}/${path.basename(image)}`, 'image/jpeg', { userId: user.id, exhibitorId: exhibitor.id, adminId: admin.id, altText: `Produtos de ${displayName}` });
    await upsert('exhibitor_portfolio_media', { exhibitor_id: exhibitor.id, media_asset_id: asset.id, position: 0, is_featured: true }, 'media_asset_id');
    exhibitors.push({ exhibitor, categoryName });
  }

  for (const [index, item] of exhibitors.entries()) {
    const confirmed = index < 4;
    const application = await upsert('applications', {
      fair_edition_id: becoEdition.id, exhibitor_id: item.exhibitor.id, registration_form_id: form.id,
      status: confirmed ? 'CONFIRMED' : index === 4 ? 'UNDER_REVIEW' : 'PHOTO_REVIEW',
      requested_space_type: index === 2 ? '3x3' : '2x2', submitted_at: '2026-10-02T14:00:00-03:00',
      reviewed_by_user_id: confirmed ? admin.id : null, reviewed_at: confirmed ? '2026-10-10T16:00:00-03:00' : null,
      curator_decision_note: confirmed ? 'Participação confirmada pela curadoria.' : null,
      assigned_space_id: confirmed ? spaces[index].id : null,
      space_assigned_by_user_id: confirmed ? admin.id : null,
      space_assigned_at: confirmed ? '2026-10-11T10:00:00-03:00' : null
    }, 'fair_edition_id,exhibitor_id');
    const history = await findOne('application_history', `select=id&application_id=eq.${application.id}&note=eq.${encodeURIComponent('Inscrição demonstrativa carregada no sistema.')}`);
    if (!history) await upsert('application_history', { application_id: application.id, actor_user_id: admin.id, status: application.status, note: 'Inscrição demonstrativa carregada no sistema.', is_visible_to_exhibitor: true });
    if (index === 4) await upsert('application_exception_requests', { application_id: application.id, request_type: 'EXEMPTION', reason: 'Pedido documental para análise da equipe.', status: 'PENDING' }, 'application_id');
  }

  console.log(`Seed concluido: ${fairsData.length} feiras, ${exhibitors.length} expositores e ${exhibitors.length} inscricoes.`);
}

seed().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
