begin;

update public.app_settings
set
  script_provider = 'aivene',
  script_fallback_provider = 'aivene',
  script_model = 'gpt-4o-mini';

alter table public.app_settings
  alter column script_provider set default 'aivene',
  alter column script_fallback_provider set default 'aivene',
  alter column script_model set default 'gpt-4o-mini';

commit;
