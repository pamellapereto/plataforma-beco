CREATE SCHEMA beco_legacy_20261020;
REVOKE ALL ON SCHEMA beco_legacy_20261020 FROM PUBLIC, anon, authenticated;
ALTER TABLE public.fairs SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.locations SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.fair_editions SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.edition_media SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.categories SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.exhibitors SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.accounts SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.exhibitor_categories SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.applications SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.portfolio_items SET SCHEMA beco_legacy_20261020;
ALTER TABLE public.application_media SET SCHEMA beco_legacy_20261020;
SET LOCAL search_path = public, extensions;
-- Plataforma BECO - modelo simplificado
-- PostgreSQL 15+ / Supabase Auth + Storage
-- 24 tabelas. Sem pagamentos, preços, taxas, PIX ou vendas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE platform_user_role AS ENUM ('BECO_ADMIN', 'EXHIBITOR');
CREATE TYPE exhibitor_status AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');
CREATE TYPE profile_visibility AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE fair_edition_status AS ENUM ('DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'CURATION', 'CONFIRMED', 'FINISHED', 'CANCELLED');
CREATE TYPE application_status AS ENUM ('DRAFT', 'SUBMITTED', 'PHOTO_REVIEW', 'UNDER_REVIEW', 'AWAITING_UPDATE', 'WAITLISTED', 'APPROVED', 'CONFIRMED', 'DECLINED', 'CANCELLED');
CREATE TYPE media_visibility AS ENUM ('PRIVATE', 'PUBLIC');
CREATE TYPE media_review_status AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');
CREATE TYPE form_field_type AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'URL', 'SELECT', 'MULTISELECT', 'RADIO', 'CHECKBOX', 'DATE', 'FILE', 'IMAGE');
CREATE TYPE exception_request_status AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');
CREATE TYPE fair_media_role AS ENUM ('COVER', 'GALLERY', 'PROMOTION', 'BADGE_TEMPLATE', 'MAP');

-- 1. A Associação é uma única organização no sistema.
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name VARCHAR(220) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  website_url TEXT,
  email VARCHAR(255),
  phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Espelho da conta do Supabase Auth. Não armazena senha.
CREATE TABLE app_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role platform_user_role NOT NULL,
  full_name VARCHAR(180),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  terms_accepted_at TIMESTAMPTZ,
  terms_version VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((role = 'BECO_ADMIN' AND organization_id IS NOT NULL) OR role = 'EXHIBITOR')
);

-- 3. Dados públicos/privados do expositor.
CREATE TABLE exhibitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  display_name VARCHAR(180) NOT NULL,
  contact_name VARCHAR(180) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  instagram_url TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(social_links) = 'object'),
  bio TEXT,
  city VARCHAR(120),
  state CHAR(2),
  profile_visibility profile_visibility NOT NULL DEFAULT 'PRIVATE',
  status exhibitor_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4-5. Categorias próprias de expositores e ligação N:N.
CREATE TABLE exhibitor_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE exhibitor_category_links (
  exhibitor_id UUID NOT NULL REFERENCES exhibitors(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES exhibitor_categories(id),
  PRIMARY KEY (exhibitor_id, category_id)
);

-- 6-8. Feira é a identidade recorrente; edição é o evento em uma data específica.
CREATE TABLE fairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(180) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fair_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES fair_categories(id),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (parent_id, name)
);

CREATE TABLE fair_category_links (
  fair_id UUID NOT NULL REFERENCES fairs(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES fair_categories(id),
  PRIMARY KEY (fair_id, category_id)
);

-- 9. Localização normalizada para reaproveitar endereços e Maps.
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180),
  address_line VARCHAR(255) NOT NULL,
  complement VARCHAR(120),
  neighborhood VARCHAR(120),
  city VARCHAR(120) NOT NULL,
  state CHAR(2) NOT NULL,
  postal_code VARCHAR(12),
  maps_url TEXT,
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6)
);

-- 10. Cada edição tem agenda, prazo, capacidade e página pública próprios.
CREATE TABLE fair_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fair_id UUID NOT NULL REFERENCES fairs(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id),
  created_by_user_id UUID NOT NULL REFERENCES app_users(id),
  title VARCHAR(220) NOT NULL,
  slug VARCHAR(240) NOT NULL UNIQUE,
  edition_number SMALLINT,
  public_description TEXT NOT NULL,
  visitor_guidance TEXT,
  exhibitor_guidance TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  exhibitor_capacity SMALLINT NOT NULL CHECK (exhibitor_capacity > 0),
  status fair_edition_status NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  CHECK (registration_closes_at IS NULL OR registration_opens_at IS NULL OR registration_closes_at > registration_opens_at)
);

