ALTER TABLE public.registration_forms
  ALTER COLUMN title TYPE VARCHAR(280);

UPDATE public.registration_forms AS form
SET title = 'Inscrições para expositores - ' || edition.title,
    updated_at = NOW()
FROM public.fair_editions AS edition
WHERE edition.id = form.fair_edition_id
  AND form.title IS DISTINCT FROM 'Inscrições para expositores - ' || edition.title;

COMMENT ON COLUMN public.registration_forms.title IS
  'Título padronizado: Inscrições para expositores - [título completo da edição].';
