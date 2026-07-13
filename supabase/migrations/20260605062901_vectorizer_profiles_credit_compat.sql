create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name') then
    alter table public.profiles alter column display_name set default '';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'subscription_status') then
    alter table public.profiles alter column subscription_status set default 'active';
  end if;
end $$;

update public.profiles
set
  full_name = coalesce(full_name, display_name, email),
  is_active = coalesce(is_active, disabled_at is null),
  deleted_at = coalesce(deleted_at, disabled_at)
where full_name is null
   or is_active is null
   or (deleted_at is null and disabled_at is not null);

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'superuser', 'superadmin'));

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_idr integer not null,
  kind text not null check (kind in ('credit', 'debit')),
  reason text not null,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  marketplace text not null default 'shopee',
  order_ref text,
  amount_idr integer not null check (amount_idr > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rejected_reason text
);

create table if not exists public.pricing_rules (
  key text primary key,
  amount_idr integer not null check (amount_idr >= 0),
  active boolean not null default true,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.pricing_rules (key, amount_idr, description)
values
  ('ready_trace', 1000, 'Gambar sudah rapi dan langsung trace'),
  ('ai_redraw', 5000, 'Gambar ulang otomatis'),
  ('separation_film', 1000, 'Setiap satu warna film separasi sablon')
on conflict (key) do update
set amount_idr = excluded.amount_idr,
    description = excluded.description,
    updated_at = now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists manual_payments_touch_updated_at on public.manual_payments;
create trigger manual_payments_touch_updated_at
before update on public.manual_payments
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
set search_path = public
language plpgsql
security definer
as $$
declare
  user_email text := lower(coalesce(new.email, ''));
begin
  insert into public.profiles (id, email, full_name, role, is_unlimited, is_active, deleted_at)
  values (
    new.id,
    user_email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', user_email),
    case when user_email = 'jho.j80@gmail.com' then 'superuser' else 'user' end,
    user_email = 'jho.j80@gmail.com',
    true,
    null
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = case when excluded.email = 'jho.j80@gmail.com' then 'superuser' else public.profiles.role end,
        is_unlimited = case when excluded.email = 'jho.j80@gmail.com' then true else public.profiles.is_unlimited end,
        is_active = coalesce(public.profiles.is_active, true),
        deleted_at = case when excluded.email = 'jho.j80@gmail.com' then null else public.profiles.deleted_at end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name, role, is_unlimited, is_active, deleted_at)
select
  id,
  lower(coalesce(email, '')),
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email),
  case when lower(coalesce(email, '')) = 'jho.j80@gmail.com' then 'superuser' else 'user' end,
  lower(coalesce(email, '')) = 'jho.j80@gmail.com',
  true,
  null
from auth.users
where email is not null
on conflict (id) do update
set email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    role = case when excluded.email = 'jho.j80@gmail.com' then 'superuser' else public.profiles.role end,
    is_unlimited = case when excluded.email = 'jho.j80@gmail.com' then true else public.profiles.is_unlimited end,
    is_active = coalesce(public.profiles.is_active, true);

create or replace function public.is_superuser(target_user_id uuid default auth.uid())
returns boolean
set search_path = public
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and role in ('superuser', 'superadmin')
      and is_active = true
      and deleted_at is null
  );
$$;

create or replace function public.credit_balance(target_user_id uuid)
returns integer
set search_path = public
language sql
security definer
stable
as $$
  select coalesce(sum(amount_idr), 0)::integer
  from public.credit_ledger
  where user_id = target_user_id;
$$;

alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.manual_payments enable row level security;
alter table public.pricing_rules enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_superuser(auth.uid()));

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
on public.profiles for update
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

drop policy if exists "credit_select_own_or_admin" on public.credit_ledger;
create policy "credit_select_own_or_admin"
on public.credit_ledger for select
to authenticated
using (user_id = auth.uid() or public.is_superuser(auth.uid()));

drop policy if exists "manual_payments_select_own_or_admin" on public.manual_payments;
create policy "manual_payments_select_own_or_admin"
on public.manual_payments for select
to authenticated
using (user_id = auth.uid() or public.is_superuser(auth.uid()));

drop policy if exists "manual_payments_insert_own" on public.manual_payments;
create policy "manual_payments_insert_own"
on public.manual_payments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "pricing_rules_read" on public.pricing_rules;
create policy "pricing_rules_read"
on public.pricing_rules for select
to authenticated
using (active = true or public.is_superuser(auth.uid()));

drop policy if exists "pricing_rules_admin_write" on public.pricing_rules;
create policy "pricing_rules_admin_write"
on public.pricing_rules for all
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

create index if not exists credit_ledger_user_created_idx on public.credit_ledger (user_id, created_at desc);
create index if not exists manual_payments_user_created_idx on public.manual_payments (user_id, created_at desc);
create index if not exists manual_payments_status_created_idx on public.manual_payments (status, created_at desc);;
