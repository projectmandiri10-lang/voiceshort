alter table public.profiles
  add column if not exists is_unlimited boolean not null default false,
  add column if not exists disabled_at timestamp with time zone null,
  add column if not exists disabled_reason text null,
  add column if not exists assigned_package_code text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_assigned_package_code_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_assigned_package_code_check
      check (assigned_package_code is null or assigned_package_code in ('10_video', '50_video', '100_video', 'custom'));
  end if;
end $$;

alter table public.wallet_ledger
  drop constraint if exists wallet_ledger_amount_idr_check;

alter table public.wallet_ledger
  add constraint wallet_ledger_amount_idr_check
  check (amount_idr <> 0 or entry_type = 'generate_debit');

update public.profiles
set role = 'superadmin',
    subscription_status = 'active',
    is_unlimited = true,
    disabled_at = null,
    disabled_reason = null,
    updated_at = timezone('utc', now())
where lower(email) = 'jho.j80@gmail.com';

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_email text := lower(coalesce(new.email, ''));
  next_display_name text := trim(
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1),
      coalesce(new.email, '')
    )
  );
  next_google_linked boolean := coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb;
  next_has_password boolean := coalesce(new.encrypted_password, '') <> '';
  is_bootstrap_superadmin boolean := next_email = 'jho.j80@gmail.com';
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    role,
    subscription_status,
    video_quota_total,
    video_quota_used,
    google_linked,
    has_password,
    is_unlimited,
    disabled_at,
    disabled_reason,
    assigned_package_code,
    created_at,
    updated_at
  )
  values (
    new.id,
    next_email,
    case when next_display_name = '' then next_email else next_display_name end,
    case when is_bootstrap_superadmin then 'superadmin' else 'user' end,
    case when is_bootstrap_superadmin then 'active' else 'inactive' end,
    case when is_bootstrap_superadmin then 1000 else 0 end,
    0,
    next_google_linked,
    next_has_password,
    is_bootstrap_superadmin,
    null,
    null,
    null,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      role = case
        when is_bootstrap_superadmin then 'superadmin'
        else public.profiles.role
      end,
      subscription_status = case
        when is_bootstrap_superadmin then 'active'
        else public.profiles.subscription_status
      end,
      video_quota_total = case
        when is_bootstrap_superadmin then greatest(public.profiles.video_quota_total, 1000)
        else public.profiles.video_quota_total
      end,
      google_linked = excluded.google_linked,
      has_password = excluded.has_password,
      is_unlimited = case
        when is_bootstrap_superadmin then true
        else public.profiles.is_unlimited
      end,
      disabled_at = case
        when is_bootstrap_superadmin then null
        else public.profiles.disabled_at
      end,
      disabled_reason = case
        when is_bootstrap_superadmin then null
        else public.profiles.disabled_reason
      end,
      updated_at = timezone('utc', now());

  return new;
end;
$$;

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
      jsonb_build_object('jobId', job_id, 'priceIdr', 0, 'isUnlimited', true)
    );

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
    'Biaya generate voice over',
    jsonb_build_object('jobId', job_id, 'priceIdr', generate_price)
  );

  return current_profile;
end;
$$;

create or replace function public.admin_grant_wallet_credit(
  target_user_id uuid,
  grant_amount_idr integer,
  package_code text default null,
  actor_email text default null,
  description text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  normalized_package text := nullif(package_code, '');
  normalized_description text := coalesce(nullif(description, ''), 'Penyesuaian saldo oleh admin');
begin
  if target_user_id is null then
    raise exception 'User tidak ditemukan.';
  end if;

  if grant_amount_idr is null or grant_amount_idr <= 0 then
    raise exception 'Nominal saldo harus lebih dari Rp0.';
  end if;

  if normalized_package is not null and normalized_package not in ('10_video', '50_video', '100_video', 'custom') then
    raise exception 'Kode paket tidak valid.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'User tidak ditemukan.';
  end if;

  update public.profiles
  set wallet_balance_idr = wallet_balance_idr + grant_amount_idr,
      assigned_package_code = coalesce(normalized_package, assigned_package_code),
      subscription_status = 'active',
      disabled_at = null,
      disabled_reason = null,
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
    grant_amount_idr,
    current_profile.wallet_balance_idr,
    'admin_adjustment',
    'admin',
    gen_random_uuid()::text,
    normalized_description,
    jsonb_build_object(
      'packageCode', normalized_package,
      'actorEmail', actor_email,
      'amountIdr', grant_amount_idr
    )
  );

  return current_profile;
end;
$$;

revoke execute on function public.admin_grant_wallet_credit(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_grant_wallet_credit(uuid, integer, text, text, text) to service_role;

revoke execute on function public.reserve_generate_credit(text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_generate_credit(text, uuid) to service_role;
