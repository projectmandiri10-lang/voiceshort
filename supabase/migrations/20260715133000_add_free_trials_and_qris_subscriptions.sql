begin;

alter table public.profiles
  add column if not exists free_analysis_used integer not null default 0,
  add column if not exists subscription_expires_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_free_analysis_used_check;

alter table public.profiles
  add constraint profiles_free_analysis_used_check
  check (free_analysis_used >= 0 and free_analysis_used <= 10);

alter table public.app_settings
  add column if not exists subscription_price_idr integer not null default 20000,
  add column if not exists subscription_days integer not null default 30,
  add column if not exists qris_merchant_name text not null default 'VoiceShort',
  add column if not exists qris_image_url text not null default '',
  add column if not exists qris_instructions text not null default 'Scan QRIS lalu bayar sesuai nominal unik sampai dua digit terakhir.';

alter table public.app_settings
  drop constraint if exists app_settings_subscription_price_idr_check,
  drop constraint if exists app_settings_subscription_days_check;

alter table public.app_settings
  add constraint app_settings_subscription_price_idr_check
    check (subscription_price_idr between 1000 and 10000000),
  add constraint app_settings_subscription_days_check
    check (subscription_days between 1 and 365);

create table if not exists public.analysis_access_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique,
  access_type text not null check (access_type in ('free', 'subscription', 'unlimited')),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'refunded')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists analysis_access_owner_created_idx
  on public.analysis_access_reservations(owner_user_id, created_at desc);

create table if not exists public.subscription_orders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  base_amount_idr integer not null check (base_amount_idr > 0),
  unique_code integer not null check (unique_code between 1 and 99),
  total_amount_idr integer not null check (total_amount_idr > 0),
  subscription_days integer not null check (subscription_days between 1 and 365),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'canceled')),
  expires_at timestamptz not null,
  paid_at timestamptz,
  subscription_expires_at timestamptz,
  raw_notification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists subscription_orders_pending_amount_uidx
  on public.subscription_orders(total_amount_idr)
  where status = 'pending';

create index if not exists subscription_orders_owner_created_idx
  on public.subscription_orders(owner_user_id, created_at desc);

