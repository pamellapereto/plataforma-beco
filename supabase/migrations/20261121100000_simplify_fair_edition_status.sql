-- Separa a etapa administrativa da situação temporal das inscrições.
-- O enum legado é mantido para preservar compatibilidade com dados e migrações anteriores.
UPDATE public.fair_editions
SET status = 'PUBLISHED'::fair_edition_status,
    updated_at = NOW()
WHERE status IN (
  'REGISTRATION_OPEN'::fair_edition_status,
  'CURATION'::fair_edition_status,
  'CONFIRMED'::fair_edition_status,
  'FINISHED'::fair_edition_status
);

UPDATE public.fair_editions
SET status = 'DRAFT'::fair_edition_status,
    updated_at = NOW()
WHERE status = 'CANCELLED'::fair_edition_status;

COMMENT ON COLUMN public.fair_editions.status IS
  'Etapa administrativa da edição: DRAFT ou PUBLISHED. A situação das inscrições é calculada pelas datas.';
