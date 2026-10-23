create table public.application_attendance (
  application_id uuid primary key references public.applications(id) on delete cascade,
  attended boolean not null,
  note text check (note is null or char_length(note) <= 1000),
  recorded_by_user_id uuid not null references public.app_users(id),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_attendance_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  attended boolean not null,
  note text,
  recorded_by_user_id uuid not null references public.app_users(id),
  recorded_at timestamptz not null default now()
);

create table public.event_evaluations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  organization_communication_rating smallint not null check (organization_communication_rating between 1 and 5),
  structure_rating smallint not null check (structure_rating between 1 and 5),
  publicity_rating smallint not null check (publicity_rating between 1 and 5),
  audience_rating smallint not null check (audience_rating between 1 and 5),
  overall_rating smallint not null check (overall_rating between 1 and 5),
  sales_rating smallint check (sales_rating between 1 and 5),
  comments text check (comments is null or char_length(comments) <= 3000),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index application_attendance_attended_idx
  on public.application_attendance (attended, application_id);
create index application_attendance_recorded_by_idx
  on public.application_attendance (recorded_by_user_id);
create index application_attendance_history_application_idx
  on public.application_attendance_history (application_id, recorded_at desc);
create index application_attendance_history_recorded_by_idx
  on public.application_attendance_history (recorded_by_user_id);

create or replace function public.audit_application_attendance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.application_attendance_history (
    application_id, attended, note, recorded_by_user_id, recorded_at
  ) values (
    new.application_id, new.attended, new.note, new.recorded_by_user_id, new.updated_at
  );
  return new;
end;
$$;

create trigger audit_application_attendance_change
after insert or update on public.application_attendance
for each row execute function public.audit_application_attendance();

alter table public.application_attendance enable row level security;
alter table public.application_attendance_history enable row level security;
alter table public.event_evaluations enable row level security;

revoke all on public.application_attendance from anon, authenticated;
revoke all on public.application_attendance_history from anon, authenticated;
revoke all on public.event_evaluations from anon, authenticated;
grant select, insert, update, delete on public.application_attendance to service_role;
grant select, insert on public.application_attendance_history to service_role;
grant select, insert, update, delete on public.event_evaluations to service_role;

comment on table public.application_attendance is
  'Private attendance confirmation recorded by the producing organization; a confirmed application alone is not attendance.';
comment on table public.application_attendance_history is
  'Immutable audit trail for attendance corrections.';
comment on table public.event_evaluations is
  'Private post-event ratings submitted once per eligible exhibitor application.';
