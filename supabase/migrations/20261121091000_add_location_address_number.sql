-- Etapa 2: número do endereço separado, preservando locais existentes.
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS address_number VARCHAR(30);

COMMENT ON COLUMN public.locations.address_number IS
  'Número informado pelo organizador para o endereço da edição.';
