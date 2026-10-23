import { config } from '../../config.js';
import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { EmailService } from '../../lib/email.js';
import { supabaseGateway } from '../../lib/supabase.js';
import {
  validateAdminAccount,
  validateAccountStatus,
  validateExhibitorRegistration,
  validateExhibitorStatus,
  validateLogin,
  validatePasswordUpdate,
  validateRecovery,
  validateRefresh
} from './auth.validation.js';

function normalizeSession(payload) {
  const source = payload?.session || payload;
  if (!source?.access_token) return null;
  return {
    accessToken: source.access_token,
    refreshToken: source.refresh_token,
    expiresIn: source.expires_in,
    expiresAt: source.expires_at,
    tokenType: source.token_type || 'bearer'
  };
}

function authUserFrom(payload) {
  return payload?.user || payload;
}

export class AuthService {
  constructor(gateway = supabaseGateway, emailService = new EmailService()) {
    this.gateway = gateway;
    this.email = emailService;
  }

  async accountForUser(userId) {
    const rows = await this.gateway.request(`rest/v1/app_users?select=id,email,full_name,role,is_active,organization_id&id=eq.${encodeURIComponent(userId)}`);
    const account = rows[0];
    if (!account || !account.is_active) throw new HttpError(403, 'ACCOUNT_DISABLED', 'Conta sem acesso à plataforma.');
    let exhibitor = null;
    if (account.role === 'EXHIBITOR') {
      const exhibitors = await this.gateway.request(`rest/v1/exhibitors?select=id,display_name,contact_name,phone,instagram_url,social_links,city,state,profile_visibility,status&user_id=eq.${encodeURIComponent(userId)}`);
      exhibitor = exhibitors[0] || null;
      if (!exhibitor) throw new HttpError(409, 'INCOMPLETE_ACCOUNT', 'O perfil de expositor não foi concluído.');
    }
    return { account, exhibitor, canApplyToFairs: account.role === 'EXHIBITOR' && exhibitor?.status !== 'SUSPENDED' };
  }

