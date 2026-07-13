begin;

alter table public.app_settings
  add column if not exists script_provider text,
  add column if not exists script_fallback_provider text,
  add column if not exists tts_provider text,
  add column if not exists tts_fallback_provider text;

update public.app_settings
set
  script_provider = coalesce(nullif(script_provider, ''), 'gemini_direct'),
  script_fallback_provider = coalesce(nullif(script_fallback_provider, ''), 'openrouter'),
  tts_provider = coalesce(nullif(tts_provider, ''), 'openrouter'),
  tts_fallback_provider = coalesce(nullif(tts_fallback_provider, ''), 'gemini_direct');

alter table public.app_settings
  alter column script_provider set default 'gemini_direct',
  alter column script_fallback_provider set default 'openrouter',
  alter column tts_provider set default 'openrouter',
  alter column tts_fallback_provider set default 'gemini_direct';

alter table public.app_settings
  alter column script_provider set not null,
  alter column script_fallback_provider set not null,
  alter column tts_provider set not null,
  alter column tts_fallback_provider set not null;

alter table public.app_settings
  drop constraint if exists app_settings_script_provider_check,
  drop constraint if exists app_settings_script_fallback_provider_check,
  drop constraint if exists app_settings_tts_provider_check,
  drop constraint if exists app_settings_tts_fallback_provider_check,
  add constraint app_settings_script_provider_check
    check (script_provider in ('gemini_direct', 'openrouter')),
  add constraint app_settings_script_fallback_provider_check
    check (script_fallback_provider in ('gemini_direct', 'openrouter')),
  add constraint app_settings_tts_provider_check
    check (tts_provider in ('gemini_direct', 'openrouter')),
  add constraint app_settings_tts_fallback_provider_check
    check (tts_fallback_provider in ('gemini_direct', 'openrouter'));

commit;;