-- 11-14. Formulário customizável por edição.
CREATE TABLE registration_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fair_edition_id UUID NOT NULL REFERENCES fair_editions(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  introduction TEXT,
  required_consents JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_consents) = 'array'),
  version SMALLINT NOT NULL DEFAULT 1 CHECK (version > 0),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID NOT NULL REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fair_edition_id),
  UNIQUE (id, fair_edition_id)
);

CREATE TABLE registration_form_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES registration_forms(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  position SMALLINT NOT NULL CHECK (position >= 0),
  UNIQUE (form_id, position)
);

CREATE TABLE registration_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES registration_form_sections(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  help_text TEXT,
  type form_field_type NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  is_private BOOLEAN NOT NULL DEFAULT TRUE,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditional_logic JSONB NOT NULL DEFAULT '{}'::jsonb,
  position SMALLINT NOT NULL CHECK (position >= 0),
  UNIQUE (section_id, field_key),
  UNIQUE (section_id, position)
);

CREATE TABLE registration_form_field_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES registration_form_fields(id) ON DELETE CASCADE,
  value VARCHAR(160) NOT NULL,
  label VARCHAR(180) NOT NULL,
  position SMALLINT NOT NULL CHECK (position >= 0),
  UNIQUE (field_id, value),
  UNIQUE (field_id, position)
);

-- 15-19. Inscrição, respostas, termos, pedido especial e um histórico único de curadoria.
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fair_edition_id UUID NOT NULL REFERENCES fair_editions(id) ON DELETE CASCADE,
  exhibitor_id UUID NOT NULL REFERENCES exhibitors(id) ON DELETE CASCADE,
  registration_form_id UUID NOT NULL,
  status application_status NOT NULL DEFAULT 'DRAFT',
  requested_space_type VARCHAR(40),
  submitted_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  curator_decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fair_edition_id, exhibitor_id),
  FOREIGN KEY (registration_form_id, fair_edition_id)
    REFERENCES registration_forms (id, fair_edition_id)
);

CREATE TABLE application_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES registration_form_fields(id),
  value_json JSONB NOT NULL DEFAULT 'null'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, field_id)
);

CREATE TABLE application_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  consent_key VARCHAR(100) NOT NULL,
  consent_text TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, consent_key)
);

-- Documental apenas: não há valor, taxa ou cobrança no sistema.
CREATE TABLE application_exception_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  request_type VARCHAR(80) NOT NULL DEFAULT 'EXEMPTION',
  reason TEXT NOT NULL,
  status exception_request_status NOT NULL DEFAULT 'PENDING',
  decided_by_user_id UUID REFERENCES app_users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE application_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES app_users(id),
  status application_status,
  note TEXT,
  media_asset_id UUID,
  is_visible_to_exhibitor BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20-23. Binários ficam no Supabase Storage; banco guarda referência e vínculos claros.
CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  owner_exhibitor_id UUID REFERENCES exhibitors(id) ON DELETE SET NULL,
  storage_bucket TEXT NOT NULL CHECK (storage_bucket IN ('public-media', 'curation-submissions')),
  object_path TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  alt_text VARCHAR(255),
  visibility media_visibility NOT NULL DEFAULT 'PRIVATE',
  review_status media_review_status NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  curator_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (storage_bucket, object_path),
  CHECK ((visibility = 'PUBLIC' AND storage_bucket = 'public-media' AND review_status = 'APPROVED') OR visibility = 'PRIVATE')
);

CREATE TABLE application_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
  field_id UUID REFERENCES registration_form_fields(id) ON DELETE SET NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'PORTFOLIO',
  position SMALLINT NOT NULL DEFAULT 0 CHECK (position >= 0),
  UNIQUE (application_id, role, position)
);

CREATE TABLE exhibitor_portfolio_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exhibitor_id UUID NOT NULL REFERENCES exhibitors(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (exhibitor_id, position)
);

-- MAP é apenas um papel de mídia da edição: elimina uma tabela exclusiva de mapa.
CREATE TABLE fair_edition_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fair_edition_id UUID NOT NULL REFERENCES fair_editions(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
  role fair_media_role NOT NULL,
  position SMALLINT NOT NULL DEFAULT 0 CHECK (position >= 0),
  UNIQUE (fair_edition_id, role, position)
);

