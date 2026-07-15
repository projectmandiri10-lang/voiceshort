begin;

alter table public.app_settings
  alter column qris_merchant_name set default 'MEGAKOMINDO',
  alter column qris_image_url set default '/qris/megakomindo-qris.jpg';

update public.app_settings
set qris_merchant_name = 'MEGAKOMINDO',
    qris_image_url = '/qris/megakomindo-qris.jpg',
    qris_instructions = 'Scan QRIS lalu bayar tepat sesuai nominal unik. Invoice berlaku 60 menit.',
    updated_at = timezone('utc', now())
where settings_key = 'default';

commit;
