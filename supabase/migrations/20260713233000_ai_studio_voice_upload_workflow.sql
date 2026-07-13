begin;

alter table public.generation_sessions
  add column if not exists visual_brief jsonb,
  add column if not exists scene_text text,
  add column if not exists sample_context_text text;

alter table public.generation_sessions
  drop constraint if exists generation_sessions_status_check;

update public.generation_sessions
set status = 'ready_for_voice_upload'
where status in ('ready_for_audio', 'ready_for_render');

alter table public.generation_sessions
  add constraint generation_sessions_status_check
  check (status in ('creating', 'ready_for_voice_upload', 'completed', 'failed')),
  drop column if exists script_mode,
  drop column if exists voice_gender,
  drop column if exists voice_name,
  drop column if exists speech_rate;

alter table public.app_settings
  drop constraint if exists app_settings_tts_provider_check,
  drop constraint if exists app_settings_tts_fallback_provider_check,
  drop column if exists tts_provider,
  drop column if exists tts_fallback_provider,
  drop column if exists tts_model,
  drop column if exists gender_voices;

commit;
