-- Preserva todas as versões das imagens de candidaturas e seus eventos históricos.
ALTER TABLE public.application_media
  ADD COLUMN IF NOT EXISTS version_group_id UUID,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS replaces_application_media_id UUID,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE public.application_media
SET version_group_id = gen_random_uuid()
WHERE version_group_id IS NULL;

ALTER TABLE public.application_media
  DROP CONSTRAINT IF EXISTS application_media_version_number_check,
  DROP CONSTRAINT IF EXISTS application_media_previous_version_fk;

ALTER TABLE public.application_media
  ALTER COLUMN version_group_id SET NOT NULL,
  ADD CONSTRAINT application_media_version_number_check CHECK (version_number > 0),
  ADD CONSTRAINT application_media_previous_version_fk
    FOREIGN KEY (replaces_application_media_id)
    REFERENCES public.application_media(id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.application_media
  DROP CONSTRAINT IF EXISTS application_media_application_id_role_position_key;

CREATE UNIQUE INDEX IF NOT EXISTS application_media_current_slot_uidx
  ON public.application_media (application_id, role, position)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS application_media_group_version_uidx
  ON public.application_media (version_group_id, version_number);

CREATE UNIQUE INDEX IF NOT EXISTS application_media_current_group_uidx
  ON public.application_media (version_group_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS application_media_current_application_idx
  ON public.application_media (application_id, role, position)
  WHERE archived_at IS NULL;

ALTER TABLE public.application_history
  DROP CONSTRAINT IF EXISTS application_history_media_asset_fk;

ALTER TABLE public.application_history
  ADD CONSTRAINT application_history_media_asset_fk
  FOREIGN KEY (media_asset_id)
  REFERENCES public.media_assets(id)
  ON DELETE SET NULL;

ALTER TABLE public.application_media
  DROP CONSTRAINT IF EXISTS application_media_media_asset_id_fkey;

ALTER TABLE public.application_media
  ADD CONSTRAINT application_media_media_asset_id_fkey
  FOREIGN KEY (media_asset_id)
  REFERENCES public.media_assets(id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.validate_application_media_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_previous public.application_media%ROWTYPE;
BEGIN
  IF NEW.replaces_application_media_id IS NULL THEN
    IF NEW.version_number <> 1 THEN
      RAISE EXCEPTION 'MEDIA_INITIAL_VERSION_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.replaces_application_media_id = NEW.id THEN
    RAISE EXCEPTION 'MEDIA_VERSION_CYCLE';
  END IF;

  SELECT * INTO v_previous
  FROM public.application_media
  WHERE id = NEW.replaces_application_media_id;

  IF v_previous.id IS NULL
     OR v_previous.application_id <> NEW.application_id
     OR v_previous.version_group_id <> NEW.version_group_id
     OR NEW.version_number <> v_previous.version_number + 1 THEN
    RAISE EXCEPTION 'MEDIA_VERSION_RELATION_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_media_version_integrity ON public.application_media;
CREATE TRIGGER application_media_version_integrity
BEFORE INSERT OR UPDATE OF replaces_application_media_id, application_id, version_group_id, version_number
ON public.application_media
FOR EACH ROW EXECUTE FUNCTION public.validate_application_media_version();

CREATE OR REPLACE FUNCTION public.register_application_media(
  p_application_id UUID,
  p_actor_user_id UUID,
  p_storage_bucket TEXT,
  p_object_path TEXT,
  p_original_filename TEXT,
  p_mime_type TEXT,
  p_byte_size BIGINT,
  p_alt_text TEXT,
  p_field_id UUID,
  p_role TEXT,
  p_replace_media_asset_id UUID DEFAULT NULL
)
RETURNS SETOF public.media_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application public.applications%ROWTYPE;
  v_exhibitor public.exhibitors%ROWTYPE;
  v_previous_link public.application_media%ROWTYPE;
  v_previous_asset public.media_assets%ROWTYPE;
  v_asset public.media_assets%ROWTYPE;
  v_position SMALLINT;
  v_group UUID;
  v_version INTEGER;
  v_role_limit INTEGER;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_application
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_application.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND';
  END IF;

  SELECT * INTO v_exhibitor
  FROM public.exhibitors
  WHERE id = v_application.exhibitor_id;

  IF v_exhibitor.id IS NULL OR v_exhibitor.user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'APPLICATION_MEDIA_FORBIDDEN';
  END IF;

  IF v_application.status NOT IN ('DRAFT', 'PHOTO_REVIEW', 'AWAITING_UPDATE') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE';
  END IF;

  IF p_replace_media_asset_id IS NOT NULL THEN
    SELECT am.* INTO v_previous_link
    FROM public.application_media am
    WHERE am.application_id = p_application_id
      AND am.media_asset_id = p_replace_media_asset_id
      AND am.archived_at IS NULL
    FOR UPDATE;

    IF v_previous_link.id IS NULL THEN
      RAISE EXCEPTION 'MEDIA_CURRENT_VERSION_NOT_FOUND';
    END IF;

    SELECT * INTO v_previous_asset
    FROM public.media_assets
    WHERE id = p_replace_media_asset_id;

    IF v_application.status <> 'AWAITING_UPDATE'
       OR v_previous_asset.review_status NOT IN ('CHANGES_REQUESTED', 'REJECTED') THEN
      RAISE EXCEPTION 'MEDIA_REPLACEMENT_NOT_ALLOWED';
    END IF;

    IF v_previous_link.field_id IS DISTINCT FROM p_field_id
       OR v_previous_link.role <> p_role THEN
      RAISE EXCEPTION 'MEDIA_REPLACEMENT_CONTEXT_INVALID';
    END IF;

    v_position := v_previous_link.position;
    v_group := v_previous_link.version_group_id;
    v_version := v_previous_link.version_number + 1;
  ELSE
    SELECT COALESCE(MAX(position), -1) + 1 INTO v_position
    FROM public.application_media
    WHERE application_id = p_application_id
      AND role = p_role
      AND archived_at IS NULL;

    v_role_limit := CASE p_role
      WHEN 'PORTFOLIO' THEN 20
      WHEN 'BADGE_PHOTO' THEN 1
      WHEN 'PROMOTION' THEN 6
      WHEN 'DOCUMENT' THEN 10
      ELSE 0
    END;

    IF v_position >= v_role_limit THEN
      RAISE EXCEPTION 'APPLICATION_MEDIA_LIMIT';
    END IF;
    v_group := gen_random_uuid();
    v_version := 1;
  END IF;

  INSERT INTO public.media_assets (
    owner_user_id, owner_exhibitor_id, storage_bucket, object_path,
    original_filename, mime_type, byte_size, alt_text, visibility, review_status
  ) VALUES (
    p_actor_user_id, v_exhibitor.id, p_storage_bucket, p_object_path,
    p_original_filename, p_mime_type, p_byte_size, p_alt_text, 'PRIVATE', 'PENDING'
  ) RETURNING * INTO v_asset;

  IF v_previous_link.id IS NOT NULL THEN
    UPDATE public.application_media
    SET archived_at = v_now
    WHERE id = v_previous_link.id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MEDIA_VERSION_CONFLICT';
    END IF;
  END IF;

  INSERT INTO public.application_media (
    application_id, media_asset_id, field_id, role, position,
    version_group_id, version_number, replaces_application_media_id, archived_at
  ) VALUES (
    p_application_id, v_asset.id, p_field_id, p_role, v_position,
    v_group, v_version, v_previous_link.id, NULL
  );

  IF v_previous_link.id IS NOT NULL THEN
    INSERT INTO public.application_history (
      application_id, actor_user_id, status, note, media_asset_id, is_visible_to_exhibitor
    ) VALUES (
      p_application_id,
      p_actor_user_id,
      v_application.status,
      'Imagem substituída pelo expositor. Nova versão: ' || v_asset.id::TEXT || '.',
      v_previous_asset.id,
      TRUE
    );
  END IF;

  RETURN NEXT v_asset;
END;
$$;

REVOKE ALL ON FUNCTION public.register_application_media(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_application_media(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID, TEXT, UUID
) TO service_role;

CREATE OR REPLACE FUNCTION public.remove_draft_application_media(
  p_application_id UUID,
  p_media_asset_id UUID,
  p_actor_user_id UUID
)
RETURNS TABLE (storage_bucket TEXT, object_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application public.applications%ROWTYPE;
  v_exhibitor public.exhibitors%ROWTYPE;
  v_link public.application_media%ROWTYPE;
  v_asset public.media_assets%ROWTYPE;
BEGIN
  SELECT * INTO v_application
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  SELECT * INTO v_exhibitor
  FROM public.exhibitors
  WHERE id = v_application.exhibitor_id;

  IF v_application.id IS NULL OR v_exhibitor.user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'APPLICATION_MEDIA_FORBIDDEN';
  END IF;

  IF v_application.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE';
  END IF;

  SELECT * INTO v_link
  FROM public.application_media
  WHERE application_id = p_application_id
    AND media_asset_id = p_media_asset_id
    AND archived_at IS NULL
    AND version_number = 1
    AND replaces_application_media_id IS NULL
  FOR UPDATE;

  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'MEDIA_CURRENT_VERSION_NOT_FOUND';
  END IF;

  SELECT * INTO v_asset
  FROM public.media_assets
  WHERE id = p_media_asset_id;

  DELETE FROM public.application_media WHERE id = v_link.id;
  DELETE FROM public.media_assets WHERE id = p_media_asset_id;

  RETURN QUERY SELECT v_asset.storage_bucket, v_asset.object_path;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_draft_application_media(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_draft_application_media(UUID, UUID, UUID)
  TO service_role;

NOTIFY pgrst, 'reload schema';
