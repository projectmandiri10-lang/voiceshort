begin;

update public.app_settings
set script_model = 'gemini-2.5-flash'
where script_provider = 'aivene'
  and coalesce(nullif(script_model, ''), '') in (
    '',
    'gemini-2.5-flash-lite',
    'google/gemini-2.5-flash-lite',
    'gemini/gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini/gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini/gemini-3.1-pro-preview'
  );

update public.app_settings
set tts_model = 'tts-1-hd'
where tts_provider = 'aivene'
  and coalesce(nullif(tts_model, ''), '') in (
    '',
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-pro-preview-tts',
    'gemini-3.1-flash-tts-preview',
    'google/gemini-3.1-flash-tts-preview',
    'gemini/gemini-2.5-flash-preview-tts',
    'gemini/gemini-2.5-pro-preview-tts',
    'vertex_ai/gemini-2.5-pro-tts'
  );

commit;
