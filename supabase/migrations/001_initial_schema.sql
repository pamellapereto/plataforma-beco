create extension if not exists pgcrypto;

create table if not exists public.fairs (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  short_description text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(), name text, address_line text, neighborhood text,
  city text not null default 'Sorocaba', state text not null default 'SP', maps_url text
);
create table if not exists public.fair_editions (
  id uuid primary key default gen_random_uuid(), fair_id uuid not null references public.fairs on delete cascade,
  location_id uuid references public.locations, slug text not null unique, title text not null,
  public_description text, edition_number integer, status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','REGISTRATION_OPEN','CURATION','CONFIRMED','FINISHED')),
  starts_at timestamptz, ends_at timestamptz, registration_opens_at timestamptz, registration_closes_at timestamptz,
  exhibitor_capacity integer, created_at timestamptz not null default now()
);
create table if not exists public.edition_media (
  id uuid primary key default gen_random_uuid(), edition_id uuid not null references public.fair_editions on delete cascade,
  url text not null, role text not null default 'GALLERY'
);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique
);
create table if not exists public.exhibitors (
  id uuid primary key default gen_random_uuid(), display_name text not null, bio text, city text default 'Sorocaba', state text default 'SP',
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','SUSPENDED')),
  profile_visibility text not null default 'PRIVATE' check(profile_visibility in ('PUBLIC','PRIVATE')),
  social_links jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.accounts (
  id uuid primary key references auth.users on delete cascade,
  role text not null check(role in ('BECO_ADMIN','EXHIBITOR')),
  exhibitor_id uuid unique references public.exhibitors on delete set null,
  created_at timestamptz not null default now(),
  check ((role = 'EXHIBITOR' and exhibitor_id is not null) or role = 'BECO_ADMIN')
);
create table if not exists public.exhibitor_categories (
  exhibitor_id uuid not null references public.exhibitors on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  primary key(exhibitor_id, category_id)
);
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(), edition_id uuid not null references public.fair_editions,
  exhibitor_id uuid references public.exhibitors on delete set null,
  applicant_name text not null, email text not null, whatsapp text not null,
  status text not null default 'SUBMITTED' check(status in ('DRAFT','SUBMITTED','PHOTO_REVIEW','UNDER_REVIEW','AWAITING_UPDATE','WAITLISTED','APPROVED','CONFIRMED','DECLINED','CANCELLED')),
  form_data jsonb not null default '{}'::jsonb, curation_notes text, requested_space_type text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(), exhibitor_id uuid not null references public.exhibitors on delete cascade,
  url text not null, alt_text text, title text, description text, is_featured boolean not null default false,
  visibility text not null default 'PRIVATE' check(visibility in ('PUBLIC','PRIVATE')), review_status text not null default 'PENDING' check(review_status in ('PENDING','APPROVED','CHANGES_REQUESTED')),
  created_at timestamptz not null default now()
);
create table if not exists public.application_media (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications on delete cascade,
  storage_path text not null, url text not null, role text not null default 'APPLICATION',
  review_status text not null default 'PENDING' check(review_status in ('PENDING','APPROVED','CHANGES_REQUESTED')),
  created_at timestamptz not null default now()
);
create index if not exists applications_edition_status_idx on public.applications(edition_id,status);
create index if not exists exhibitors_public_idx on public.exhibitors(status,profile_visibility);
create index if not exists portfolio_public_idx on public.portfolio_items(exhibitor_id,visibility,review_status);

alter table public.fairs enable row level security;
alter table public.locations enable row level security;
alter table public.fair_editions enable row level security;
alter table public.edition_media enable row level security;
alter table public.categories enable row level security;
alter table public.exhibitors enable row level security;
alter table public.accounts enable row level security;
alter table public.exhibitor_categories enable row level security;
alter table public.applications enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.application_media enable row level security;

drop policy if exists "public fairs read" on public.fairs;
create policy "public fairs read" on public.fairs for select to anon, authenticated using (active);
drop policy if exists "public locations read" on public.locations;
create policy "public locations read" on public.locations for select to anon, authenticated using (true);
drop policy if exists "published editions read" on public.fair_editions;
create policy "published editions read" on public.fair_editions for select to anon, authenticated using (status in ('PUBLISHED','REGISTRATION_OPEN','CURATION','CONFIRMED','FINISHED'));
drop policy if exists "public edition media read" on public.edition_media;
create policy "public edition media read" on public.edition_media for select to anon, authenticated using (exists(select 1 from public.fair_editions e where e.id=edition_id and e.status <> 'DRAFT'));
drop policy if exists "categories read" on public.categories;
create policy "categories read" on public.categories for select to anon, authenticated using (true);
drop policy if exists "public exhibitor categories read" on public.exhibitor_categories;
create policy "public exhibitor categories read" on public.exhibitor_categories for select to anon, authenticated using (exists(select 1 from public.exhibitors e where e.id=exhibitor_id and e.status='APPROVED' and e.profile_visibility='PUBLIC'));
drop policy if exists "public portfolios read" on public.portfolio_items;
create policy "public portfolios read" on public.portfolio_items for select to anon, authenticated using (visibility='PUBLIC' and review_status='APPROVED' and exists(select 1 from public.exhibitors e where e.id=exhibitor_id and e.status='APPROVED' and e.profile_visibility='PUBLIC'));
-- Private operational records are accessed only through the server API using its service role.

insert into public.fairs(name,slug,short_description) values
('Feira Beco do Inferno','beco-do-inferno','Arte, cultura e economia criativa no Centro de Sorocaba.'),
('OCA Feira Cultural','oca-feira-cultural','Um espaço de encontro para produção autoral e comunidade.'),
('Feira da Vila Operária','vila-operaria','Cultura e história do bairro Santa Rosália.'),
('REVIVA','reviva','Feira de objetos, antiguidades e coleções.') on conflict(slug) do nothing;
insert into public.categories(name,slug) values
('Artes visuais','artes-visuais'),('Artesanato','artesanato'),('Cosméticos artesanais','cosmeticos-artesanais'),
('Livros autorais','livros-autorais'),('Moda autoral','moda-autoral'),('Sebos e coleções','sebo'),
('Brechó e vintage','brecho'),('Design','design'),('Gastronomia','gastronomia') on conflict(slug) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio','portfolio',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
