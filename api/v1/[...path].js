import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const json = (res, status, data) => res.status(status).json(data);
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function clients() {
  if (!url || !anonKey || !serviceKey) throw fail(503, 'SUPABASE_NOT_CONFIGURED', 'Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY na Vercel.');
  return {
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    public: createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  };
}

async function currentUser(req, admin, requiredRole) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw fail(401, 'UNAUTHORIZED', 'Entre na sua conta para continuar.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw fail(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.');
  const { data: profile } = await admin.from('accounts').select('role, exhibitor_id').eq('id', data.user.id).maybeSingle();
  if (!profile) throw fail(403, 'PROFILE_REQUIRED', 'A conta ainda não foi habilitada pela Associação.');
  if (requiredRole && profile.role !== requiredRole) throw fail(403, 'FORBIDDEN', 'Acesso não autorizado.');
  return { ...data.user, ...profile };
}

function pickApplication(body) {
  const allowed = ['name','whatsapp','email','instagram','category','authorialItems','collectionItems','collectionPeriod','motivation','previousParticipation','structure','feeAwareness','city','neighborhood','accessibility','ethnicity','gender'];
  const result = {};
  for (const key of allowed) if (body[key] !== undefined) result[key] = body[key];
  for (const key of ['authorialConfirmation','prohibitedItemsConfirmation','groupConfirmation','noResale','feePolicy','terms','publicPortfolio']) result[key] = Boolean(body[key]);
  return result;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const { admin, public: publicClient } = clients();
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const routePath = pathname.startsWith('/api/v1/')
      ? pathname.slice('/api/v1/'.length)
      : req.query?.path || [];
    const parts = (Array.isArray(routePath) ? routePath : String(routePath).split('/')).filter(Boolean);
    const [resource, id, action] = parts;
    const body = req.body || {};

    if (resource === 'health' && req.method === 'GET') {
      const { error } = await admin.from('fairs').select('id').limit(1);
      if (error) throw fail(503, 'DATABASE_NOT_READY', 'Aplique a migração supabase/migrations/001_initial_schema.sql no projeto Supabase.');
      return json(res, 200, { status: 'ok', database: 'connected' });
    }
    if (resource === 'auth' && id === 'login' && req.method === 'POST') {
      const { data, error } = await publicClient.auth.signInWithPassword({ email: body.email, password: body.password });
      if (error) throw fail(401, 'INVALID_CREDENTIALS', 'E-mail ou senha não conferem.');
      const { data: account } = await admin.from('accounts').select('role, exhibitor_id').eq('id', data.user.id).maybeSingle();
      if (!account) throw fail(403, 'PROFILE_REQUIRED', 'A conta ainda não foi habilitada pela Associação.');
      return json(res, 200, { session: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token }, account, exhibitor: account.exhibitor_id ? { id: account.exhibitor_id } : null });
    }
    if (resource === 'auth' && id === 'refresh' && req.method === 'POST') {
      const { data, error } = await publicClient.auth.refreshSession({ refresh_token: body.refreshToken });
      if (error) throw fail(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
      const { data: account } = await admin.from('accounts').select('role, exhibitor_id').eq('id', data.user.id).maybeSingle();
      return json(res, 200, { session: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token }, account, exhibitor: account?.exhibitor_id ? { id: account.exhibitor_id } : null });
    }
    if (resource === 'auth' && id === 'logout' && req.method === 'POST') {
      const user = await currentUser(req, admin);
      await admin.auth.admin.signOut(user.id);
      return res.status(204).end();
    }
    if (resource === 'fairs' && req.method === 'GET') {
      const { data, error } = await admin.from('fairs').select('id,name,slug,short_description,editions:fair_editions(id,slug,title,status,starts_at,ends_at,registration_closes_at,location:locations(city,state),media:edition_media(url,role))').eq('active', true);
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }
    if (resource === 'fair-editions' && id && req.method === 'GET') {
      const { data, error } = await admin.from('fair_editions').select('*,fair:fairs(name,slug),location:locations(*),media:edition_media(*),confirmedExhibitors:applications(status,exhibitor:exhibitors(id,display_name,city,portfolio:portfolio_items(url,is_featured)))').eq('slug', id).single();
      if (error) throw error;
      data.confirmedExhibitors = (data.confirmedExhibitors || []).filter(a => ['APPROVED','CONFIRMED'].includes(a.status)).map(a => a.exhibitor);
      return json(res, 200, { data });
    }
    if (resource === 'exhibitor-categories' && req.method === 'GET') {
      const { data, error } = await admin.from('categories').select('id,name,slug').order('name'); if (error) throw error;
      return json(res, 200, { data: data || [] });
    }
    if (resource === 'exhibitors' && req.method === 'GET' && !id) {
      const { data, error } = await admin.from('exhibitors').select('id,display_name,bio,city,state,profile_visibility,categories:exhibitor_categories(category:categories(name,slug)),portfolio:portfolio_items(id,url,alt_text,is_featured,visibility)').eq('status','APPROVED').eq('profile_visibility','PUBLIC').order('display_name');
      if (error) throw error;
      return json(res, 200, { data: (data || []).map(e => ({ ...e, categories: e.categories.map(c => c.category), portfolio: e.portfolio.filter(i => i.visibility === 'PUBLIC') })) });
    }
    if (resource === 'exhibitors' && id && req.method === 'GET') {
      const { data, error } = await admin.from('exhibitors').select('id,display_name,bio,city,state,social_links,categories:exhibitor_categories(category:categories(name,slug)),portfolio:portfolio_items(id,url,alt_text,is_featured,visibility),fairHistory:applications(status,edition:fair_editions(id,slug,title,starts_at))').eq('id', id).eq('status','APPROVED').eq('profile_visibility','PUBLIC').single();
      if (error) throw error;
      data.categories = data.categories.map(c => c.category); data.portfolio = data.portfolio.filter(i => i.visibility === 'PUBLIC'); data.fairHistory = data.fairHistory.filter(i => ['APPROVED','CONFIRMED'].includes(i.status)).map(i => i.edition);
      return json(res, 200, { data });
    }
    if (resource === 'applications' && req.method === 'POST') {
      const required = ['name','whatsapp','email','motivation','city','neighborhood'];
      if (required.some(key => !String(body[key] || '').trim()) || !body.editionId) throw fail(400, 'INVALID_APPLICATION', 'Preencha os campos obrigatórios e tente novamente.');
      let editionQuery = admin.from('fair_editions').select('id,status,registration_closes_at');
      editionQuery = /^[0-9a-f-]{36}$/i.test(String(body.editionId)) ? editionQuery.eq('id', body.editionId) : editionQuery.eq('slug', body.editionId);
      const { data: edition, error: editionError } = await editionQuery.single();
      if (editionError || edition.status !== 'REGISTRATION_OPEN' || (edition.registration_closes_at && new Date(edition.registration_closes_at) < new Date())) throw fail(409, 'REGISTRATION_CLOSED', 'As inscrições desta edição não estão abertas.');
      const fields = pickApplication(body);
      const { data: app, error } = await admin.from('applications').insert({ edition_id: edition.id, status: 'SUBMITTED', applicant_name: fields.name, email: fields.email, whatsapp: fields.whatsapp, form_data: fields }).select('id').single();
      if (error) throw error;
      const files = Array.isArray(body.files) ? body.files : [];
      for (const file of files) {
        const bytes = Buffer.from(file.data || '', 'base64');
        if (!bytes.length || bytes.length > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) continue;
        const key = `${app.id}/${crypto.randomUUID()}-${String(file.name).replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        const uploaded = await admin.storage.from('portfolio').upload(key, bytes, { contentType: file.type, upsert: false });
        if (uploaded.error) continue;
        const { data: publicUrl } = admin.storage.from('portfolio').getPublicUrl(key);
        await admin.from('application_media').insert({ application_id: app.id, storage_path: key, url: publicUrl.publicUrl, role: 'APPLICATION', review_status: 'PENDING' });
      }
      return json(res, 201, { data: { id: app.id, status: 'SUBMITTED' } });
    }
    if (resource === 'me' && id === 'applications' && req.method === 'GET') {
      const user = await currentUser(req, admin, 'EXHIBITOR');
      const { data, error } = await admin.from('applications').select('*,edition:fair_editions(title,starts_at,ends_at,fair:fairs(name))').eq('exhibitor_id', user.exhibitor_id).order('created_at',{ascending:false}); if (error) throw error;
      return json(res, 200, { data: data || [] });
    }
    if (resource === 'me' && id === 'exhibitor' && req.method === 'GET') {
      const user = await currentUser(req, admin, 'EXHIBITOR'); const { data, error } = await admin.from('exhibitors').select('*,portfolio:portfolio_items(*)').eq('id',user.exhibitor_id).single(); if (error) throw error;
      return json(res, 200, { data });
    }
    if (resource === 'me' && id === 'exhibitor' && action === 'visibility' && req.method === 'PATCH') {
      const user = await currentUser(req, admin, 'EXHIBITOR'); const { error } = await admin.from('exhibitors').update({ profile_visibility: body.visible ? 'PUBLIC' : 'PRIVATE' }).eq('id',user.exhibitor_id); if (error) throw error;
      return json(res, 200, { data: { visible: Boolean(body.visible) } });
    }
    if (resource === 'curation' && id === 'dashboard' && req.method === 'GET') {
      await currentUser(req, admin, 'BECO_ADMIN'); const { data: apps } = await admin.from('applications').select('status'); const { data: media } = await admin.from('application_media').select('review_status'); const { data: editions } = await admin.from('fair_editions').select('status');
      return json(res, 200, { data: { applicationsInReview: (apps||[]).filter(a=>['SUBMITTED','UNDER_REVIEW','PHOTO_REVIEW'].includes(a.status)).length, mediaPending:(media||[]).filter(m=>m.review_status==='PENDING').length, exceptionRequestsPending:0, registrationsOpen:(editions||[]).filter(e=>e.status==='REGISTRATION_OPEN').length } });
    }
    if (resource === 'admin' && id === 'fairs' && req.method === 'GET') {
      await currentUser(req, admin, 'BECO_ADMIN'); const { data,error }=await admin.from('fairs').select('*,editions:fair_editions(*,location:locations(*))'); if(error)throw error; return json(res,200,{data:data||[]});
    }
    if (resource === 'curation' && id === 'fair-editions' && parts[2] && parts[3] === 'applications' && req.method === 'GET') {
      await currentUser(req,admin,'BECO_ADMIN'); const {data,error}=await admin.from('applications').select('*,exhibitor:exhibitors(id,display_name,city,categories:exhibitor_categories(category:categories(name))),media:application_media(*)').eq('edition_id',parts[2]).order('created_at'); if(error)throw error; return json(res,200,{data:(data||[]).map(a=>({...a,exhibitor:a.exhibitor||{display_name:a.applicant_name,city:a.form_data?.city,categories:[]},mediaSummary:(a.media||[]).map(m=>m.review_status)}))});
    }
    if (resource === 'curation' && id === 'applications' && action && req.method === 'PATCH') {
      await currentUser(req,admin,'BECO_ADMIN'); const status=body.status; if(!['UNDER_REVIEW','APPROVED','AWAITING_UPDATE','DECLINED','CONFIRMED'].includes(status))throw fail(400,'INVALID_STATUS','Estado inválido.');
      const {data:application,error:readError}=await admin.from('applications').select('*').eq('id',action).single();if(readError)throw readError;
      let exhibitorId=application.exhibitor_id;
      if(status==='APPROVED'&&!exhibitorId){
        const f=application.form_data||{};
        const {data:exhibitor,error:createError}=await admin.from('exhibitors').insert({display_name:application.applicant_name,bio:f.authorialItems||null,city:f.city||'Sorocaba',status:'APPROVED',profile_visibility:f.publicPortfolio?'PUBLIC':'PRIVATE'}).select('id').single();if(createError)throw createError;
        exhibitorId=exhibitor.id;
        const categorySlug=({ARTES_VISUAIS:'artes-visuais',ARTESANATO:'artesanato',COSMETICOS:'cosmeticos-artesanais',LIVROS_AUTORAIS:'livros-autorais',MODA_AUTORAL:'moda-autoral',SEBO:'sebo',BRECHO:'brecho'})[f.category]||slug(f.category);
        const category=await admin.from('categories').select('id').eq('slug',categorySlug).maybeSingle();
        if(category.data)await admin.from('exhibitor_categories').insert({exhibitor_id:exhibitorId,category_id:category.data.id});
        await admin.from('applications').update({exhibitor_id:exhibitorId}).eq('id',application.id);
        const {data:media}=await admin.from('application_media').select('*').eq('application_id',application.id);
        for(const item of media||[])await admin.from('portfolio_items').insert({exhibitor_id:exhibitorId,url:item.url,alt_text:application.applicant_name,is_featured:false,visibility:'PRIVATE',review_status:'PENDING'});
      }
      const {data,error}=await admin.from('applications').update({status,curation_notes:body.notes||null,exhibitor_id:exhibitorId}).eq('id',action).select().single();if(error)throw error;return json(res,200,{data});
    }
    if (resource === 'curation' && id === 'media' && action && req.method === 'PATCH') {
      await currentUser(req,admin,'BECO_ADMIN'); const review=body.review_status;
      if(!['APPROVED','CHANGES_REQUESTED'].includes(review))throw fail(400,'INVALID_REVIEW','Decisão de imagem inválida.');
      const {data,error}=await admin.from('application_media').update({review_status:review}).eq('id',action).select('*,application:applications(exhibitor_id)').single();if(error)throw error;
      if(data.application?.exhibitor_id)await admin.from('portfolio_items').update({review_status:review,visibility:review==='APPROVED'?'PUBLIC':'PRIVATE'}).eq('exhibitor_id',data.application.exhibitor_id).eq('url',data.url);
      return json(res,200,{data:{id:data.id,review_status:review}});
    }
    throw fail(404, 'NOT_FOUND', 'Rota não encontrada.');
  } catch (error) {
    console.error('BECO API:', error.code || error.message);
    return json(res, error.status || 500, { error: { code: error.code || 'INTERNAL_ERROR', message: error.status ? error.message : 'Não foi possível concluir a solicitação.' } });
  }
}
