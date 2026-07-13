alter table if exists public.generation_sessions
  add column if not exists content_language text not null default 'id-ID' check (
    content_language in ('id-ID', 'en-US')
  );;
