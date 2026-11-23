-- Registra criação, alteração e decisão de pedidos especiais na mesma transação.
CREATE OR REPLACE FUNCTION public.upsert_application_exception_request(
  p_application_id UUID,
  p_actor_user_id UUID,
  p_request_type TEXT,
  p_reason TEXT
)
RETURNS SETOF public.application_exception_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application public.applications%ROWTYPE;
  v_exhibitor public.exhibitors%ROWTYPE;
  v_existing public.application_exception_requests%ROWTYPE;
  v_result public.application_exception_requests%ROWTYPE;
  v_note TEXT;
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
    RAISE EXCEPTION 'EXCEPTION_REQUEST_FORBIDDEN';
  END IF;

  IF v_application.status NOT IN ('DRAFT', 'AWAITING_UPDATE', 'SUBMITTED', 'PHOTO_REVIEW', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE';
  END IF;

  SELECT * INTO v_existing
  FROM public.application_exception_requests
  WHERE application_id = p_application_id
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.application_exception_requests (
      application_id, request_type, reason, status
    ) VALUES (
      p_application_id, p_request_type, p_reason, 'PENDING'
    ) RETURNING * INTO v_result;

    v_note := 'Pedido especial criado pelo expositor. Justificativa: ' || p_reason;
  ELSIF v_existing.reason = p_reason
        AND v_existing.request_type = p_request_type
        AND v_existing.status = 'PENDING' THEN
    RETURN NEXT v_existing;
    RETURN;
  ELSE
    UPDATE public.application_exception_requests
    SET request_type = p_request_type,
        reason = p_reason,
        status = 'PENDING',
        decided_by_user_id = NULL,
        decided_at = NULL,
        decision_note = NULL,
        updated_at = NOW()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;

    v_note := 'Pedido especial alterado pelo expositor. Situação anterior: '
      || v_existing.status::TEXT || '. Justificativa anterior: ' || v_existing.reason
      || '. Nova justificativa: ' || p_reason;
  END IF;

  INSERT INTO public.application_history (
    application_id, actor_user_id, status, note, is_visible_to_exhibitor
  ) VALUES (
    p_application_id, p_actor_user_id, NULL, v_note, TRUE
  );

  RETURN NEXT v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_application_exception_request(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_application_exception_request(UUID, UUID, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.decide_application_exception_request(
  p_request_id UUID,
  p_actor_user_id UUID,
  p_status exception_request_status,
  p_note TEXT DEFAULT NULL
)
RETURNS SETOF public.application_exception_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.app_users%ROWTYPE;
  v_request public.application_exception_requests%ROWTYPE;
  v_organization_id UUID;
  v_result public.application_exception_requests%ROWTYPE;
BEGIN
  IF p_status NOT IN ('APPROVED', 'DECLINED') THEN
    RAISE EXCEPTION 'INVALID_EXCEPTION_STATUS';
  END IF;

  SELECT * INTO v_actor
  FROM public.app_users
  WHERE id = p_actor_user_id
    AND role = 'BECO_ADMIN'
    AND is_active = TRUE;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'EXCEPTION_REQUEST_FORBIDDEN';
  END IF;

  SELECT aer, f.organization_id
  INTO v_request, v_organization_id
  FROM public.application_exception_requests aer
  JOIN public.applications a ON a.id = aer.application_id
  JOIN public.fair_editions fe ON fe.id = a.fair_edition_id
  JOIN public.fairs f ON f.id = fe.fair_id
  WHERE aer.id = p_request_id
  FOR UPDATE OF aer;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'EXCEPTION_REQUEST_NOT_FOUND';
  END IF;

  IF v_organization_id IS DISTINCT FROM v_actor.organization_id THEN
    RAISE EXCEPTION 'EXCEPTION_REQUEST_FORBIDDEN';
  END IF;

  IF v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'EXCEPTION_REQUEST_UNAVAILABLE';
  END IF;

  UPDATE public.application_exception_requests
  SET status = p_status,
      decision_note = p_note,
      decided_by_user_id = p_actor_user_id,
      decided_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_result;

  INSERT INTO public.application_history (
    application_id, actor_user_id, status, note, is_visible_to_exhibitor
  ) VALUES (
    v_request.application_id,
    p_actor_user_id,
    NULL,
    'Pedido especial ' || CASE WHEN p_status = 'APPROVED' THEN 'aprovado' ELSE 'recusado' END
      || ' pela curadoria.' || CASE WHEN p_note IS NULL THEN '' ELSE ' ' || p_note END,
    TRUE
  );

  RETURN NEXT v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_application_exception_request(
  UUID, UUID, exception_request_status, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_application_exception_request(
  UUID, UUID, exception_request_status, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
