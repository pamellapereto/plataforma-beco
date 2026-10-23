const port = Number(process.env.PORT || 3333);
const minPasswordLength = Number(process.env.AUTH_MIN_PASSWORD_LENGTH || 10);

export const config = {
  environment: process.env.NODE_ENV || 'development',
  port: Number.isFinite(port) ? port : 3333,
  frontendUrl: process.env.FRONTEND_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null),
  supabase: {
    url: process.env.SUPABASE_URL || null,
    anonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || null,
    serviceRoleKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null,
    publicMediaBucket: process.env.SUPABASE_PUBLIC_MEDIA_BUCKET || 'public-media',
    curationSubmissionsBucket: process.env.SUPABASE_CURATION_SUBMISSIONS_BUCKET || 'curation-submissions'
  },
  auth: {
    exhibitorRegistrationEnabled: process.env.EXHIBITOR_REGISTRATION_ENABLED !== 'false',
    minPasswordLength: Number.isFinite(minPasswordLength) ? minPasswordLength : 10,
    termsVersion: process.env.AUTH_TERMS_VERSION || '2026-10'
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY || null,
    from: process.env.EMAIL_FROM || null,
    replyTo: process.env.EMAIL_REPLY_TO || null
  },
  upload: {
    maxBytes: Number(process.env.MEDIA_MAX_BYTES || 10 * 1024 * 1024),
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
  }
};

export function hasSupabaseConfig() {
  return Boolean(config.supabase.url && config.supabase.anonKey && config.supabase.serviceRoleKey);
}
