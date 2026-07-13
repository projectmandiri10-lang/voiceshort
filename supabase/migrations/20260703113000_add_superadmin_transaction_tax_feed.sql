alter table public.app_settings
  add column if not exists tax_rate_percent numeric(5,2) not null default 0;
alter table public.app_settings
  drop constraint if exists app_settings_tax_rate_percent_check;
alter table public.app_settings
  add constraint app_settings_tax_rate_percent_check
  check (tax_rate_percent between 0 and 100);
alter table public.payment_orders
  add column if not exists tax_rate_percent numeric(5,2) not null default 0,
  add column if not exists tax_amount_idr integer not null default 0;
alter table public.payment_orders
  drop constraint if exists payment_orders_tax_rate_percent_check,
  drop constraint if exists payment_orders_tax_amount_idr_check;
alter table public.payment_orders
  add constraint payment_orders_tax_rate_percent_check
  check (tax_rate_percent between 0 and 100),
  add constraint payment_orders_tax_amount_idr_check
  check (tax_amount_idr >= 0);
create index if not exists payment_orders_created_at_idx
  on public.payment_orders (created_at desc);
create index if not exists wallet_ledger_created_at_idx
  on public.wallet_ledger (created_at desc);
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
create or replace function public.admin_transaction_feed(
  row_limit integer default 50,
  cursor_occurred_at timestamptz default null,
  cursor_transaction_id text default null
)
returns table (
  transaction_id text,
  kind text,
  status text,
  occurred_at timestamptz,
  owner_user_id uuid,
  owner_email text,
  gross_amount_idr integer,
  wallet_impact_idr integer,
  balance_after_idr integer,
  tax_rate_percent numeric(5,2),
  tax_amount_idr integer,
  net_amount_idr integer,
  entry_type text,
  source_type text,
  description text,
  payment_method text,
  merchant_order_id text,
  invoice_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with payment_rows as (
    select
      'payment_order:' || po.id::text as transaction_id,
      'payment'::text as kind,
      po.status,
      case when po.status = 'paid' then coalesce(po.paid_at, po.updated_at, po.created_at) else po.created_at end as occurred_at,
      po.owner_user_id,
      po.owner_email,
      po.pay_amount_idr as gross_amount_idr,
      case when po.status = 'paid' then po.credit_amount_idr else 0 end as wallet_impact_idr,
      case when po.status = 'paid' then wl.balance_after_idr else null end as balance_after_idr,
      coalesce(po.tax_rate_percent, 0)::numeric(5,2) as tax_rate_percent,
      coalesce(po.tax_amount_idr, 0) as tax_amount_idr,
      greatest(po.pay_amount_idr - coalesce(po.tax_amount_idr, 0), 0) as net_amount_idr,
      case when po.status = 'paid' then wl.entry_type else null end as entry_type,
      case when po.status = 'paid' then wl.source_type else 'payment_order' end as source_type,
      coalesce(
        wl.description,
        case po.status
          when 'pending' then 'Invoice top up menunggu pembayaran'
          when 'failed' then 'Invoice top up gagal dibuat'
          when 'expired' then 'Invoice top up kedaluwarsa'
          when 'canceled' then 'Invoice top up dibatalkan'
          else 'Top up QRIS'
        end
      ) as description,
      po.payment_method,
      po.merchant_order_id,
      po.webqris_invoice_id as invoice_id
    from public.payment_orders po
    left join public.wallet_ledger wl
      on wl.entry_type = 'deposit_credit'
     and wl.source_type = 'payment_order'
     and wl.source_id = po.id::text
  ),
  ledger_rows as (
    select
      'wallet_ledger:' || wl.id::text as transaction_id,
      case wl.entry_type
        when 'generate_debit' then 'generate'
        when 'generate_refund' then 'refund'
        else 'admin'
      end as kind,
      'posted'::text as status,
      wl.created_at as occurred_at,
      wl.owner_user_id,
      wl.owner_email,
      abs(wl.amount_idr) as gross_amount_idr,
      wl.amount_idr as wallet_impact_idr,
      wl.balance_after_idr,
      0::numeric(5,2) as tax_rate_percent,
      0 as tax_amount_idr,
      abs(wl.amount_idr) as net_amount_idr,
      wl.entry_type,
      wl.source_type,
      wl.description,
      null::text as payment_method,
      null::text as merchant_order_id,
      null::text as invoice_id
    from public.wallet_ledger wl
    where not (
      wl.entry_type = 'deposit_credit'
      and wl.source_type = 'payment_order'
    )
  ),
  combined_rows as (
    select * from payment_rows
    union all
    select * from ledger_rows
  )
  select
    transaction_id,
    kind,
    status,
    occurred_at,
    owner_user_id,
    owner_email,
    gross_amount_idr,
    wallet_impact_idr,
    balance_after_idr,
    tax_rate_percent,
    tax_amount_idr,
    net_amount_idr,
    entry_type,
    source_type,
    description,
    payment_method,
    merchant_order_id,
    invoice_id
  from combined_rows
  where (
    cursor_occurred_at is null
    or occurred_at < cursor_occurred_at
    or (
      occurred_at = cursor_occurred_at
      and transaction_id < coalesce(cursor_transaction_id, '')
    )
  )
  order by occurred_at desc, transaction_id desc
  limit greatest(1, least(coalesce(row_limit, 50), 100));
$$;
revoke execute on function public.admin_transaction_feed(integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.admin_transaction_feed(integer, timestamptz, text) to service_role;
