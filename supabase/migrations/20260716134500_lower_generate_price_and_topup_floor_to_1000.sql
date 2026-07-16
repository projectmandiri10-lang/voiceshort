begin;

alter table public.payment_orders
  drop constraint if exists payment_orders_package_code_check;

alter table public.payment_orders
  add constraint payment_orders_package_code_check
  check (package_code in ('1_video', '5_video', '10_video', '50_video', '100_video'));

alter table public.profiles
  drop constraint if exists profiles_assigned_package_code_check;

alter table public.profiles
  add constraint profiles_assigned_package_code_check
  check (assigned_package_code is null or assigned_package_code in ('1_video', '5_video', '10_video', '50_video', '100_video', 'custom'));

create or replace function public.create_static_qris_payment_order(
  target_user_id uuid,
  target_owner_email text,
  target_package_code text,
  target_pay_amount_idr integer,
  target_credit_amount_idr integer,
  target_tax_rate_percent numeric default 0,
  target_tax_amount_idr integer default 0,
  target_merchant_order_id text default null,
  target_unique_code_min integer default 71,
  target_unique_code_max integer default 99,
  target_expiry_minutes integer default 60
)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_code integer;
  created_order public.payment_orders;
  base_total_amount integer;
  next_merchant_order_id text;
begin
  if target_pay_amount_idr < 1000 or target_credit_amount_idr < 1000 then
    raise exception 'Paket top up minimal Rp1.000.';
  end if;
  if target_unique_code_min < 1 or target_unique_code_max > 99 or target_unique_code_min > target_unique_code_max then
    raise exception 'Rentang kode unik tidak valid.';
  end if;

  base_total_amount := target_pay_amount_idr + greatest(coalesce(target_tax_amount_idr, 0), 0);
  next_merchant_order_id := coalesce(nullif(trim(target_merchant_order_id), ''), concat('VSQRIS-', extract(epoch from clock_timestamp())::bigint));

  perform pg_advisory_xact_lock(hashtext('voiceshort-topup-static-qris'));

  update public.payment_orders
  set status = 'expired',
      updated_at = timezone('utc', now())
  where provider = 'interactive_qris'
    and status = 'pending'
    and expired_at <= timezone('utc', now());

  update public.payment_orders
  set status = 'canceled',
      updated_at = timezone('utc', now())
  where provider = 'interactive_qris'
    and owner_user_id = target_user_id
    and status = 'pending';

  for selected_code in target_unique_code_min..target_unique_code_max loop
    if not exists (
      select 1
      from public.payment_orders
      where provider = 'interactive_qris'
        and status = 'pending'
        and total_amount_idr = base_total_amount + selected_code
    ) then
      insert into public.payment_orders(
        owner_user_id,
        owner_email,
        package_code,
        pay_amount_idr,
        credit_amount_idr,
        provider,
        merchant_order_id,
        unique_code,
        total_amount_idr,
        tax_rate_percent,
        tax_amount_idr,
        expired_at
      ) values (
        target_user_id,
        lower(trim(target_owner_email)),
        target_package_code,
        target_pay_amount_idr,
        target_credit_amount_idr,
        'interactive_qris',
        next_merchant_order_id,
        selected_code,
        base_total_amount + selected_code,
        greatest(coalesce(target_tax_rate_percent, 0), 0),
        greatest(coalesce(target_tax_amount_idr, 0), 0),
        timezone('utc', now()) + make_interval(mins => greatest(5, least(target_expiry_minutes, 120)))
      )
      returning * into created_order;

      return created_order;
    end if;
  end loop;

  raise exception 'Semua nominal unik sedang digunakan. Coba lagi setelah invoice lain kedaluwarsa.';
end;
$$;

revoke all on function public.create_static_qris_payment_order(uuid, text, text, integer, integer, numeric, integer, text, integer, integer, integer)
from public, anon, authenticated;

grant execute on function public.create_static_qris_payment_order(uuid, text, text, integer, integer, numeric, integer, text, integer, integer, integer)
to service_role;

create or replace function public.credit_wallet_from_payment(
  order_id uuid,
  webhook_payload jsonb default '{}'::jsonb
)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.payment_orders;
  updated_order public.payment_orders;
  next_balance integer;
  webhook_paid_at text;
begin
  select *
  into current_order
  from public.payment_orders
  where id = order_id
  for update;

  if not found then
    raise exception 'Payment order tidak ditemukan.';
  end if;

  if current_order.status = 'paid' then
    return current_order;
  end if;

  if current_order.status <> 'pending' then
    raise exception 'Payment order tidak pending.';
  end if;

  webhook_paid_at := nullif(webhook_payload #>> '{data,paid_at}', '');

  update public.profiles
  set wallet_balance_idr = wallet_balance_idr + current_order.credit_amount_idr,
      video_quota_total = video_quota_total + floor(current_order.credit_amount_idr / 1000.0)::integer,
      updated_at = timezone('utc', now())
  where id = current_order.owner_user_id
  returning wallet_balance_idr into next_balance;

  if next_balance is null then
    raise exception 'Profil pemilik payment tidak ditemukan.';
  end if;

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
    current_order.owner_user_id,
    current_order.owner_email,
    current_order.credit_amount_idr,
    next_balance,
    'deposit_credit',
    'payment_order',
    current_order.id::text,
    'Deposit WebQRIS berhasil',
    jsonb_build_object(
      'packageCode', current_order.package_code,
      'payAmountIdr', current_order.pay_amount_idr,
      'creditAmountIdr', current_order.credit_amount_idr,
      'webqrisInvoiceId', current_order.webqris_invoice_id,
      'merchantOrderId', current_order.merchant_order_id,
      'taxRatePercent', current_order.tax_rate_percent,
      'taxAmountIdr', current_order.tax_amount_idr
    )
  ) on conflict do nothing;

  update public.payment_orders
  set status = 'paid',
      paid_at = coalesce(webhook_paid_at::timestamptz, timezone('utc', now())),
      payment_method = coalesce(nullif(webhook_payload #>> '{data,payment_method}', ''), payment_method),
      raw_paid_webhook = webhook_payload,
      updated_at = timezone('utc', now())
  where id = current_order.id
  returning * into updated_order;

  return updated_order;
end;
$$;

create or replace function public.reserve_generate_credit(
  job_id text,
  target_user_id uuid,
  charge_amount_idr integer default 1000,
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
  generate_price integer := greatest(coalesce(charge_amount_idr, 1000), 0);
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
        'pricePerMinuteIdr', 1000,
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
      'pricePerMinuteIdr', 1000,
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
to service_role;

commit;
