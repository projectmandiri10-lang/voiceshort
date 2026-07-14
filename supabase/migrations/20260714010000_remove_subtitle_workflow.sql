begin;

alter table public.generation_sessions
  drop column if exists include_subtitles;

commit;
