CREATE TABLE IF NOT EXISTS public.about_content (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  intro_eyebrow TEXT NOT NULL,
  intro_title TEXT NOT NULL,
  intro_text TEXT NOT NULL,
  history_eyebrow TEXT NOT NULL,
  history_title TEXT NOT NULL,
  history_paragraphs JSONB NOT NULL CHECK (jsonb_typeof(history_paragraphs) = 'array'),
  motto_label TEXT NOT NULL,
  motto_text TEXT NOT NULL,
  facts JSONB NOT NULL CHECK (jsonb_typeof(facts) = 'array'),
  support_eyebrow TEXT NOT NULL,
  support_title TEXT NOT NULL,
  support_text TEXT NOT NULL,
  updated_by_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.about_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.about_content FROM PUBLIC, anon, authenticated;

INSERT INTO public.about_content (
  id, intro_eyebrow, intro_title, intro_text, history_eyebrow, history_title,
  history_paragraphs, motto_label, motto_text, facts, support_eyebrow, support_title, support_text
) VALUES (
  TRUE,
  'Associação Cultural de Fomento à Arte e Memória de Sorocaba e Região',
  'Uma rede que transforma memória em encontro, arte e futuro.',
  'O BECO reúne pessoas, histórias e iniciativas que fazem a cultura local circular todos os dias.',
  'Nossa história',
  'Cultura viva, construída em coletivo.',
  '["A Associação Cultural de Fomento à Arte e Memória de Sorocaba e Região atua como catalisadora de iniciativas culturais, artísticas e educacionais. Sua missão é resgatar e preservar a história e a memória popular da cidade, conectando quem cria, quem empreende e quem participa da vida cultural de Sorocaba.","Além de incentivar a economia local, a Associação cria espaços de inclusão social, saúde mental e geração de renda, usando a arte e a cultura como ferramentas de transformação. Formalizada em março de 2023, ela fortalece ações que já aconteciam há anos, integrando uma rede ampla de colaboradores, artistas, feirantes e comunidades locais.","Com ética, coletividade e desenvolvimento social como compromissos, a Associação realiza eventos que aproximam diversidade cultural, educação e conexões históricas. Já organizou ou participou diretamente de mais de 70 edições de feiras e eventos, em diferentes formas de expressão cultural."]'::jsonb,
  'Nosso lema',
  '“Cultura, Memória, Geração de Renda, Valorização da arte, cidadania e identidade local.”',
  '[{"value":"2023","label":"formalização da Associação"},{"value":"70+","label":"edições realizadas ou apoiadas"},{"value":"4","label":"feiras em movimento"},{"value":"1 rede","label":"de cultura local e coletiva"}]'::jsonb,
  'Rede de apoio',
  'Senac',
  'O fortalecimento da cultura local acontece em parceria. A rede de apoio da Associação conecta instituições, expositores, artistas e moradores para ampliar o acesso à cultura, ao trabalho e à memória de Sorocaba.'
) ON CONFLICT (id) DO NOTHING;
