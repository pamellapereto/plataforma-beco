CREATE TABLE IF NOT EXISTS public.homepage_content (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  eyebrow TEXT NOT NULL,
  title TEXT NOT NULL,
  intro_text TEXT NOT NULL,
  image_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  image_alt TEXT NOT NULL,
  caption_title TEXT NOT NULL,
  caption_text TEXT NOT NULL,
  updated_by_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.homepage_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.homepage_content FROM PUBLIC, anon, authenticated;

INSERT INTO public.homepage_content (id, eyebrow, title, intro_text, image_alt, caption_title, caption_text)
VALUES (
  TRUE,
  'Arte, memória e geração de renda',
  'Feiras que fazem a cultura circular por Sorocaba.',
  'O sistema BECO organiza as feiras da Associação Cultural de Fomento à Arte e Memória de Sorocaba e Região, aproximando público, expositores e curadoria.',
  'Público em feira cultural',
  'Conheça nossas feiras',
  'Incentivo à produção artística local e economia criativa.'
)
ON CONFLICT (id) DO NOTHING;
