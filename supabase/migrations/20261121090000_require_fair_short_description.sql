-- Etapa 1: a apresentação curta passa a ser obrigatória.
-- O slug permanece porque identifica URLs públicas e é referenciado pela aplicação.
UPDATE public.fairs
SET short_description = COALESCE(NULLIF(BTRIM(description), ''), name)
WHERE short_description IS NULL OR BTRIM(short_description) = '';

ALTER TABLE public.fairs
  ALTER COLUMN short_description SET NOT NULL;
