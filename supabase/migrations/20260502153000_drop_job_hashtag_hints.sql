begin;

alter table public.jobs
  drop column if exists hashtag_hints;

commit;
