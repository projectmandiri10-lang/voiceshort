begin;

alter table public.app_settings
  add column if not exists qris_manual_override text,
  add column if not exists qris_manual_override_until timestamptz;

alter table public.app_settings
  drop constraint if exists app_settings_qris_manual_override_check;

alter table public.app_settings
  add constraint app_settings_qris_manual_override_check
  check (qris_manual_override is null or qris_manual_override in ('open', 'closed'));

commit;
