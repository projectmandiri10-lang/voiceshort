begin;

alter table public.generation_sessions
  add column if not exists include_subtitles boolean not null default false;

commit;