  async registerExhibitor(input) {
    if (!config.auth.exhibitorRegistrationEnabled) throw new HttpError(403, 'REGISTRATION_CLOSED', 'O cadastro de expositores está temporariamente fechado.');
    const data = validateExhibitorRegistration(input);
    const authResult = await this.gateway.signUpWithPassword(data);
    const authUser = authUserFrom(authResult);
    const identities = authUser?.identities;
    if (!authUser?.id || (Array.isArray(identities) && identities.length === 0)) {
      throw new HttpError(409, 'ACCOUNT_ALREADY_EXISTS', 'Já existe uma conta com este e-mail.');
    }

    try {
      await this.gateway.request('rest/v1/app_users', {
        method: 'POST',
        body: {
          id: authUser.id,
          email: data.email,
          full_name: data.fullName,
          role: 'EXHIBITOR',
          is_active: true,
          terms_accepted_at: new Date().toISOString(),
          terms_version: config.auth.termsVersion
        }
      });
      const profiles = await this.gateway.request('rest/v1/exhibitors', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: {
          user_id: authUser.id,
          display_name: data.displayName,
          contact_name: data.fullName,
          phone: data.phone,
          instagram_url: data.instagramUrl,
          social_links: data.instagramUrl ? { instagram: data.instagramUrl } : {},
          city: data.city,
          state: data.state,
          profile_visibility: data.profileVisibility,
          status: 'PENDING'
        }
      });
      return {
        account: { id: authUser.id, email: data.email, fullName: data.fullName, role: 'EXHIBITOR' },
        exhibitor: profiles[0],
        status: 'PENDING',
        canApplyToFairs: true,
        emailConfirmationRequired: !normalizeSession(authResult),
        session: normalizeSession(authResult)
      };
    } catch (error) {
      await this.gateway.adminDeleteAuthUser(authUser.id).catch(() => {});
      throw error;
    }
  }

  async login(input) {
    const credentials = validateLogin(input);
    const authResult = await this.gateway.signInWithPassword(credentials);
    const authUser = authUserFrom(authResult);
    const profile = await this.accountForUser(authUser.id);
    return { ...profile, session: normalizeSession(authResult) };
  }

  async refresh(input) {
    const { refreshToken } = validateRefresh(input);
    const authResult = await this.gateway.refreshAuthSession(refreshToken);
    const authUser = authUserFrom(authResult);
    const profile = await this.accountForUser(authUser.id);
    return { ...profile, session: normalizeSession(authResult) };
  }

  async logout(accessToken) {
    if (!accessToken) throw new HttpError(401, 'UNAUTHENTICATED', 'Token de acesso ausente.');
    await this.gateway.signOutAuthSession(accessToken);
  }

  async requestPasswordRecovery(input) {
    const { email } = validateRecovery(input);
    const redirectTo = config.frontendUrl ? `${config.frontendUrl.replace(/\/$/, '')}/redefinir-senha.html` : undefined;
    await this.gateway.requestPasswordRecovery(email, redirectTo);
    return { requested: true };
  }

  async updatePassword(input, accessToken) {
    if (!accessToken) throw new HttpError(401, 'UNAUTHENTICATED', 'Token de recuperação ausente.');
    const { password } = validatePasswordUpdate(input);
    await this.gateway.authenticatedSupabaseUser(accessToken);
    await this.gateway.updateAuthPassword(accessToken, password);
    return { updated: true };
  }

  async me(principal) {
    return this.accountForUser(principal.id);
  }

  async createAdmin(input, principal) {
    requireBecoAdmin(principal);
    const data = validateAdminAccount(input);
    const authResult = await this.gateway.adminCreateAuthUser(data);
    const authUser = authUserFrom(authResult);
    if (!authUser?.id) throw new HttpError(502, 'AUTH_USER_NOT_CREATED', 'Não foi possível criar a conta administrativa.');
    try {
      const accounts = await this.gateway.request('rest/v1/app_users', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: {
          id: authUser.id,
          organization_id: principal.organizationId,
          email: data.email,
          full_name: data.fullName,
          role: 'BECO_ADMIN',
          is_active: true
        }
      });
      return accounts[0];
    } catch (error) {
      await this.gateway.adminDeleteAuthUser(authUser.id).catch(() => {});
      throw error;
    }
  }

  async listAdmins(principal) {
    requireBecoAdmin(principal);
    return this.gateway.request(`rest/v1/app_users?select=id,email,full_name,is_active,created_at,updated_at&organization_id=eq.${principal.organizationId}&role=eq.BECO_ADMIN&order=full_name.asc`);
  }

  async updateAdminStatus(accountId, input, principal) {
    requireBecoAdmin(principal);
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) throw new HttpError(422, 'INVALID_ACCOUNT', 'Conta administrativa inválida.');
    const isActive = validateAccountStatus(input);
    if (accountId === principal.id && !isActive) throw new HttpError(409, 'SELF_DEACTIVATION', 'Você não pode desativar a própria conta.');
    const rows = await this.gateway.request(`rest/v1/app_users?id=eq.${accountId}&organization_id=eq.${principal.organizationId}&role=eq.BECO_ADMIN`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { is_active: isActive, updated_at: new Date().toISOString() }
    });
    if (!rows[0]) throw new HttpError(404, 'ADMIN_NOT_FOUND', 'Conta administrativa não encontrada.');
    return rows[0];
  }

  async listExhibitors(principal, status) {
    requireBecoAdmin(principal);
    const normalizedStatus = status ? validateExhibitorStatus({ status }) : null;
    const filter = normalizedStatus ? `&status=eq.${normalizedStatus}` : '';
    return this.gateway.request(`rest/v1/exhibitors?select=id,user_id,display_name,contact_name,phone,city,state,profile_visibility,status,created_at${filter}&order=created_at.desc`);
  }

  async updateExhibitorStatus(exhibitorId, input, principal) {
    requireBecoAdmin(principal);
    const status = validateExhibitorStatus(input);
    const rows = await this.gateway.request(`rest/v1/exhibitors?id=eq.${encodeURIComponent(exhibitorId)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { status, updated_at: new Date().toISOString() }
    });
    if (!rows[0]) throw new HttpError(404, 'EXHIBITOR_NOT_FOUND', 'Expositor não encontrado.');
    const users = await this.gateway.request(`rest/v1/app_users?select=email&id=eq.${rows[0].user_id}&limit=1`);
    const messages = {
      APPROVED: ['Cadastro aprovado', 'Seu cadastro de expositor foi aprovado. Você já pode se inscrever nas feiras com inscrições abertas.'],
      PENDING: ['Cadastro em análise', 'Seu cadastro voltou para análise da equipe da Associação.'],
      SUSPENDED: ['Acesso do expositor suspenso', 'Seu cadastro de expositor foi suspenso. Entre em contato com a equipe para mais informações.']
    };
    const [title, message] = messages[status];
    await this.email.send({ to: users[0]?.email, subject: title, title, message }).catch(() => ({ sent: false }));
    return rows[0];
  }
}
