import { adminCreateAuthUser, adminDeleteAuthUser, supabaseRequest } from '../lib/supabase.js';
import { normalizeEmail, validatePassword } from '../modules/auth/auth.validation.js';

function required(name, value) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`Defina ${name} antes de executar o bootstrap.`);
  return normalized;
}

async function findOrCreateOrganization() {
  const organizations = await supabaseRequest('rest/v1/organizations?select=id,display_name&order=created_at.asc&limit=1');
  if (organizations[0]) return organizations[0];

  const legalName = required('BOOTSTRAP_ORGANIZATION_LEGAL_NAME', process.env.BOOTSTRAP_ORGANIZATION_LEGAL_NAME);
  const displayName = required('BOOTSTRAP_ORGANIZATION_DISPLAY_NAME', process.env.BOOTSTRAP_ORGANIZATION_DISPLAY_NAME);
  const created = await supabaseRequest('rest/v1/organizations', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { legal_name: legalName, display_name: displayName }
  });
  return created[0];
}

async function bootstrap() {
  const email = normalizeEmail(required('BOOTSTRAP_ADMIN_EMAIL', process.env.BOOTSTRAP_ADMIN_EMAIL));
  const password = required('BOOTSTRAP_ADMIN_PASSWORD', process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const fullName = required('BOOTSTRAP_ADMIN_NAME', process.env.BOOTSTRAP_ADMIN_NAME);
  validatePassword(password);

  const existing = await supabaseRequest(
    `rest/v1/app_users?select=id,email&email=eq.${encodeURIComponent(email)}&limit=1`
  );
  if (existing.length) throw new Error('Ja existe um perfil com esse e-mail. O bootstrap nao foi executado.');

  const organization = await findOrCreateOrganization();
  const authResult = await adminCreateAuthUser({ email, password, fullName });
  const authUser = authResult.user || authResult;

  try {
    await supabaseRequest('rest/v1/app_users', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        id: authUser.id,
        organization_id: organization.id,
        role: 'BECO_ADMIN',
        full_name: fullName,
        email,
        is_active: true
      }
    });
  } catch (error) {
    await adminDeleteAuthUser(authUser.id).catch(() => undefined);
    throw error;
  }

  console.log(`Administrador inicial criado para ${email} na organizacao ${organization.display_name}.`);
}

bootstrap().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
