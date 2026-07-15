begin;

alter table public.app_settings
  drop constraint if exists app_settings_script_provider_check,
  drop constraint if exists app_settings_script_fallback_provider_check;

update public.app_settings
set
  script_provider = 'aivene',
  script_fallback_provider = 'zai',
  script_model = case
    when script_model in ('qwen3.5-flash', 'qwen3.6-plus', 'qwen3.7-plus') then script_model
    else 'qwen3.7-plus'
  end;

alter table public.app_settings
  alter column script_provider set default 'aivene',
  alter column script_fallback_provider set default 'zai',
  alter column script_model set default 'qwen3.7-plus';

alter table public.app_settings
  add constraint app_settings_script_provider_check
    check (script_provider in ('aivene', 'zai')),
  add constraint app_settings_script_fallback_provider_check
    check (script_fallback_provider in ('aivene', 'zai'));

commit;
