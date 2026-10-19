# BECO — Memória Viva Sorocaba

Cópia reconstruída dos arquivos públicos do protótipo publicado em `feira-cultural.vercel.app`, com uma API própria para ligar catálogo, candidaturas, autenticação, portfólios e curadoria ao Supabase.

## Requisitos

- Node.js 20 ou superior
- Projeto Supabase
- Projeto Vercel conectado a este repositório

## Configuração do Supabase

1. Crie um projeto e aplique `supabase/migrations/001_initial_schema.sql` no SQL Editor.
2. Copie `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` para as variáveis de ambiente da Vercel. A chave `SERVICE_ROLE` é secreta e deve existir somente no ambiente de servidor da Vercel.
3. Cadastre feiras e edições no banco. Uma candidatura só pode ser enviada para uma edição com status `REGISTRATION_OPEN` e prazo ainda vigente.
4. Crie usuários no Auth do Supabase. Para habilitar curadores, associe a conta criada a `public.accounts` com `role = 'BECO_ADMIN'`. Para um expositor, crie seu registro em `public.exhibitors` e associe a conta com `role = 'EXHIBITOR'` e o `exhibitor_id` correspondente.
5. Cadastre a feira e as edições em `fairs`, `locations` e `fair_editions`; portfólios públicos só aparecem quando expositor e itens estão aprovados e a visibilidade está pública.

Os dados privados são lidos e alterados pela API do servidor, que confere o token e o papel da conta antes de cada operação administrativa ou pessoal. A chave de serviço não é enviada ao navegador. As imagens da candidatura aceitam JPEG, PNG e WebP, até quatro imagens de 750 KB cada.

## Rodar localmente

```sh
npm install
cp .env.example .env.local
# preencha .env.local com os valores do seu projeto Supabase
npm run dev
```

## Publicar

Instale as dependências e configure as três variáveis na Vercel para os ambientes desejados. A Vercel publica os arquivos estáticos e executa `api/v1/[...path].js` como função de servidor. Após publicar, `GET /api/v1/health` confirma se a conexão e as tabelas estão disponíveis.

## Estado da integração

A camada da API e a migração do banco estão preparadas. O protótipo publicado retornava `SUPABASE_NOT_CONFIGURED`; portanto, esta cópia não recebe dados reais até que um projeto Supabase seja associado, a migração aplicada e as variáveis configuradas na Vercel. As telas de exemplo da área da curadoria ainda incluem conteúdo demonstrativo que deve ser substituído ao conectar uma edição real.
