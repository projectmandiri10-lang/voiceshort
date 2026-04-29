drop function if exists public.reserve_generate_credit(text);
drop function if exists public.refund_generate_credit(text, text);

create or replace function public.reserve_generate_credit(
  job_id text,
  target_user_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  next_balance integer;
  generate_price integer := 2000;
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

  if exists (
    select 1 from public.wallet_ledger
    where entry_type = 'generate_debit'
      and source_type = 'job'
      and source_id = job_id
      and owner_user_id = target_user_id
  ) then
    return current_profile;
  end if;

  if current_profile.wallet_balance_idr < generate_price then
    raise exception 'Saldo deposit tidak cukup. Top up minimal Rp2.000 untuk membuat 1 voice over.';
  end if;

  update public.profiles
  set wallet_balance_idr = wallet_balance_idr - generate_price,
      video_quota_used = video_quota_used + 1,
      updated_at = timezone('utc', now())
  where id = current_profile.id
  returning * into current_profile;

  next_balance := current_profile.wallet_balance_idr;

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
    next_balance,
    'generate_debit',
    'job',
    job_id,
    'Biaya generate voice over',
    jsonb_build_object('jobId', job_id, 'priceIdr', generate_price)
  );

  return current_profile;
end;
$$;

create or replace function public.refund_generate_credit(
  job_id text,
  target_user_id uuid,
  reason text default 'Refund generate voice over'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  debit_entry public.wallet_ledger;
  refund_amount integer;
begin
  if target_user_id is null then
    raise exception 'User tidak ditemukan.';
  end if;

  select *
  into debit_entry
  from public.wallet_ledger
  where entry_type = 'generate_debit'
    and source_type = 'job'
    and source_id = job_id
    and owner_user_id = target_user_id
  limit 1;

  select *
  into current_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'User tidak ditemukan.';
  end if;

  if debit_entry.id is null then
    return current_profile;
  end if;

  if exists (
    select 1 from public.wallet_ledger
    where entry_type = 'generate_refund'
      and source_type = 'job'
      and source_id = job_id
      and owner_user_id = target_user_id
  ) then
    return current_profile;
  end if;

  refund_amount := abs(debit_entry.amount_idr);

  update public.profiles
  set wallet_balance_idr = wallet_balance_idr + refund_amount,
      video_quota_used = greatest(video_quota_used - 1, 0),
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
    refund_amount,
    current_profile.wallet_balance_idr,
    'generate_refund',
    'job',
    job_id,
    coalesce(nullif(reason, ''), 'Refund generate voice over'),
    jsonb_build_object('jobId', job_id, 'debitLedgerId', debit_entry.id)
  );

  return current_profile;
end;
$$;

revoke execute on function public.reserve_generate_credit(text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_generate_credit(text, uuid) to service_role;

revoke execute on function public.refund_generate_credit(text, uuid, text) from public, anon, authenticated;
grant execute on function public.refund_generate_credit(text, uuid, text) to service_role;
