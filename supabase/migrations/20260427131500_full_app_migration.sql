begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('user', 'superadmin')),
  subscription_status text not null check (subscription_status in ('active', 'inactive')),
  video_quota_total integer not null default 0,
  video_quota_used integer not null default 0,
  google_linked boolean not null default false,
  has_password boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_settings (
  settings_key text primary key default 'default' check (settings_key = 'default'),
  script_model text not null,
  tts_model text not null,
  language text not null check (language = 'id-ID'),
  max_video_seconds integer not null check (max_video_seconds between 10 and 60),
  safety_mode text not null check (safety_mode = 'safe_marketing'),
  concurrency integer not null check (concurrency = 1),
  gender_voices jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.jobs (
  job_id text primary key,
  owner_user_id uuid references auth.users (id) on delete set null,
  owner_email text,
  title text not null,
  description text not null,
  content_type text not null check (
    content_type in (
      'affiliate',
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
  video_path text not null,
  video_mime_type text not null,
  video_duration_sec double precision not null,
  status text not null check (status in ('queued', 'running', 'success', 'failed', 'interrupted')),
  progress jsonb not null,
  error_message text,
  output jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists jobs_owner_user_id_created_at_idx
  on public.jobs (owner_user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'superadmin'
  );
$$;

create or replace function public.reserve_video_quota()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
begin
  select *
  into current_profile
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception 'User tidak ditemukan.';
  end if;

  if current_profile.subscription_status <> 'active' then
    raise exception 'Langganan belum aktif. Hubungi admin untuk mengaktifkan paket Anda.';
  end if;

  if current_profile.video_quota_used >= current_profile.video_quota_total then
    raise exception 'Kuota video Anda habis. Hubungi admin untuk menambah kuota.';
  end if;

  update public.profiles
  set video_quota_used = video_quota_used + 1,
      updated_at = timezone('utc', now())
  where id = current_profile.id
  returning * into current_profile;

  return current_profile;
end;
$$;

create or replace function public.release_video_quota()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
begin
  update public.profiles
  set video_quota_used = greatest(video_quota_used - 1, 0),
      updated_at = timezone('utc', now())
  where id = auth.uid()
  returning * into current_profile;

  return current_profile;
end;
$$;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_email text := lower(coalesce(new.email, ''));
  next_display_name text := trim(
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1),
      coalesce(new.email, '')
    )
  );
  next_google_linked boolean := coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb;
  next_has_password boolean := coalesce(new.encrypted_password, '') <> '';
  is_bootstrap_superadmin boolean := next_email = 'jho.j80@gmail.com';
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    role,
    subscription_status,
    video_quota_total,
    video_quota_used,
    google_linked,
    has_password,
    created_at,
    updated_at
  )
  values (
    new.id,
    next_email,
    case when next_display_name = '' then next_email else next_display_name end,
    case when is_bootstrap_superadmin then 'superadmin' else 'user' end,
    case when is_bootstrap_superadmin then 'active' else 'inactive' end,
    case when is_bootstrap_superadmin then 1000 else 0 end,
    0,
    next_google_linked,
    next_has_password,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      role = case
        when is_bootstrap_superadmin then 'superadmin'
        else public.profiles.role
      end,
      subscription_status = case
        when is_bootstrap_superadmin then 'active'
        else public.profiles.subscription_status
      end,
      video_quota_total = case
        when is_bootstrap_superadmin then greatest(public.profiles.video_quota_total, 1000)
        else public.profiles.video_quota_total
      end,
      google_linked = excluded.google_linked,
      has_password = excluded.has_password,
      updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row
execute function public.touch_updated_at();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row
execute function public.touch_updated_at();

drop trigger if exists jobs_touch_updated_at on public.jobs;
create trigger jobs_touch_updated_at
before update on public.jobs
for each row
execute function public.touch_updated_at();

drop trigger if exists on_auth_user_changed on auth.users;
create trigger on_auth_user_changed
after insert or update on auth.users
for each row
execute function public.sync_profile_from_auth_user();

insert into public.profiles (
  id,
  email,
  display_name,
  role,
  subscription_status,
  video_quota_total,
  video_quota_used,
  google_linked,
  has_password,
  created_at,
  updated_at
)
select
  u.id,
  lower(coalesce(u.email, '')),
  trim(
    coalesce(
      u.raw_user_meta_data ->> 'display_name',
      u.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(u.email, ''), '@', 1),
      coalesce(u.email, '')
    )
  ),
  case when lower(coalesce(u.email, '')) = 'jho.j80@gmail.com' then 'superadmin' else 'user' end,
  case when lower(coalesce(u.email, '')) = 'jho.j80@gmail.com' then 'active' else 'inactive' end,
  case when lower(coalesce(u.email, '')) = 'jho.j80@gmail.com' then 1000 else 0 end,
  0,
  coalesce(u.raw_app_meta_data ->> 'provider', '') = 'google'
    or coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb,
  coalesce(u.encrypted_password, '') <> '',
  timezone('utc', now()),
  timezone('utc', now())
from auth.users u
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = case
      when excluded.email = 'jho.j80@gmail.com' then 'superadmin'
      else public.profiles.role
    end,
    subscription_status = case
      when excluded.email = 'jho.j80@gmail.com' then 'active'
      else public.profiles.subscription_status
    end,
    video_quota_total = case
      when excluded.email = 'jho.j80@gmail.com' then greatest(public.profiles.video_quota_total, 1000)
      else public.profiles.video_quota_total
    end,
    google_linked = excluded.google_linked,
    has_password = excluded.has_password,
    updated_at = timezone('utc', now());

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.jobs enable row level security;

drop policy if exists profiles_select_own_or_superadmin on public.profiles;
create policy profiles_select_own_or_superadmin
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_superadmin());

