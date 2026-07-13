alter table public.app_settings
  add column if not exists key text,
  add column if not exists value jsonb not null default '{}'::jsonb,
  add column if not exists is_public boolean not null default false,
  add column if not exists description text;

alter table public.app_settings
  alter column script_model set default '',
  alter column tts_model set default '',
  alter column language set default 'id-ID',
  alter column max_video_seconds set default 60,
  alter column safety_mode set default 'safe_marketing',
  alter column concurrency set default 1,
  alter column gender_voices set default '{}'::jsonb,
  alter column updated_at set default now();

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.app_settings'::regclass and conname = 'app_settings_settings_key_check') then
    alter table public.app_settings drop constraint app_settings_settings_key_check;
  end if;
end $$;

create unique index if not exists app_settings_key_unique_idx on public.app_settings (key);

create or replace function public.compat_app_settings_key()
returns trigger
language plpgsql
as $$
begin
  if new.key is null then
    new.key = coalesce(new.settings_key, gen_random_uuid()::text);
  end if;
  if new.settings_key is null or new.settings_key = 'default' then
    new.settings_key = new.key;
  end if;
  return new;
end;
$$;

drop trigger if exists app_settings_compat_key on public.app_settings;
create trigger app_settings_compat_key
before insert or update on public.app_settings
for each row execute function public.compat_app_settings_key();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row execute function public.touch_updated_at();

insert into public.app_settings (key, value, is_public, description)
values
  ('shopee_payment', '{"url":"https://shopee.co.id/","note":"Checkout nominal credit di Shopee, lalu kirim email akun Design Mudah melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.","contact":""}'::jsonb, true, 'Konfigurasi pembayaran manual Shopee'),
  ('app_status', '{"maintenance":false,"message":""}'::jsonb, true, 'Status aplikasi publik'),
  ('example_jobs', '{"sticker":null,"sablon":null}'::jsonb, true, 'Contoh gambar aktif untuk sticker dan sablon'),
  ('ai_redraw_model', '{"mode":"quality","preset":"quality","label":"Kualitas","provider":"vertex_hybrid_imagen3","analysisModel":"gemini-3-pro-preview","generationModel":"imagen-3.0-generate-002","aspectPolicy":"match_source","resolutionPolicy":"high","preprocess":"node_heuristic","persistPrompt":true,"retryOnLowConfidence":false,"estimatedUsdPerImage":0.045}'::jsonb, false, 'Pipeline hybrid redraw: Gemini director + Imagen 3 painter')
on conflict (key) do update
set value = case
      when public.app_settings.value is null or public.app_settings.value = '{}'::jsonb then excluded.value
      else public.app_settings.value
    end,
    is_public = excluded.is_public,
    description = excluded.description,
    updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'example-jobs',
  'example-jobs',
  true,
  26214400,
  array[
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'application/pdf',
    'application/zip',
    'application/json'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
on public.app_settings for select
to anon, authenticated
using (is_public = true or public.is_superuser(auth.uid()));

drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write"
on public.app_settings for all
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));;
