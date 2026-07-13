begin;
alter table public.generation_sessions
  add column if not exists script_mode text not null default 'auto_analysis' check (
    script_mode in ('auto_analysis', 'manual_script')
  );
alter table public.generation_sessions
  drop constraint if exists generation_sessions_frame_count_check;
alter table public.generation_sessions
  add constraint generation_sessions_frame_count_check
  check (frame_count between 0 and 24);
commit;