-- 24. Espaços pertencem à edição. A atribuição fica na inscrição, não exige tabela extra.
CREATE TABLE fair_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fair_edition_id UUID NOT NULL REFERENCES fair_editions(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  label VARCHAR(100),
  width_m NUMERIC(5, 2) NOT NULL CHECK (width_m > 0),
  height_m NUMERIC(5, 2) NOT NULL CHECK (height_m > 0),
  x_coordinate NUMERIC(9, 3),
  y_coordinate NUMERIC(9, 3),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (fair_edition_id, code)
);

ALTER TABLE applications
  ADD COLUMN assigned_space_id UUID UNIQUE REFERENCES fair_spaces(id) ON DELETE SET NULL,
  ADD COLUMN space_assigned_by_user_id UUID REFERENCES app_users(id),
  ADD COLUMN space_assigned_at TIMESTAMPTZ;

ALTER TABLE application_history
  ADD CONSTRAINT application_history_media_asset_fk
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE;

CREATE INDEX fair_editions_status_dates_idx ON fair_editions (status, starts_at);
CREATE INDEX applications_edition_status_idx ON applications (fair_edition_id, status);
CREATE INDEX applications_exhibitor_status_idx ON applications (exhibitor_id, status);
CREATE INDEX media_assets_owner_review_idx ON media_assets (owner_exhibitor_id, review_status);
CREATE INDEX application_history_application_idx ON application_history (application_id, created_at DESC);

-- Execute após database/schema.sql no SQL Editor do Supabase.
-- Arquivos ficam no Storage; esta migration protege os dois buckets por RLS.

CREATE OR REPLACE FUNCTION public.is_beco_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE id = auth.uid()
      AND role = 'BECO_ADMIN'
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.current_exhibitor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.exhibitors
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('public-media', 'public-media', TRUE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('curation-submissions', 'curation-submissions', FALSE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura da galeria e das páginas públicas.
DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
CREATE POLICY "public_media_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'public-media');

-- Somente equipe BECO altera mídia que já é pública.
DROP POLICY IF EXISTS "beco_admin_public_media_manage" ON storage.objects;
CREATE POLICY "beco_admin_public_media_manage"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'public-media' AND public.is_beco_admin())
WITH CHECK (bucket_id = 'public-media' AND public.is_beco_admin());

-- O expositor pode enviar apenas para a própria pasta.
-- Caminho obrigatório: exhibitors/<exhibitor_uuid>/applications/<application_uuid>/<arquivo>.
DROP POLICY IF EXISTS "exhibitor_uploads_own_submission" ON storage.objects;
CREATE POLICY "exhibitor_uploads_own_submission"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'curation-submissions'
  AND (storage.foldername(name))[1] = 'exhibitors'
  AND (storage.foldername(name))[2] = public.current_exhibitor_id()::text
);

DROP POLICY IF EXISTS "exhibitor_reads_own_submission" ON storage.objects;
CREATE POLICY "exhibitor_reads_own_submission"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'curation-submissions'
  AND (storage.foldername(name))[1] = 'exhibitors'
  AND (storage.foldername(name))[2] = public.current_exhibitor_id()::text
);

DROP POLICY IF EXISTS "exhibitor_deletes_own_submission" ON storage.objects;
CREATE POLICY "exhibitor_deletes_own_submission"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'curation-submissions'
  AND (storage.foldername(name))[1] = 'exhibitors'
  AND (storage.foldername(name))[2] = public.current_exhibitor_id()::text
);

-- A curadoria visualiza, orienta, aprova e copia os arquivos para o bucket público.
DROP POLICY IF EXISTS "beco_admin_curation_manage" ON storage.objects;
CREATE POLICY "beco_admin_curation_manage"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'curation-submissions' AND public.is_beco_admin())
WITH CHECK (bucket_id = 'curation-submissions' AND public.is_beco_admin());

-- RLS das tabelas fica fechado para o visitante. A API autenticada é responsável por aplicar
-- as regras de propriedade de perfil, inscrição, respostas e dados sensíveis.
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exhibitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

-- Campos de auditoria do aceite realizado no cadastro de expositor.
-- Execute somente se schema.sql ja tiver sido aplicado antes desta alteracao.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR(40);

-- Segurança padrão: todas as tabelas de negócio são privadas para anon/authenticated.
-- O navegador usa Supabase Auth e chama a API; somente a API usa service_role.
-- Execute depois de schema.sql e 001_supabase_storage.sql.

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exhibitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exhibitor_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exhibitor_category_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fair_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fair_category_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fair_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_form_field_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_exception_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exhibitor_portfolio_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fair_edition_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fair_spaces ENABLE ROW LEVEL SECURITY;

