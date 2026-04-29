begin;

alter table public.jobs
  add column if not exists hashtag_hints text[];

commit;
