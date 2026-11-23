-- Preserva cada definicao de formulario utilizada por candidaturas.
-- A edicao identifica o formulario logico; cada linha de registration_forms e uma versao.

ALTER TABLE public.registration_forms
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS definition_snapshot JSONB;

ALTER TABLE public.registration_forms
  DROP CONSTRAINT IF EXISTS registration_forms_fair_edition_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS registration_forms_edition_version_key
  ON public.registration_forms (fair_edition_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS registration_forms_one_current_per_edition
  ON public.registration_forms (fair_edition_id)
  WHERE is_current = TRUE;

-- A definicao atualmente disponivel passa a ser a versao historica inicial conhecida.
UPDATE public.registration_forms AS form
SET definition_snapshot = jsonb_build_object(
  'title', form.title,
  'introduction', form.introduction,
  'isPublished', TRUE,
  'consents', form.required_consents,
  'sections', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'title', section.title,
        'description', section.description,
        'fields', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'fieldKey', field.field_key,
              'label', field.label,
              'helpText', field.help_text,
              'type', field.type,
              'isRequired', field.is_required,
              'isSensitive', field.is_sensitive,
              'isPrivate', field.is_private,
              'validation', field.validation,
              'conditionalLogic', field.conditional_logic,
              'options', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object('value', option.value, 'label', option.label)
                  ORDER BY option.position
                )
                FROM public.registration_form_field_options AS option
                WHERE option.field_id = field.id
              ), '[]'::JSONB)
            )
            ORDER BY field.position
          )
          FROM public.registration_form_fields AS field
          WHERE field.section_id = section.id
        ), '[]'::JSONB)
      )
      ORDER BY section.position
    )
    FROM public.registration_form_sections AS section
    WHERE section.form_id = form.id
  ), '[]'::JSONB)
)
WHERE form.definition_snapshot IS NULL;

COMMENT ON COLUMN public.registration_forms.is_current IS
  'Indica a versao vigente utilizada exclusivamente por novas candidaturas da edicao.';

COMMENT ON COLUMN public.registration_forms.definition_snapshot IS
  'Definicao normalizada usada para evitar versoes duplicadas por salvamentos sem alteracoes.';

-- Impede alteracoes diretas nas partes de uma versao que ja pertence a alguma candidatura.
CREATE OR REPLACE FUNCTION public.protect_used_registration_form_definition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_form_id UUID;
BEGIN
  IF TG_ARGV[0] = 'form' THEN
    v_form_id := OLD.id;
    IF EXISTS (SELECT 1 FROM public.applications WHERE registration_form_id = v_form_id) THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'REGISTRATION_FORM_VERSION_IN_USE';
      END IF;
      IF NEW.title IS DISTINCT FROM OLD.title
        OR NEW.introduction IS DISTINCT FROM OLD.introduction
        OR NEW.required_consents IS DISTINCT FROM OLD.required_consents
        OR NEW.version IS DISTINCT FROM OLD.version
        OR NEW.definition_snapshot IS DISTINCT FROM OLD.definition_snapshot
        OR NEW.fair_edition_id IS DISTINCT FROM OLD.fair_edition_id THEN
        RAISE EXCEPTION 'REGISTRATION_FORM_VERSION_IMMUTABLE';
      END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  ELSIF TG_ARGV[0] = 'section' THEN
    v_form_id := OLD.form_id;
  ELSIF TG_ARGV[0] = 'field' THEN
    SELECT form_id INTO v_form_id
    FROM public.registration_form_sections
    WHERE id = OLD.section_id;
  ELSE
    SELECT section.form_id INTO v_form_id
    FROM public.registration_form_fields AS field
    JOIN public.registration_form_sections AS section ON section.id = field.section_id
    WHERE field.id = OLD.field_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.applications WHERE registration_form_id = v_form_id) THEN
    RAISE EXCEPTION 'REGISTRATION_FORM_VERSION_IMMUTABLE';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS protect_used_registration_form ON public.registration_forms;
CREATE TRIGGER protect_used_registration_form
BEFORE UPDATE OR DELETE ON public.registration_forms
FOR EACH ROW EXECUTE FUNCTION public.protect_used_registration_form_definition('form');

DROP TRIGGER IF EXISTS protect_used_registration_form_section ON public.registration_form_sections;
CREATE TRIGGER protect_used_registration_form_section
BEFORE UPDATE OR DELETE ON public.registration_form_sections
FOR EACH ROW EXECUTE FUNCTION public.protect_used_registration_form_definition('section');

DROP TRIGGER IF EXISTS protect_used_registration_form_field ON public.registration_form_fields;
CREATE TRIGGER protect_used_registration_form_field
BEFORE UPDATE OR DELETE ON public.registration_form_fields
FOR EACH ROW EXECUTE FUNCTION public.protect_used_registration_form_definition('field');

