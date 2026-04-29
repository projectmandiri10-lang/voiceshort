create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

revoke execute on function public.sync_profile_from_auth_user() from public, anon, authenticated;
grant execute on function public.sync_profile_from_auth_user() to service_role;

revoke execute on function public.reserve_video_quota() from public, anon, authenticated;
grant execute on function public.reserve_video_quota() to service_role;

revoke execute on function public.release_video_quota() from public, anon, authenticated;
grant execute on function public.release_video_quota() to service_role;

revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated, service_role;
