begin;

alter table public.generation_sessions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

commit;
