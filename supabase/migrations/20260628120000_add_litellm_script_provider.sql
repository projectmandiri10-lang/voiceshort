begin;

alter table public.app_settings
  drop constraint if exists app_settings_script_provider_check,
  drop constraint if exists app_settings_script_fallback_provider_check;

update public.app_settings
set
  script_provider = 'litellm',
  script_fallback_provider = 'openrouter'
where settings_key = 'default';

alter table public.app_settings
  alter column script_provider set default 'litellm',
  alter column script_fallback_provider set default 'openrouter';

alter table public.app_settings
  add constraint app_settings_script_provider_check
    check (script_provider in ('gemini_direct', 'openrouter', 'litellm')),
  add constraint app_settings_script_fallback_provider_check
    check (script_fallback_provider in ('gemini_direct', 'openrouter', 'litellm'));

commit;
