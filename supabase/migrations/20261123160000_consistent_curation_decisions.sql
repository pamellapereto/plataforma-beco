-- Centraliza as transições administrativas e impede decisões históricas duplicadas.
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
DECLARE
  v_application public.applications%ROWTYPE;
  v_latest_note TEXT;
  v_latest_visible BOOLEAN;
  v_transition_allowed BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_application
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_application.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_application.status = p_next_status THEN
    IF v_application.status = 'UNDER_REVIEW'
       AND p_note = 'Análise da candidatura iniciada pela curadoria.' THEN
      RAISE EXCEPTION 'APPLICATION_REVIEW_ALREADY_STARTED';
    END IF;

    IF NOT p_mark_reviewed
       OR v_application.status IN ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'CANCELLED') THEN
      RAISE EXCEPTION 'INVALID_APPLICATION_TRANSITION';
    END IF;

    SELECT note, is_visible_to_exhibitor
    INTO v_latest_note, v_latest_visible
    FROM public.application_history
    WHERE application_id = p_application_id
      AND status = p_next_status
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF v_latest_note IS NOT DISTINCT FROM p_note
       AND v_latest_visible IS NOT DISTINCT FROM p_visible_to_exhibitor THEN
      RAISE EXCEPTION 'APPLICATION_DECISION_UNCHANGED';
    END IF;

    v_transition_allowed := TRUE;
  ELSIF NOT p_mark_reviewed
        AND p_next_status = 'CANCELLED'
        AND v_application.status NOT IN ('CONFIRMED', 'DECLINED', 'CANCELLED') THEN
    -- Cancelamento feito pelo expositor preserva o fluxo próprio.
    v_transition_allowed := TRUE;
  ELSE
    v_transition_allowed := CASE v_application.status
      WHEN 'SUBMITTED' THEN p_next_status = 'UNDER_REVIEW'
      WHEN 'PHOTO_REVIEW' THEN p_next_status IN ('UNDER_REVIEW', 'AWAITING_UPDATE', 'DECLINED')
      WHEN 'UNDER_REVIEW' THEN p_next_status IN ('AWAITING_UPDATE', 'WAITLISTED', 'APPROVED', 'DECLINED')
      WHEN 'AWAITING_UPDATE' THEN p_next_status IN ('PHOTO_REVIEW', 'UNDER_REVIEW', 'DECLINED')
      WHEN 'WAITLISTED' THEN p_next_status IN ('APPROVED', 'DECLINED')
      WHEN 'APPROVED' THEN p_next_status IN ('DECLINED', 'CANCELLED')
      WHEN 'CONFIRMED' THEN p_next_status = 'CANCELLED'
      ELSE FALSE
    END;
  END IF;

  IF NOT v_transition_allowed OR p_next_status = 'CONFIRMED' THEN
    RAISE EXCEPTION 'INVALID_APPLICATION_TRANSITION';
  END IF;

  UPDATE public.applications
  SET status = p_next_status,
      reviewed_by_user_id = CASE WHEN p_mark_reviewed THEN p_actor_user_id ELSE reviewed_by_user_id END,
      reviewed_at = CASE WHEN p_mark_reviewed THEN NOW() ELSE reviewed_at END,
      curator_decision_note = CASE WHEN p_mark_reviewed THEN p_note ELSE curator_decision_note END,
      updated_at = NOW()
  WHERE id = p_application_id;

  INSERT INTO public.application_history (
    application_id, actor_user_id, status, note, is_visible_to_exhibitor
  ) VALUES (
    p_application_id, p_actor_user_id, p_next_status, p_note, p_visible_to_exhibitor
  );

  RETURN QUERY SELECT * FROM public.applications WHERE id = p_application_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_application(UUID, UUID, application_status, TEXT, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_application(UUID, UUID, application_status, TEXT, BOOLEAN, BOOLEAN)
  TO service_role;

NOTIFY pgrst, 'reload schema';
