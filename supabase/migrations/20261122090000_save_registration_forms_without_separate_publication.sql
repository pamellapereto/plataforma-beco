-- A disponibilidade do formulário passa a depender da edição e das datas.
-- A coluna é preservada para compatibilidade com dados e funções existentes.
UPDATE public.registration_forms
SET is_published = TRUE,
    updated_at = NOW()
WHERE is_published = FALSE;

COMMENT ON COLUMN public.registration_forms.is_published IS
  'Compatibilidade legada. Formulários são salvos; sua disponibilidade é controlada pela publicação e pelas datas da edição.';
