# Backend BECO

API do sistema privado de gerenciamento de feiras da Associação Cultural de Fomento à Arte e Memória de Sorocaba e Região. Usa Node.js, Supabase Auth, PostgreSQL e Supabase Storage. Não possui pagamentos, preços, PIX, carrinho ou vendas.

## O que está implementado

- Cadastro público de expositor sempre como `PENDING`, aprovação pela equipe e perfil público opcional.
- Login, renovação de sessão, logout, recuperação e alteração de senha pelo Supabase Auth.
- Contas fixas da equipe com o único papel administrativo `BECO_ADMIN`.
- Feiras recorrentes, edições, cidade, endereço, datas, prazos, categorias e estados controlados.
- Formulário dinâmico por edição, com seções, condições, perguntas sensíveis e termos oficiais versionados.
- Rascunho, respostas, fotos, envio, acompanhamento, pedido documental de exceção e cancelamento de inscrição.
- Curadoria com filtros, formulário completo, fotos, ajustes, decisões, notificações e histórico.
- Portfólio público ou privado do expositor, com revisão de imagens.
- Capa, galeria, material de divulgação, mapa e moldura de crachá por edição.
- Espaços com códigos, medidas, coordenadas, atribuição atômica e mapa individual com “você está aqui”.
- Painel com totais, distribuição por status e categoria e expositores com mais participações.
- RLS em todas as tabelas; o navegador nunca recebe a chave `service_role`.

## Estrutura MVC

- `src/models`: acesso persistente ao Supabase Auth, PostgREST e Storage.
- `src/controllers`: composição dos controllers e dependências da aplicação.
- `src/views`: apresentação padronizada das respostas JSON.
- `src/routes`: roteamento HTTP sem regras de negócio.
- `src/modules`: services, validações e regras de negócio organizados por domínio.
- `../assets/js/models`, `views` e `controllers`: MVC do frontend para catálogo, autenticação e dashboards.

O `src/app.js` monta a aplicação; `src/server.js` apenas inicia o servidor HTTP local e `api/index.js` adapta a mesma aplicação para a Vercel.

## Documentos

- [DER oficial](docs/relationship-diagram.md)
- [Arquitetura e permissões](docs/architecture.md)
- [Contrato da API](docs/api-contract.md)
- [Fluxo de imagens](docs/supabase-storage.md)
- [Análise do formulário](docs/analise-formulario-37-beco.md)
- [Modelo JSON da 37ª Feira](templates/registration-form-37-beco.json)

## Instalação no Supabase

1. Em um projeto vazio, execute `database/schema.sql` uma única vez.
2. Execute `database/migrations/001_supabase_storage.sql`.
3. Execute `database/migrations/003_private_api_rls.sql` até `012_application_media_fields.sql`, em ordem numérica. A migration `002_auth_accounts.sql` existe apenas para atualizar uma versão antiga do schema e não é necessária em instalação nova.
4. Execute `database/seed.sql` para as categorias iniciais.
5. Copie `.env.supabase.example` para `.env` e preencha as credenciais. Nunca envie `.env` ao Git.
6. Dentro de `backedb`, execute `npm run bootstrap:admin` uma única vez.
7. Remova `BOOTSTRAP_ADMIN_PASSWORD` do ambiente após criar a primeira conta.

Para carregar o conjunto demonstrativo usado pelo frontend, execute:

```bash
npm run seed:demo
```

O seed é idempotente: pode ser repetido sem duplicar feiras, expositores, inscrições, espaços ou imagens. Ele cria contas técnicas sem credenciais publicadas apenas para manter a integridade com o Supabase Auth. A conta administrativa de uso humano continua sendo criada por `npm run bootstrap:admin`.

### Reinstalação limpa

O `schema.sql` não deve ser executado novamente sobre uma instalação existente. O erro `type "platform_user_role" already exists` significa que ele já foi aplicado total ou parcialmente.

Se os dados puderem ser apagados, execute primeiro `database/reset_application.sql` e depois repita os passos 1 a 4. O reset remove somente tabelas, tipos, funções e políticas pertencentes à aplicação. Contas de `auth.users`, buckets e arquivos do Storage são preservados. Para recriar o mesmo administrador pelo bootstrap, remova antes a conta antiga em **Authentication > Users** ou utilize outro e-mail.

Se os dados precisarem ser preservados, não execute o reset nem o `schema.sql`: aplique somente as migrations ainda pendentes.

Para uma edição, envie o arquivo `templates/registration-form-37-beco.json` no `PUT /api/v1/admin/fair-editions/:id/form`, revise o conteúdo e altere `isPublished` para `true` antes de abrir as inscrições.

## Desenvolvimento

```bash
npm test
npm run dev
```

O servidor usa `PORT` (padrão `3333`) e aceita a origem definida em `CORS_ORIGIN`. Em produção, configure as variáveis no provedor da API e use `npm start`.

O repositório também inclui `api/index.js` e a regra de rewrite em `vercel.json`. Na Vercel, configure as mesmas variáveis de ambiente e as rotas `/api/v1/*` serão atendidas como uma Function Node sem iniciar um processo permanente.

## Segurança

- Senhas são armazenadas exclusivamente pelo Supabase Auth.
- A API valida o token e consulta o papel ativo no banco em cada rota privada.
- Respostas sensíveis e fotos de curadoria não são públicas.
- Os termos aceitos são gravados com o texto oficial salvo no formulário, não com texto enviado pelo navegador.
- Alterações críticas de inscrição, categorias e espaços usam funções transacionais no PostgreSQL.

O front-end atual continua com dados demonstrativos e login hardcoded. Ele precisa ser conectado a esta API em uma etapa própria; isso não impede a configuração e o teste isolado do backend.
