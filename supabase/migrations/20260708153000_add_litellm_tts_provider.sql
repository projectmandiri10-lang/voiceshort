alter table public.app_settings
  drop constraint if exists app_settings_tts_provider_check,
  drop constraint if exists app_settings_tts_fallback_provider_check;

update public.app_settings
set
  tts_provider = 'litellm',
  tts_fallback_provider = 'openrouter',
  tts_model = case
    when coalesce(nullif(tts_model, ''), '') in (
      '',
      'google/gemini-3.1-flash-tts-preview',
      'gemini-3.1-flash-tts-preview'
    ) then 'gemini/gemini-2.5-flash-preview-tts'
    else tts_model
  end
where settings_key = 'default';

alter table public.app_settings
  alter column tts_provider set default 'litellm',
  alter column tts_fallback_provider set default 'openrouter';

alter table public.app_settings
  add constraint app_settings_tts_provider_check
    check (tts_provider in ('gemini_direct', 'openrouter', 'litellm')),
  add constraint app_settings_tts_fallback_provider_check
    check (tts_fallback_provider in ('gemini_direct', 'openrouter', 'litellm'));
