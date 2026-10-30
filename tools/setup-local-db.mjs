import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL antes de executar npm run db:setup.');

const client = new pg.Client({ connectionString, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
const compatibility = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, not_after timestamptz);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text NOT NULL UNIQUE, public boolean NOT NULL DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(bucket_id, name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(regexp_replace(name, '/[^/]*$', ''), '/') $$;
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

const migrationSentinels = {
  '001_initial_schema.sql': `to_regclass('beco_legacy_20261020.applications') is not null or exists(select 1 from information_schema.columns where table_schema='public' and table_name='applications' and column_name='edition_id')`,
  '20261020183515_reference_backend_archive_legacy_and_install.sql': `to_regclass('public.app_users') is not null`,
  '20261020192904_operational_space_integrity_and_verification_reports.sql': `to_regclass('public.platform_verifications') is not null`,
  '20261020193058_validate_active_auth_sessions.sql': `to_regprocedure('public.is_active_auth_session(uuid,uuid)') is not null`,
  '20261021174539_geographic_stand_coordinates.sql': `exists(select 1 from information_schema.columns where table_schema='public' and table_name='fair_spaces' and column_name='latitude')`,
  '20261023170715_post_event_attendance_and_evaluations.sql': `to_regclass('public.event_evaluations') is not null`,
  '20261023170731_secure_attendance_audit_trigger.sql': `to_regclass('public.application_attendance') is not null and to_regprocedure('public.audit_application_attendance()') is not null`,
  '20261030120000_homepage_content.sql': `to_regclass('public.homepage_content') is not null`,
  '20261030130000_about_content.sql': `to_regclass('public.about_content') is not null`
};

function checksum(source) {
  return createHash('sha256').update(source).digest('hex');
}

await client.connect();
try {
  await client.query(compatibility);
  await client.query(`select pg_advisory_lock(hashtext('plataforma-beco:db-setup'))`);
  const directory = resolve('supabase/migrations');
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  const sources = new Map(await Promise.all(files.map(async file => [file, await readFile(resolve(directory, file), 'utf8')])));
  const recorded = await client.query('select filename,checksum from public.schema_migrations');
  const applied = new Map(recorded.rows.map(row => [row.filename, row.checksum]));

  // Versões anteriores do setup não registravam histórico. Reconheça objetos finais
  // para não reaplicar a migration legada sobre um banco já atualizado.
  if (!applied.size) {
    for (const file of files) {
      const sentinel = migrationSentinels[file];
      if (!sentinel) continue;
      const result = await client.query(`select (${sentinel}) as applied`);
      if (!result.rows[0]?.applied) continue;
      const digest = checksum(sources.get(file));
      await client.query('insert into public.schema_migrations(filename,checksum) values($1,$2) on conflict(filename) do nothing', [file, digest]);
      applied.set(file, digest);
      console.log(`Reconhecida migration já aplicada: ${file}`);
    }
  }

  for (const file of files) {
    const source = sources.get(file);
    const digest = checksum(source);
    if (applied.has(file)) {
      if (applied.get(file) !== digest) throw new Error(`A migration já aplicada ${file} foi alterada. Crie uma nova migration em vez de editar o histórico.`);
      console.log(`Ignorando ${file} (já aplicada).`);
      continue;
    }
    process.stdout.write(`Aplicando ${file}... `);
    await client.query('begin');
    try {
      await client.query(source);
      await client.query('insert into public.schema_migrations(filename,checksum) values($1,$2)', [file,digest]);
      await client.query('commit');
      console.log('ok');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
  console.log('PostgreSQL local preparado com sucesso.');
} finally {
  await client.query(`select pg_advisory_unlock(hashtext('plataforma-beco:db-setup'))`).catch(() => undefined);
  await client.end();
}
