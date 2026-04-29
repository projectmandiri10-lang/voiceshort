revoke execute on function public.credit_wallet_from_payment(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.credit_wallet_from_payment(uuid, jsonb) to service_role;

revoke execute on function public.reserve_generate_credit(text) from public, anon;
grant execute on function public.reserve_generate_credit(text) to authenticated, service_role;

revoke execute on function public.refund_generate_credit(text, text) from public, anon;
grant execute on function public.refund_generate_credit(text, text) to authenticated, service_role;

drop policy if exists payment_orders_select_owner_or_superadmin on public.payment_orders;
create policy payment_orders_select_owner_or_superadmin
on public.payment_orders
for select
to authenticated
using (owner_user_id = (select auth.uid()) or (select public.is_superadmin()));

drop policy if exists wallet_ledger_select_owner_or_superadmin on public.wallet_ledger;
create policy wallet_ledger_select_owner_or_superadmin
on public.wallet_ledger
for select
to authenticated
using (owner_user_id = (select auth.uid()) or (select public.is_superadmin()));

drop policy if exists webhook_events_no_user_access on public.webhook_events;
create policy webhook_events_no_user_access
on public.webhook_events
for select
to authenticated
using ((select public.is_superadmin()));
