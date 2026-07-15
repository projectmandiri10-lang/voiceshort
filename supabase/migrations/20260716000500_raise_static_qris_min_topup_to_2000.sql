begin;

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
  if target_pay_amount_idr < 2000 or target_credit_amount_idr < 2000 then
    raise exception 'Paket top up minimal Rp2.000.';
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

commit;