drop policy if exists profiles_update_superadmin_only on public.profiles;
create policy profiles_update_superadmin_only
on public.profiles
for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists app_settings_select_superadmin_only on public.app_settings;
create policy app_settings_select_superadmin_only
on public.app_settings
for select
to authenticated
using (public.is_superadmin());

drop policy if exists app_settings_write_superadmin_only on public.app_settings;
create policy app_settings_write_superadmin_only
on public.app_settings
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists jobs_select_owner_or_superadmin on public.jobs;
create policy jobs_select_owner_or_superadmin
on public.jobs
for select
to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin());

drop policy if exists jobs_insert_owner_or_superadmin on public.jobs;
create policy jobs_insert_owner_or_superadmin
on public.jobs
for insert
to authenticated
with check (owner_user_id = auth.uid() or public.is_superadmin());

drop policy if exists jobs_update_owner_or_superadmin on public.jobs;
create policy jobs_update_owner_or_superadmin
on public.jobs
for update
to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin())
with check (owner_user_id = auth.uid() or public.is_superadmin());

drop policy if exists jobs_delete_owner_or_superadmin on public.jobs;
create policy jobs_delete_owner_or_superadmin
on public.jobs
for delete
to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin());

grant usage on schema public to authenticated, service_role;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.app_settings to authenticated;
grant select, insert, update, delete on public.jobs to authenticated;
grant all privileges on public.profiles to service_role;
grant all privileges on public.app_settings to service_role;
grant all privileges on public.jobs to service_role;
grant execute on function public.is_superadmin() to authenticated, service_role;
grant execute on function public.reserve_video_quota() to authenticated, service_role;
grant execute on function public.release_video_quota() to authenticated, service_role;

insert into public.app_settings (
  settings_key,
  script_model,
  tts_model,
  language,
  max_video_seconds,
  safety_mode,
  concurrency,
  gender_voices,
  created_at,
  updated_at
)
values (
  'default',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-preview-tts',
  'id-ID',
  60,
  'safe_marketing',
  1,
  '[
    {"gender":"male","voiceName":"Charon","speechRate":1},
    {"gender":"female","voiceName":"Leda","speechRate":1}
  ]'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
)
on conflict (settings_key) do update
set script_model = excluded.script_model,
    tts_model = excluded.tts_model,
    language = excluded.language,
    max_video_seconds = excluded.max_video_seconds,
    safety_mode = excluded.safety_mode,
    concurrency = excluded.concurrency,
    gender_voices = excluded.gender_voices,
    updated_at = timezone('utc', now());

insert into public.jobs (
  job_id,
  owner_user_id,
  owner_email,
  title,
  description,
  content_type,
  voice_gender,
  tone,
  cta_text,
  reference_link,
  video_path,
  video_mime_type,
  video_duration_sec,
  status,
  progress,
  error_message,
  output,
  created_at,
  updated_at
)
values (
  'y6JErtKl_E',
  null,
  null,
  'Tutorial ganti catridge hp 315',
  'jelaskan cara ganti catridge hp 315',
  'edukasi',
  'male',
  'natural',
  null,
  null,
  'C:\Users\SEMOGA AWET\Documents\VIDEO AFFILIATE\VOICE_SHORTS_GENERAL_APP\uploads\y6JErtKl_E\source.mp4',
  'video/mp4',
  59.815,
  'success',
  '{
    "phase":"success",
    "percent":100,
    "label":"Selesai",
    "updatedAt":"2026-04-24T06:24:43.032Z"
  }'::jsonb,
  null,
  '{
    "captionPath":"/outputs/y6JErtKl_E/caption.txt",
    "voicePath":"/outputs/y6JErtKl_E/voice.wav",
    "finalVideoPath":"/outputs/y6JErtKl_E/final.mp4",
    "artifactPaths":[
      "/outputs/y6JErtKl_E/caption.txt",
      "/outputs/y6JErtKl_E/voice.wav",
      "/outputs/y6JErtKl_E/final.mp4"
    ],
    "updatedAt":"2026-04-24T06:24:43.032Z"
  }'::jsonb,
  '2026-04-24T06:15:03.152Z'::timestamptz,
  '2026-04-24T06:24:43.032Z'::timestamptz
)
on conflict (job_id) do nothing;

commit;
