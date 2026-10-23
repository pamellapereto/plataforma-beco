import { config, hasSupabaseConfig } from '../config.js';
import { HttpError } from './http.js';

function assertConfigured() {
  if (!hasSupabaseConfig()) {
    throw new HttpError(503, 'SUPABASE_NOT_CONFIGURED', 'Supabase ainda não foi configurado na API.');
  }
}

function supabaseUrl(path) {
  return new URL(path, `${config.supabase.url.replace(/\/$/, '')}/`).toString();
}

async function readPayload(response) {
  return response.json().catch(() => null);
}

function throwSupabaseError(response, payload) {
  const message = payload?.msg || payload?.message || payload?.error_description || 'Falha ao comunicar com o Supabase.';
  const authCode = payload?.error_code || payload?.code;
  if (['bad_jwt','invalid_jwt','session_not_found','session_expired','refresh_token_not_found','refresh_token_already_used','user_not_found'].includes(authCode) || /session.*not.*found|jwt.*expired|invalid.*jwt/i.test(message)) throw new HttpError(401, 'INVALID_SESSION', 'Sua sessão expirou. Entre novamente.');
  if (response.status === 429) throw new HttpError(429, 'AUTH_RATE_LIMIT', 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
  if (authCode === 'email_address_not_authorized' || /sending emails.*not authorized|email.*not authorized/i.test(message)) throw new HttpError(503, 'EMAIL_DELIVERY_NOT_CONFIGURED', 'O envio de confirmação está indisponível. Entre em contato com a equipe da Associação.');
  const businessErrors = {
    APPLICATION_NOT_FOUND: [404, 'APPLICATION_NOT_FOUND', 'Inscrição não encontrada.'],
    SPACE_NOT_FOUND: [404, 'SPACE_NOT_FOUND', 'Espaço não encontrado.'],
    SPACE_NOT_ASSIGNED: [409, 'SPACE_NOT_ASSIGNED', 'A inscrição não possui espaço atribuído.'],
    SPACE_UNAVAILABLE: [409, 'SPACE_UNAVAILABLE', 'Este espaço já está ocupado.'],
    APPLICATION_NOT_APPROVED: [409, 'APPLICATION_NOT_APPROVED', 'A inscrição precisa estar aprovada antes da atribuição do espaço.']
  };
  const known = Object.entries(businessErrors).find(([key]) => message.includes(key));
  if (known) throw new HttpError(...known[1]);
  if (authCode === 'invalid_credentials') {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha invalidos.');
  }
  if (authCode === 'email_not_confirmed') {
    throw new HttpError(403, 'EMAIL_NOT_CONFIRMED', 'Confirme o e-mail antes de entrar.');
  }
  if (authCode === 'email_exists' || authCode === 'user_already_exists') {
    throw new HttpError(409, 'ACCOUNT_ALREADY_EXISTS', 'Ja existe uma conta com este e-mail.');
  }
  if (response.status === 400) throw new HttpError(400, payload?.code || 'SUPABASE_BAD_REQUEST', message);
  if (response.status === 401) throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  if (response.status === 403) throw new HttpError(403, 'SUPABASE_FORBIDDEN', message);
  if (response.status === 404) throw new HttpError(404, 'SUPABASE_NOT_FOUND', message);
  if (response.status === 409 || payload?.code === '23505') throw new HttpError(409, 'RESOURCE_CONFLICT', 'Já existe um registro com esses dados.');
  if (payload?.code === '23503') throw new HttpError(409, 'RELATED_RESOURCE_CONFLICT', 'O registro está vinculado a outro dado do sistema.');
  if (payload?.code === 'P0002') throw new HttpError(404, 'RESOURCE_NOT_FOUND', message);
  if (response.status === 422) throw new HttpError(422, payload?.code || 'AUTH_VALIDATION_ERROR', message);
  throw new HttpError(502, 'SUPABASE_REQUEST_FAILED', message);
}

async function authRequest(path, { method = 'POST', body, accessToken, admin = false, headers = {} } = {}) {
  assertConfigured();
  const apiKey = admin ? config.supabase.serviceRoleKey : config.supabase.anonKey;
  const response = await fetch(supabaseUrl(path), {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken || apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await readPayload(response);
  if (!response.ok) throwSupabaseError(response, payload);
  return payload;
}

export async function supabaseRequest(path, { method = 'GET', body, headers = {}, useServiceRole = true } = {}) {
  assertConfigured();
  const key = useServiceRole ? config.supabase.serviceRoleKey : config.supabase.anonKey;
  const response = await fetch(supabaseUrl(path), {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await readPayload(response);
  if (!response.ok) throwSupabaseError(response, payload);
  return payload;
}

export function signUpWithPassword({ email, password, fullName }) {
  const redirectTo = config.frontendUrl ? `${config.frontendUrl.replace(/\/$/, '')}/login.html` : null;
  return authRequest(`auth/v1/signup${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`, {
    body: { email, password, data: { full_name: fullName } }
  });
}

export function signInWithPassword({ email, password }) {
  return authRequest('auth/v1/token?grant_type=password', { body: { email, password } });
}

export function refreshAuthSession(refreshToken) {
  return authRequest('auth/v1/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } });
}

export function signOutAuthSession(accessToken) {
  return authRequest('auth/v1/logout', { accessToken, body: {} });
}

export function requestPasswordRecovery(email, redirectTo) {
  return authRequest(`auth/v1/recover${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`, { body: { email } });
}

export function updateAuthPassword(accessToken, password) {
  return authRequest('auth/v1/user', { method: 'PUT', accessToken, body: { password } });
}

export function adminCreateAuthUser({ email, password, fullName }) {
  return authRequest('auth/v1/admin/users', {
    admin: true,
    body: { email, password, email_confirm: true, user_metadata: { full_name: fullName } }
  });
}

export function adminDeleteAuthUser(userId) {
  return authRequest(`auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE', admin: true });
}

export async function authenticatedSupabaseUser(accessToken) {
  assertConfigured();
  if (!accessToken) throw new HttpError(401, 'UNAUTHENTICATED', 'Token de acesso ausente.');
  const user = await authRequest('auth/v1/user', { method: 'GET', accessToken });
  let sessionId;
  try { sessionId = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).session_id; } catch { throw new HttpError(401, 'INVALID_SESSION', 'Sessão inválida. Entre novamente.'); }
  if (!sessionId || !await supabaseRequest('rest/v1/rpc/is_active_auth_session', { method: 'POST', body: { p_session_id: sessionId, p_user_id: user.id } })) throw new HttpError(401, 'SESSION_REVOKED', 'Sua sessão foi encerrada. Entre novamente.');
  return user;
}

export function storageUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = config.supabase.url.replace(/\/$/, '');
  return `${base}${String(path).startsWith('/storage/v1/') ? '' : '/storage/v1'}${path}`;
}

export async function createSignedUploadUrl(bucket, objectPath) {
  const signed = await supabaseRequest(`storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', body: { upsert: false }
  });
  return { ...signed, url: storageUrl(signed.url) };
}

export async function createSignedReadUrl(bucket, objectPath, expiresIn = 900) {
  const signed = await supabaseRequest(`storage/v1/object/sign/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', body: { expiresIn }
  });
  return { ...signed, signedURL: storageUrl(signed.signedURL || signed.url) };
}

export async function deleteStorageObjects(bucket, objectPaths) {
  if (!Array.isArray(objectPaths) || !objectPaths.length) return [];
  return supabaseRequest(`storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE', body: { prefixes: objectPaths }
  });
}

export const supabaseGateway = Object.freeze({
  signUpWithPassword,
  signInWithPassword,
  refreshAuthSession,
  signOutAuthSession,
  requestPasswordRecovery,
  updateAuthPassword,
  adminCreateAuthUser,
  adminDeleteAuthUser,
  authenticatedSupabaseUser,
  createSignedUploadUrl,
  createSignedReadUrl,
  deleteStorageObjects,
  request: supabaseRequest
});
