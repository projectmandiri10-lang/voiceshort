begin;

update public.generation_sessions
set
  status = 'completed',
  completed_at = coalesce(completed_at, updated_at, now()),
  error_message = null
where status = 'ready_for_voice_upload';

alter table public.generation_sessions
  drop constraint if exists generation_sessions_status_check;

alter table public.generation_sessions
  add constraint generation_sessions_status_check
  check (status in ('creating', 'completed', 'failed'));

commit;
