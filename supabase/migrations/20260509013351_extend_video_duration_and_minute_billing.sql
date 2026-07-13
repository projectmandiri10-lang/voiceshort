alter table public.app_settings
drop constraint if exists app_settings_max_video_seconds_check;

alter table public.app_settings
add constraint app_settings_max_video_seconds_check
check (max_video_seconds between 10 and 900);

update public.app_settings
set max_video_seconds = 900,
    updated_at = timezone('utc', now())
where settings_key = 'default'
  and max_video_seconds < 900;

drop function if exists public.reserve_generate_credit(text, uuid);

create or replace function public.reserve_generate_credit(
  job_id text,
  target_user_id uuid,
  charge_amount_idr integer default 2000,
  billed_minutes integer default 1,
  video_duration_sec double precision default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  generate_price integer := greatest(coalesce(charge_amount_idr, 2000), 0);
  normalized_billed_minutes integer := greatest(coalesce(billed_minutes, 1), 1);
  normalized_duration_sec double precision := case
    when video_duration_sec is null or video_duration_sec <= 0 then normalized_billed_minutes * 60
    else video_duration_sec
  end;
begin
  if target_user_id is null then
    raise exception 'User tidak ditemukan.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'User tidak ditemukan.';
  end if;

  if current_profile.disabled_at is not null then
    raise exception 'Akun sedang nonaktif. Hubungi admin untuk mengaktifkan kembali.';
  end if;

  if exists (
    select 1 from public.wallet_ledger
    where entry_type = 'generate_debit'
      and source_type = 'job'
      and source_id = job_id
      and owner_user_id = target_user_id
  ) then
    return current_profile;
  end if;

  if current_profile.is_unlimited then
    update public.profiles
    set video_quota_used = video_quota_used + 1,
        updated_at = timezone('utc', now())
    where id = current_profile.id
    returning * into current_profile;

    insert into public.wallet_ledger (
      owner_user_id,
      owner_email,
      amount_idr,
      balance_after_idr,
      entry_type,
      source_type,
      source_id,
      description,
      metadata
    ) values (
      current_profile.id,
      current_profile.email,
      0,
      current_profile.wallet_balance_idr,
      'generate_debit',
      'job',
      job_id,
      'Generate voice over unlimited',
      jsonb_build_object(
        'jobId', job_id,
        'priceIdr', 0,
        'pricePerMinuteIdr', 2000,
        'billedMinutes', normalized_billed_minutes,
        'videoDurationSec', normalized_duration_sec,
        'isUnlimited', true
      )
    );

    return current_profile;
  end if;

  if current_profile.wallet_balance_idr < generate_price then
    raise exception 'Saldo deposit tidak cukup. Video ini memerlukan Rp% untuk % menit billing.',
      generate_price,
      normalized_billed_minutes;
  end if;

  update public.profiles
  set wallet_balance_idr = wallet_balance_idr - generate_price,
      video_quota_used = video_quota_used + 1,
      updated_at = timezone('utc', now())
  where id = current_profile.id
  returning * into current_profile;

  insert into public.wallet_ledger (
    owner_user_id,
    owner_email,
    amount_idr,
    balance_after_idr,
    entry_type,
    source_type,
    source_id,
    description,
    metadata
  ) values (
    current_profile.id,
    current_profile.email,
    -generate_price,
    current_profile.wallet_balance_idr,
    'generate_debit',
    'job',
    job_id,
    format('Biaya generate voice over %s menit', normalized_billed_minutes),
    jsonb_build_object(
      'jobId', job_id,
      'priceIdr', generate_price,
      'pricePerMinuteIdr', 2000,
      'billedMinutes', normalized_billed_minutes,
      'videoDurationSec', normalized_duration_sec
    )
  );

  return current_profile;
end;
$$;

revoke execute on function public.reserve_generate_credit(text, uuid, integer, integer, double precision)
from public, anon, authenticated;

grant execute on function public.reserve_generate_credit(text, uuid, integer, integer, double precision)
to service_role;;
