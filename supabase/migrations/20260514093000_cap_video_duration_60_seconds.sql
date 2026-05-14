alter table public.app_settings
drop constraint if exists app_settings_max_video_seconds_check;

update public.app_settings
set max_video_seconds = least(max_video_seconds, 60),
    updated_at = timezone('utc', now())
where max_video_seconds is not null
  and max_video_seconds > 60;

alter table public.app_settings
add constraint app_settings_max_video_seconds_check
check (max_video_seconds between 10 and 60);
