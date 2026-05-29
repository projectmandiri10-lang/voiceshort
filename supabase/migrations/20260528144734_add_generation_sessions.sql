begin;

create table if not exists public.generation_sessions (
  session_id text primary key,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  owner_email text not null,
  title text not null,
  description text not null,
  content_type text not null check (
    content_type in (
      'affiliate',
      'video-marketing',
      'komedi',
      'informasi',
      'hiburan',
      'gaul',
      'cerita',
      'review-produk',
      'edukasi',
      'motivasi',
      'promosi-event'
    )
  ),
  voice_gender text not null check (voice_gender in ('male', 'female')),
  tone text not null,
  cta_text text,
  reference_link text,
  video_duration_sec double precision not null check (video_duration_sec > 0 and video_duration_sec <= 60),
  frame_count integer not null check (frame_count between 1 and 24),
  status text not null check (
    status in ('creating', 'ready_for_audio', 'ready_for_render', 'completed', 'failed')
  ),
  script_text text,
  caption_text text,
  hashtags jsonb not null default '[]'::jsonb,
  voice_name text,
  speech_rate double precision,
  charged_amount_idr integer not null default 0 check (charged_amount_idr >= 0),
  error_message text,
  render_summary jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists generation_sessions_owner_user_id_created_at_idx
  on public.generation_sessions (owner_user_id, created_at desc);

drop trigger if exists generation_sessions_touch_updated_at on public.generation_sessions;
create trigger generation_sessions_touch_updated_at
before update on public.generation_sessions
for each row
execute function public.touch_updated_at();

alter table public.generation_sessions enable row level security;

drop policy if exists generation_sessions_select_owner_or_superadmin on public.generation_sessions;
create policy generation_sessions_select_owner_or_superadmin
on public.generation_sessions
for select
to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin());

drop policy if exists generation_sessions_insert_owner_or_superadmin on public.generation_sessions;
create policy generation_sessions_insert_owner_or_superadmin
on public.generation_sessions
for insert
to authenticated
with check (owner_user_id = auth.uid() or public.is_superadmin());

drop policy if exists generation_sessions_update_owner_or_superadmin on public.generation_sessions;
create policy generation_sessions_update_owner_or_superadmin
on public.generation_sessions
for update
to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin())
with check (owner_user_id = auth.uid() or public.is_superadmin());

drop policy if exists generation_sessions_delete_owner_or_superadmin on public.generation_sessions;
create policy generation_sessions_delete_owner_or_superadmin
on public.generation_sessions
for delete
to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin());

grant select, insert, update, delete on public.generation_sessions to authenticated;
grant all privileges on public.generation_sessions to service_role;

commit;