DROP TRIGGER IF EXISTS protect_used_registration_form_option ON public.registration_form_field_options;
CREATE TRIGGER protect_used_registration_form_option
BEFORE UPDATE OR DELETE ON public.registration_form_field_options
FOR EACH ROW EXECUTE FUNCTION public.protect_used_registration_form_definition('option');

DROP FUNCTION IF EXISTS public.replace_registration_form(UUID, UUID, JSONB);

CREATE FUNCTION public.replace_registration_form(
  p_fair_edition_id UUID,
  p_created_by_user_id UUID,
  p_definition JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.registration_forms%ROWTYPE;
  v_form_id UUID;
  v_version SMALLINT;
  v_has_applications BOOLEAN;
  v_created_new_version BOOLEAN := FALSE;
  v_section JSONB;
  v_section_id UUID;
  v_section_position INTEGER;
  v_field JSONB;
  v_field_id UUID;
  v_field_position INTEGER;
  v_option JSONB;
  v_option_position INTEGER;
BEGIN
  -- Serializa edicoes concorrentes do mesmo formulario logico.
  PERFORM 1
  FROM public.fair_editions
  WHERE id = p_fair_edition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIR_EDITION_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_current
  FROM public.registration_forms
  WHERE fair_edition_id = p_fair_edition_id
    AND is_current = TRUE
  FOR UPDATE;

  IF v_current.id IS NULL THEN
    v_version := 1;
    INSERT INTO public.registration_forms (
      fair_edition_id, title, introduction, required_consents, version,
      is_published, is_current, definition_snapshot, created_by_user_id
    ) VALUES (
      p_fair_edition_id,
      p_definition->>'title',
      NULLIF(p_definition->>'introduction', ''),
      COALESCE(p_definition->'consents', '[]'::JSONB),
      v_version,
      TRUE,
      TRUE,
      p_definition,
      p_created_by_user_id
    ) RETURNING id INTO v_form_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.applications WHERE registration_form_id = v_current.id
    ) INTO v_has_applications;

    IF v_current.definition_snapshot = p_definition THEN
      RETURN jsonb_build_object(
        'id', v_current.id,
        'version', v_current.version,
        'createdNewVersion', FALSE
      );
    END IF;

    IF NOT v_has_applications THEN
      v_form_id := v_current.id;
      v_version := v_current.version;
      UPDATE public.registration_forms
      SET title = p_definition->>'title',
          introduction = NULLIF(p_definition->>'introduction', ''),
          required_consents = COALESCE(p_definition->'consents', '[]'::JSONB),
          is_published = TRUE,
          definition_snapshot = p_definition,
          updated_at = NOW()
      WHERE id = v_form_id;

      DELETE FROM public.registration_form_sections WHERE form_id = v_form_id;
    ELSE
      SELECT (COALESCE(MAX(version), 0) + 1)::SMALLINT
      INTO v_version
      FROM public.registration_forms
      WHERE fair_edition_id = p_fair_edition_id;

      UPDATE public.registration_forms
      SET is_current = FALSE,
          updated_at = NOW()
      WHERE id = v_current.id;

      INSERT INTO public.registration_forms (
        fair_edition_id, title, introduction, required_consents, version,
        is_published, is_current, definition_snapshot, created_by_user_id
      ) VALUES (
        p_fair_edition_id,
        p_definition->>'title',
        NULLIF(p_definition->>'introduction', ''),
        COALESCE(p_definition->'consents', '[]'::JSONB),
        v_version,
        TRUE,
        TRUE,
        p_definition,
        p_created_by_user_id
      ) RETURNING id INTO v_form_id;

      v_created_new_version := TRUE;
    END IF;
  END IF;

  FOR v_section, v_section_position IN
    SELECT value, ordinality - 1
    FROM jsonb_array_elements(p_definition->'sections') WITH ORDINALITY
  LOOP
    INSERT INTO public.registration_form_sections (form_id, title, description, position)
    VALUES (v_form_id, v_section->>'title', NULLIF(v_section->>'description', ''), v_section_position)
    RETURNING id INTO v_section_id;

    FOR v_field, v_field_position IN
      SELECT value, ordinality - 1
      FROM jsonb_array_elements(v_section->'fields') WITH ORDINALITY
    LOOP
      INSERT INTO public.registration_form_fields (
        section_id, field_key, label, help_text, type, is_required,
        is_sensitive, is_private, validation, conditional_logic, position
      ) VALUES (
        v_section_id,
        v_field->>'fieldKey',
        v_field->>'label',
        NULLIF(v_field->>'helpText', ''),
        (v_field->>'type')::public.form_field_type,
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
        INSERT INTO public.registration_form_field_options (field_id, value, label, position)
        VALUES (v_field_id, v_option->>'value', v_option->>'label', v_option_position);
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_form_id,
    'version', v_version,
    'createdNewVersion', v_created_new_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_registration_form(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_registration_form(UUID, UUID, JSONB)
  TO service_role;
