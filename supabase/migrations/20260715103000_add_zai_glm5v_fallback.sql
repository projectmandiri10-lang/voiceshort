begin;

alter table public.app_settings
  drop constraint if exists app_settings_script_provider_check,
  drop constraint if exists app_settings_script_fallback_provider_check;

update public.app_settings
set
  script_provider = 'aivene',
  script_fallback_provider = 'zai',
  script_model = case
    when script_model in ('gpt-5.4-nano') then script_model
    else 'gpt-5.4-nano'
  end;

alter table public.app_settings
  alter column script_provider set default 'aivene',
  alter column script_fallback_provider set default 'zai',
  alter column script_model set default 'gpt-5.4-nano';

alter table public.app_settings
  add constraint app_settings_script_provider_check
    check (script_provider in ('aivene', 'zai')),
  add constraint app_settings_script_fallback_provider_check
    check (script_fallback_provider in ('aivene', 'zai'));

commit;
