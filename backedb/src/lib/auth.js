import { HttpError } from './http.js';
import { authenticatedSupabaseUser, supabaseRequest } from './supabase.js';

export function bearerTokenFrom(request) {
  const authorization = request.headers.authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
}

export async function requirePrincipal(request) {
  const token = bearerTokenFrom(request);
  const authUser = await authenticatedSupabaseUser(token);
  const profiles = await supabaseRequest(`rest/v1/app_users?select=id,role,is_active,organization_id,full_name,email&id=eq.${encodeURIComponent(authUser.id)}`);
  const profile = profiles[0];
  if (!profile || !profile.is_active) throw new HttpError(403, 'ACCOUNT_DISABLED', 'Conta sem acesso à plataforma.');
  return {
    id: authUser.id,
    email: profile.email || authUser.email,
    fullName: profile.full_name,
    role: profile.role,
    organizationId: profile.organization_id,
    accessToken: token
  };
}

export function requireBecoAdmin(principal) {
  if (principal.role !== 'BECO_ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Ação restrita à equipe BECO.');
}
