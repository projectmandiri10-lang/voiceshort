begin;

alter table public.app_settings
  drop constraint if exists app_settings_script_provider_check,
  drop constraint if exists app_settings_script_fallback_provider_check,
  drop constraint if exists app_settings_tts_provider_check,
  drop constraint if exists app_settings_tts_fallback_provider_check;

update public.app_settings
set
  script_provider = case
    when coalesce(nullif(script_provider, ''), 'aivene') in ('litellm', 'gemini_direct') then 'aivene'
    when script_provider = 'openrouter' then 'openrouter'
    else 'aivene'
  end,
  script_fallback_provider = case
    when coalesce(nullif(script_fallback_provider, ''), 'openrouter') in ('litellm', 'gemini_direct') then 'aivene'
    when script_fallback_provider = 'openrouter' then 'openrouter'
    else 'openrouter'
  end,
  script_model = case
    when coalesce(nullif(script_model, ''), '') in (
      '',
      'gemini-2.5-flash-lite',
      'google/gemini-2.5-flash-lite',
      'gemini/gemini-2.5-flash-lite',
      'gemini/gemini-3-flash-preview'
    ) then 'gemini-2.5-flash'
    else script_model
  end,
  tts_provider = case
    when coalesce(nullif(tts_provider, ''), 'aivene') in ('litellm', 'gemini_direct') then 'aivene'
    when tts_provider = 'openrouter' then 'openrouter'
    else 'aivene'
  end,
  tts_fallback_provider = case
    when coalesce(nullif(tts_fallback_provider, ''), 'openrouter') in ('litellm', 'gemini_direct') then 'aivene'
    when tts_fallback_provider = 'openrouter' then 'openrouter'
    else 'openrouter'
  end,
  tts_model = case
    when coalesce(nullif(tts_model, ''), '') in (
      '',
      'gemini-2.5-flash-preview-tts',
      'gemini-2.5-pro-preview-tts',
      'gemini-3.1-flash-tts-preview',
      'google/gemini-3.1-flash-tts-preview',
      'gemini/gemini-2.5-flash-preview-tts',
      'gemini/gemini-2.5-pro-preview-tts'
    ) then 'tts-1-hd'
    else tts_model
  end;

update public.app_settings
set
  script_fallback_provider = case
    when script_provider = 'aivene' then 'openrouter'
    else 'aivene'
  end
where script_fallback_provider = script_provider;

update public.app_settings
set
  tts_fallback_provider = case
    when tts_provider = 'aivene' then 'openrouter'
    else 'aivene'
  end
where tts_fallback_provider = tts_provider;

alter table public.app_settings
  alter column script_provider set default 'aivene',
  alter column script_fallback_provider set default 'openrouter',
  alter column tts_provider set default 'aivene',
  alter column tts_fallback_provider set default 'openrouter';

alter table public.app_settings
  add constraint app_settings_script_provider_check
    check (script_provider in ('aivene', 'openrouter')),
  add constraint app_settings_script_fallback_provider_check
    check (script_fallback_provider in ('aivene', 'openrouter')),
  add constraint app_settings_tts_provider_check
    check (tts_provider in ('aivene', 'openrouter')),
  add constraint app_settings_tts_fallback_provider_check
    check (tts_fallback_provider in ('aivene', 'openrouter'));

commit;
