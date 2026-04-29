create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists wallet_balance_idr integer not null default 0;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  package_code text not null check (package_code in ('10_video', '50_video', '100_video')),
  pay_amount_idr integer not null check (pay_amount_idr > 0),
  credit_amount_idr integer not null check (credit_amount_idr > 0),
  provider text not null default 'webqris' check (provider = 'webqris'),
  merchant_order_id text not null,
  webqris_invoice_id text,
  qris_payload text,
  unique_code integer,
  total_amount_idr integer,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed', 'canceled')),
  expired_at timestamptz,
  paid_at timestamptz,
  payment_method text,
  raw_create_response jsonb,
  raw_paid_webhook jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists payment_orders_provider_merchant_order_id_uidx
  on public.payment_orders(provider, merchant_order_id);

create unique index if not exists payment_orders_webqris_invoice_id_uidx
  on public.payment_orders(webqris_invoice_id)
  where webqris_invoice_id is not null;

create index if not exists payment_orders_owner_created_at_idx
  on public.payment_orders(owner_user_id, created_at desc);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  amount_idr integer not null check (amount_idr <> 0),
  balance_after_idr integer not null check (balance_after_idr >= 0),
  entry_type text not null check (entry_type in ('deposit_credit', 'generate_debit', 'generate_refund', 'admin_adjustment')),
  source_type text not null check (source_type in ('payment_order', 'job', 'admin')),
  source_id text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists wallet_ledger_entry_source_uidx
  on public.wallet_ledger(entry_type, source_type, source_id)
  where source_id is not null;

create index if not exists wallet_ledger_owner_created_at_idx
  on public.wallet_ledger(owner_user_id, created_at desc);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'webqris' check (provider = 'webqris'),
  event_type text,
  signature text,
  invoice_id text,
  merchant_order_id text,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'failed', 'ignored')),
  error_message text,
  raw_body text not null,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

create index if not exists webhook_events_invoice_created_at_idx
  on public.webhook_events(invoice_id, created_at desc);

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
      video_quota_total = video_quota_total + floor(current_order.credit_amount_idr / 2000.0)::integer,
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
      'merchantOrderId', current_order.merchant_order_id
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

create or replace function public.reserve_generate_credit(job_id text)
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
  if auth.uid() is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'User tidak ditemukan.';
  end if;

  if exists (
    select 1 from public.wallet_ledger
    where entry_type = 'generate_debit'
      and source_type = 'job'
      and source_id = job_id
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
  if auth.uid() is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;

  select *
  into debit_entry
  from public.wallet_ledger
  where entry_type = 'generate_debit'
    and source_type = 'job'
    and source_id = job_id
    and owner_user_id = auth.uid()
  limit 1;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
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
      and owner_user_id = auth.uid()
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

alter table public.payment_orders enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists payment_orders_select_owner_or_superadmin on public.payment_orders;
create policy payment_orders_select_owner_or_superadmin
on public.payment_orders
for select
to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin());

drop policy if exists wallet_ledger_select_owner_or_superadmin on public.wallet_ledger;
create policy wallet_ledger_select_owner_or_superadmin
on public.wallet_ledger
for select
to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin());

drop policy if exists webhook_events_no_user_access on public.webhook_events;
create policy webhook_events_no_user_access
on public.webhook_events
for select
to authenticated
using (public.is_superadmin());

grant select on public.payment_orders to authenticated;
grant select on public.wallet_ledger to authenticated;
grant select on public.webhook_events to authenticated;
grant all privileges on public.payment_orders to service_role;
grant all privileges on public.wallet_ledger to service_role;
grant all privileges on public.webhook_events to service_role;
grant execute on function public.credit_wallet_from_payment(uuid, jsonb) to service_role;
grant execute on function public.reserve_generate_credit(text) to authenticated, service_role;
grant execute on function public.refund_generate_credit(text, text) to authenticated, service_role;
