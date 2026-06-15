begin;

alter table public.jobs
  add column if not exists social_platform text not null default 'lainnya' check (
    social_platform in ('facebook', 'tiktok', 'youtube', 'shopee', 'instagram', 'lainnya')
  );

alter table public.generation_sessions
  add column if not exists social_platform text not null default 'lainnya' check (
    social_platform in ('facebook', 'tiktok', 'youtube', 'shopee', 'instagram', 'lainnya')
  );

commit;
