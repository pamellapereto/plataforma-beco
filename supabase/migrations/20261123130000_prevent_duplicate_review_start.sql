-- Impede que o inicio formal da analise seja registrado mais de uma vez.
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
  v_current_status application_status;
BEGIN
  SELECT status
  INTO v_current_status
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status = 'UNDER_REVIEW' AND p_next_status = 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'APPLICATION_REVIEW_ALREADY_STARTED';
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