create table if not exists public.qris_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payload_hash text not null unique,
  package_name text,
  amount_candidates jsonb not null default '[]'::jsonb,
  processing_status text not null check (processing_status in ('processed', 'ignored', 'failed')),
  reason text,
  subscription_order_id uuid references public.subscription_orders(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.reserve_analysis_access(
  target_user_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  existing_reservation public.analysis_access_reservations;
  next_access_type text;
  next_free_used integer;
begin
  select * into existing_reservation
  from public.analysis_access_reservations
  where session_id = target_session_id;

  if found then
    select free_analysis_used into next_free_used
    from public.profiles where id = target_user_id;
    return jsonb_build_object(
      'accessType', existing_reservation.access_type,
      'freeAnalysisUsed', coalesce(next_free_used, 0),
      'freeAnalysisRemaining', greatest(10 - coalesce(next_free_used, 0), 0)
    );
  end if;

  select * into current_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'Profil akun tidak ditemukan.';
  end if;

  if current_profile.role = 'superadmin' or current_profile.is_unlimited then
    next_access_type := 'unlimited';
  elsif current_profile.subscription_expires_at is not null
    and current_profile.subscription_expires_at > timezone('utc', now()) then
    next_access_type := 'subscription';
    update public.profiles
      set subscription_status = 'active', updated_at = timezone('utc', now())
      where id = target_user_id;
  elsif current_profile.free_analysis_used < 10 then
    next_access_type := 'free';
    update public.profiles
      set free_analysis_used = free_analysis_used + 1,
          subscription_status = 'inactive',
          updated_at = timezone('utc', now())
      where id = target_user_id
      returning free_analysis_used into next_free_used;
  else
    update public.profiles
      set subscription_status = 'inactive', updated_at = timezone('utc', now())
      where id = target_user_id;
    raise exception 'FREE_ANALYSIS_LIMIT_REACHED';
  end if;

  insert into public.analysis_access_reservations(owner_user_id, session_id, access_type)
  values (target_user_id, target_session_id, next_access_type);

  if next_free_used is null then
    next_free_used := current_profile.free_analysis_used;
  end if;

  return jsonb_build_object(
    'accessType', next_access_type,
    'freeAnalysisUsed', next_free_used,
    'freeAnalysisRemaining', greatest(10 - next_free_used, 0)
  );
end;
$$;

create or replace function public.complete_analysis_access(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.analysis_access_reservations
  set status = 'completed', updated_at = timezone('utc', now())
  where session_id = target_session_id and status = 'reserved';
end;
$$;

create or replace function public.release_analysis_access(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.analysis_access_reservations;
begin
  select * into reservation
  from public.analysis_access_reservations
  where session_id = target_session_id
  for update;

  if not found or reservation.status <> 'reserved' then
    return;
  end if;

  if reservation.access_type = 'free' then
    update public.profiles
    set free_analysis_used = greatest(free_analysis_used - 1, 0),
        updated_at = timezone('utc', now())
    where id = reservation.owner_user_id;
  end if;

  update public.analysis_access_reservations
  set status = 'refunded', updated_at = timezone('utc', now())
  where id = reservation.id;
end;
$$;

create or replace function public.create_subscription_order(
  target_user_id uuid,
  target_owner_email text,
  target_base_amount_idr integer,
  target_subscription_days integer,
  target_unique_code_min integer default 71,
  target_unique_code_max integer default 99,
  target_expiry_minutes integer default 30
)
returns public.subscription_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_code integer;
  created_order public.subscription_orders;
begin
  if target_base_amount_idr < 1000 then
    raise exception 'Harga langganan tidak valid.';
  end if;
  if target_unique_code_min < 1 or target_unique_code_max > 99 or target_unique_code_min > target_unique_code_max then
    raise exception 'Rentang kode unik tidak valid.';
  end if;

  perform pg_advisory_xact_lock(hashtext('voiceshort-subscription-qris'));

  update public.subscription_orders
  set status = 'expired', updated_at = timezone('utc', now())
  where status = 'pending' and expires_at <= timezone('utc', now());

  update public.subscription_orders
  set status = 'canceled', updated_at = timezone('utc', now())
  where owner_user_id = target_user_id and status = 'pending';

  for selected_code in target_unique_code_min..target_unique_code_max loop
    if not exists (
      select 1 from public.subscription_orders
      where status = 'pending'
        and total_amount_idr = target_base_amount_idr + selected_code
    ) then
      insert into public.subscription_orders(
        owner_user_id, owner_email, base_amount_idr, unique_code,
        total_amount_idr, subscription_days, expires_at
      ) values (
        target_user_id, lower(trim(target_owner_email)), target_base_amount_idr, selected_code,
        target_base_amount_idr + selected_code, target_subscription_days,
        timezone('utc', now()) + make_interval(mins => greatest(5, least(target_expiry_minutes, 120)))
      ) returning * into created_order;
      return created_order;
    end if;
  end loop;

  raise exception 'Semua nominal unik sedang digunakan. Coba lagi setelah invoice lain kedaluwarsa.';
end;
$$;

create or replace function public.settle_subscription_order(
  target_order_id uuid,
  webhook_payload jsonb default '{}'::jsonb
)
returns public.subscription_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.subscription_orders;
  next_expiry timestamptz;
begin
  select * into current_order
  from public.subscription_orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Invoice langganan tidak ditemukan.';
  end if;
  if current_order.status = 'paid' then
    return current_order;
  end if;
  if current_order.status <> 'pending' or current_order.expires_at <= timezone('utc', now()) then
    raise exception 'Invoice langganan tidak aktif.';
  end if;

  select
    (case
      when subscription_expires_at is not null and subscription_expires_at > timezone('utc', now())
        then subscription_expires_at
      else timezone('utc', now())
    end) + make_interval(days => current_order.subscription_days)
  into next_expiry
  from public.profiles
  where id = current_order.owner_user_id
  for update;

  if next_expiry is null then
    raise exception 'Profil pelanggan tidak ditemukan.';
  end if;

  update public.profiles
  set subscription_status = 'active',
      subscription_expires_at = next_expiry,
      updated_at = timezone('utc', now())
  where id = current_order.owner_user_id;

  update public.subscription_orders
  set status = 'paid',
      paid_at = timezone('utc', now()),
      subscription_expires_at = next_expiry,
      raw_notification = webhook_payload,
      updated_at = timezone('utc', now())
  where id = current_order.id
  returning * into current_order;

  return current_order;
end;
$$;

alter table public.analysis_access_reservations enable row level security;
alter table public.subscription_orders enable row level security;
alter table public.qris_webhook_events enable row level security;

drop policy if exists subscription_orders_select_owner_or_superadmin on public.subscription_orders;
create policy subscription_orders_select_owner_or_superadmin
on public.subscription_orders for select to authenticated
using (owner_user_id = auth.uid() or public.is_superadmin());

grant select on public.subscription_orders to authenticated;
grant all privileges on public.analysis_access_reservations to service_role;
grant all privileges on public.subscription_orders to service_role;
grant all privileges on public.qris_webhook_events to service_role;
revoke all on function public.reserve_analysis_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_analysis_access(uuid) from public, anon, authenticated;
revoke all on function public.release_analysis_access(uuid) from public, anon, authenticated;
revoke all on function public.create_subscription_order(uuid, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.settle_subscription_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_analysis_access(uuid, uuid) to service_role;
grant execute on function public.complete_analysis_access(uuid) to service_role;
grant execute on function public.release_analysis_access(uuid) to service_role;
grant execute on function public.create_subscription_order(uuid, text, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.settle_subscription_order(uuid, jsonb) to service_role;

commit;
