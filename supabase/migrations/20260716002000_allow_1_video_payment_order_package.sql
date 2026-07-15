begin;

alter table public.payment_orders
  drop constraint if exists payment_orders_package_code_check;

alter table public.payment_orders
  add constraint payment_orders_package_code_check
  check (package_code in ('1_video', '10_video', '50_video', '100_video'));

commit;
