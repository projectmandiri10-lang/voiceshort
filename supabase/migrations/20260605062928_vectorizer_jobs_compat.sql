alter table public.jobs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists project_name text not null default 'Project Vector',
  add column if not exists input_mode text not null default 'ready_trace',
  add column if not exists production_type text not null default 'sticker',
  add column if not exists price_idr integer not null default 0,
  add column if not exists separation_film_count integer not null default 0,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists manifest jsonb not null default '{}'::jsonb,
  add column if not exists ai_ledger_id uuid references public.credit_ledger(id),
  add column if not exists is_example_public boolean not null default false,
  add column if not exists example_published_at timestamptz,
  add column if not exists deleted_at timestamptz;

create unique index if not exists jobs_id_unique_idx on public.jobs (id);

alter table public.jobs
  alter column job_id set default gen_random_uuid()::text,
  alter column title set default 'Project Vector',
  alter column description set default '',
  alter column content_type set default 'informasi',
  alter column voice_gender set default 'male',
  alter column tone set default '',
  alter column video_path set default '',
  alter column video_mime_type set default '',
  alter column video_duration_sec set default 0,
  alter column progress set default '{}'::jsonb,
  alter column output set default '{}'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column status set default 'done';

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.jobs'::regclass and conname = 'jobs_status_check') then
    alter table public.jobs drop constraint jobs_status_check;
  end if;
end $$;

alter table public.jobs
  add constraint jobs_status_check
  check (status in ('queued', 'running', 'success', 'failed', 'interrupted', 'done'));

alter table public.jobs enable row level security;

drop policy if exists "jobs_select_own_or_admin" on public.jobs;
create policy "jobs_select_own_or_admin"
on public.jobs for select
to authenticated
using (user_id = auth.uid() or owner_user_id = auth.uid() or public.is_superuser(auth.uid()));

create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index if not exists jobs_example_public_created_idx on public.jobs (is_example_public, created_at desc) where deleted_at is null;
create index if not exists jobs_deleted_created_idx on public.jobs (deleted_at, created_at desc);;