-- Sem grants, RLS nem chega a ser avaliado. O acesso público será servido pela API.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- Mantém futuras tabelas privadas quando criadas pelo papel postgres no SQL Editor.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- As políticas do Storage chamam estas funções como authenticated.
REVOKE ALL ON FUNCTION public.is_beco_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_exhibitor_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_beco_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_exhibitor_id() TO authenticated, service_role;

-- Substitui integralmente o formulário de uma edição dentro de uma única transação.
-- A função é acessível somente pela API com service_role.

CREATE OR REPLACE FUNCTION public.replace_registration_form(
  p_fair_edition_id UUID,
  p_created_by_user_id UUID,
  p_definition JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form_id UUID;
  v_section_id UUID;
  v_field_id UUID;
  v_section JSONB;
  v_field JSONB;
  v_option JSONB;
  v_section_position INTEGER;
  v_field_position INTEGER;
  v_option_position INTEGER;
BEGIN
  SELECT id INTO v_form_id
  FROM registration_forms
  WHERE fair_edition_id = p_fair_edition_id;

  IF v_form_id IS NULL THEN
    INSERT INTO registration_forms (
      fair_edition_id, title, introduction, required_consents, version, is_published, created_by_user_id
    ) VALUES (
      p_fair_edition_id,
      p_definition->>'title',
      NULLIF(p_definition->>'introduction', ''),
      COALESCE(p_definition->'consents', '[]'::JSONB),
      1,
      COALESCE((p_definition->>'isPublished')::BOOLEAN, FALSE),
      p_created_by_user_id
    ) RETURNING id INTO v_form_id;
  ELSE
    UPDATE registration_forms
    SET title = p_definition->>'title',
        introduction = NULLIF(p_definition->>'introduction', ''),
        required_consents = COALESCE(p_definition->'consents', '[]'::JSONB),
        version = version + 1,
        is_published = COALESCE((p_definition->>'isPublished')::BOOLEAN, FALSE),
        updated_at = NOW()
    WHERE id = v_form_id;

    DELETE FROM registration_form_sections WHERE form_id = v_form_id;
  END IF;

  FOR v_section, v_section_position IN
    SELECT value, ordinality - 1
    FROM jsonb_array_elements(p_definition->'sections') WITH ORDINALITY
  LOOP
    INSERT INTO registration_form_sections (form_id, title, description, position)
    VALUES (v_form_id, v_section->>'title', NULLIF(v_section->>'description', ''), v_section_position)
    RETURNING id INTO v_section_id;

    FOR v_field, v_field_position IN
      SELECT value, ordinality - 1
      FROM jsonb_array_elements(v_section->'fields') WITH ORDINALITY
    LOOP
      INSERT INTO registration_form_fields (
        section_id, field_key, label, help_text, type, is_required,
        is_sensitive, is_private, validation, conditional_logic, position
      ) VALUES (
        v_section_id,
        v_field->>'fieldKey',
        v_field->>'label',
        NULLIF(v_field->>'helpText', ''),
        (v_field->>'type')::form_field_type,
        COALESCE((v_field->>'isRequired')::BOOLEAN, FALSE),
        COALESCE((v_field->>'isSensitive')::BOOLEAN, FALSE),
        COALESCE((v_field->>'isPrivate')::BOOLEAN, TRUE),
        COALESCE(v_field->'validation', '{}'::JSONB),
        COALESCE(v_field->'conditionalLogic', '{}'::JSONB),
        v_field_position
      ) RETURNING id INTO v_field_id;

      FOR v_option, v_option_position IN
        SELECT value, ordinality - 1
        FROM jsonb_array_elements(COALESCE(v_field->'options', '[]'::JSONB)) WITH ORDINALITY
      LOOP
        INSERT INTO registration_form_field_options (field_id, value, label, position)
        VALUES (v_field_id, v_option->>'value', v_option->>'label', v_option_position);
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_form_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_registration_form(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_registration_form(UUID, UUID, JSONB) TO service_role;

-- Atribui um espaço e libera a posição anterior de forma atômica.

CREATE OR REPLACE FUNCTION public.assign_application_space(
  p_application_id UUID,
  p_space_id UUID,
  p_actor_user_id UUID
)
RETURNS SETOF public.applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application applications%ROWTYPE;
  v_space fair_spaces%ROWTYPE;
BEGIN
  SELECT * INTO v_application FROM applications WHERE id = p_application_id FOR UPDATE;
  IF v_application.id IS NULL THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND'; END IF;
  IF v_application.status NOT IN ('APPROVED', 'CONFIRMED') THEN RAISE EXCEPTION 'APPLICATION_NOT_APPROVED'; END IF;

  SELECT * INTO v_space FROM fair_spaces WHERE id = p_space_id FOR UPDATE;
  IF v_space.id IS NULL OR v_space.fair_edition_id <> v_application.fair_edition_id THEN RAISE EXCEPTION 'SPACE_NOT_FOUND'; END IF;
  IF NOT v_space.is_available AND v_application.assigned_space_id IS DISTINCT FROM v_space.id THEN RAISE EXCEPTION 'SPACE_UNAVAILABLE'; END IF;

  IF v_application.assigned_space_id IS NOT NULL AND v_application.assigned_space_id <> v_space.id THEN
    UPDATE fair_spaces SET is_available = TRUE WHERE id = v_application.assigned_space_id;
  END IF;

  UPDATE fair_spaces SET is_available = FALSE WHERE id = v_space.id;
  UPDATE applications
  SET assigned_space_id = v_space.id,
      space_assigned_by_user_id = p_actor_user_id,
      space_assigned_at = NOW(),
      status = 'CONFIRMED',
      updated_at = NOW()
  WHERE id = v_application.id;

  INSERT INTO application_history (application_id, actor_user_id, status, note, is_visible_to_exhibitor)
  VALUES (v_application.id, p_actor_user_id, 'CONFIRMED', 'Espaço confirmado pela organização.', TRUE);

  RETURN QUERY SELECT * FROM applications WHERE id = v_application.id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_application_space(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_application_space(UUID, UUID, UUID) TO service_role;

-- Finaliza a inscrição, termos e histórico numa única transação.

CREATE OR REPLACE FUNCTION public.submit_application(
  p_application_id UUID,
  p_actor_user_id UUID,
  p_next_status application_status,
  p_consents JSONB,
  p_history_note TEXT
)
RETURNS SETOF public.applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consent JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM applications WHERE id = p_application_id FOR UPDATE) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND';
  END IF;

  DELETE FROM application_consents WHERE application_id = p_application_id;
  FOR v_consent IN SELECT value FROM jsonb_array_elements(p_consents)
  LOOP
    INSERT INTO application_consents (application_id, consent_key, consent_text)
    VALUES (p_application_id, v_consent->>'key', v_consent->>'text');
  END LOOP;

  UPDATE applications
  SET status = p_next_status,
      submitted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_application_id;

  INSERT INTO application_history (application_id, actor_user_id, status, note, is_visible_to_exhibitor)
  VALUES (p_application_id, p_actor_user_id, p_next_status, p_history_note, TRUE);

  RETURN QUERY SELECT * FROM applications WHERE id = p_application_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_application(UUID, UUID, application_status, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_application(UUID, UUID, application_status, JSONB, TEXT) TO service_role;

-- Troca todas as categorias de um expositor em uma única transação.
CREATE OR REPLACE FUNCTION replace_exhibitor_categories(
  p_exhibitor_id UUID,
  p_category_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM exhibitors WHERE id = p_exhibitor_id) THEN
    RAISE EXCEPTION 'Expositor não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_category_ids, ARRAY[]::UUID[])) AS category_id
    LEFT JOIN exhibitor_categories category ON category.id = category_id AND category.is_active = TRUE
    WHERE category.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Categoria inexistente ou inativa.' USING ERRCODE = '23503';
  END IF;

  DELETE FROM exhibitor_category_links WHERE exhibitor_id = p_exhibitor_id;

  INSERT INTO exhibitor_category_links (exhibitor_id, category_id)
  SELECT p_exhibitor_id, category_id
  FROM unnest(COALESCE(p_category_ids, ARRAY[]::UUID[])) AS category_id
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION replace_exhibitor_categories(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_exhibitor_categories(UUID, UUID[]) TO service_role;

-- Atualiza o status e registra o histórico da inscrição na mesma transação.
CREATE OR REPLACE FUNCTION public.transition_application(
  p_application_id UUID,
  p_actor_user_id UUID,
  p_next_status application_status,
  p_note TEXT DEFAULT NULL,
  p_visible_to_exhibitor BOOLEAN DEFAULT TRUE,
  p_mark_reviewed BOOLEAN DEFAULT FALSE
)
RETURNS SETOF public.applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM applications WHERE id = p_application_id FOR UPDATE) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE applications
  SET status = p_next_status,
      reviewed_by_user_id = CASE WHEN p_mark_reviewed THEN p_actor_user_id ELSE reviewed_by_user_id END,
      reviewed_at = CASE WHEN p_mark_reviewed THEN NOW() ELSE reviewed_at END,
      curator_decision_note = CASE WHEN p_mark_reviewed THEN p_note ELSE curator_decision_note END,
      updated_at = NOW()
  WHERE id = p_application_id;

  INSERT INTO application_history (
    application_id, actor_user_id, status, note, is_visible_to_exhibitor
  ) VALUES (
    p_application_id, p_actor_user_id, p_next_status, p_note, p_visible_to_exhibitor
  );

  RETURN QUERY SELECT * FROM applications WHERE id = p_application_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_application(UUID, UUID, application_status, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_application(UUID, UUID, application_status, TEXT, BOOLEAN, BOOLEAN) TO service_role;

-- Libera o espaço de uma inscrição e registra a alteração de forma atômica.
CREATE OR REPLACE FUNCTION public.release_application_space(
  p_application_id UUID,
  p_actor_user_id UUID
)
RETURNS SETOF public.applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application applications%ROWTYPE;
BEGIN
  SELECT * INTO v_application FROM applications WHERE id = p_application_id FOR UPDATE;
  IF v_application.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_application.assigned_space_id IS NULL THEN
    RAISE EXCEPTION 'SPACE_NOT_ASSIGNED' USING ERRCODE = 'P0002';
  END IF;

  UPDATE fair_spaces SET is_available = TRUE WHERE id = v_application.assigned_space_id;
  UPDATE applications
  SET assigned_space_id = NULL,
      space_assigned_by_user_id = NULL,
      space_assigned_at = NULL,
      status = CASE WHEN status = 'CONFIRMED' THEN 'APPROVED' ELSE status END,
      updated_at = NOW()
  WHERE id = p_application_id;

  INSERT INTO application_history (application_id, actor_user_id, status, note, is_visible_to_exhibitor)
  SELECT id, p_actor_user_id, status, 'Espaço liberado pela organização.', TRUE
  FROM applications WHERE id = p_application_id;

  RETURN QUERY SELECT * FROM applications WHERE id = p_application_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_application_space(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_application_space(UUID, UUID) TO service_role;

-- Os textos oficiais dos termos pertencem ao formulário, não ao navegador.
ALTER TABLE public.registration_forms
  ADD COLUMN IF NOT EXISTS required_consents JSONB NOT NULL DEFAULT '[]'::JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registration_forms_required_consents_array'
  ) THEN
    ALTER TABLE public.registration_forms
      ADD CONSTRAINT registration_forms_required_consents_array
      CHECK (jsonb_typeof(required_consents) = 'array');
  END IF;
END;
$$;

-- Links públicos flexíveis para Instagram, site, catálogo e outras redes.
ALTER TABLE public.exhibitors
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exhibitors_social_links_object') THEN
    ALTER TABLE public.exhibitors
      ADD CONSTRAINT exhibitors_social_links_object
      CHECK (jsonb_typeof(social_links) = 'object');
  END IF;
END;
$$;

UPDATE public.exhibitors
SET social_links = jsonb_build_object('instagram', instagram_url)
WHERE instagram_url IS NOT NULL AND instagram_url <> '' AND social_links = '{}'::JSONB;

-- Relaciona cada arquivo à pergunta IMAGE/FILE que o solicitou.
ALTER TABLE public.application_media
  ADD COLUMN IF NOT EXISTS field_id UUID REFERENCES public.registration_form_fields(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS application_media_field_idx
  ON public.application_media (application_id, field_id, position);

-- Categorias de demonstração. A curadoria pode ajustar livremente pelo painel administrativo.

INSERT INTO exhibitor_categories (name, slug) VALUES
  ('Artes visuais', 'artes-visuais'),
  ('Artesanato', 'artesanato'),
  ('Moda autoral', 'moda-autoral'),
  ('Literatura e publicações', 'literatura-publicacoes'),
  ('Sebos e antiguidades', 'sebos-antiguidades'),
  ('Gastronomia', 'gastronomia')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO fair_categories (name, slug) VALUES
  ('Arte e cultura', 'arte-cultura'),
  ('Economia criativa', 'economia-criativa'),
  ('Memória e patrimônio', 'memoria-patrimonio')
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';