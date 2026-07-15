# VoiceShort Personal

Workspace untuk menganalisis video pendek dan menyiapkan paket teks Google AI Studio, naskah, caption, serta hashtag.

## Workflow

1. Upload video maksimal 60 detik dan isi judul, deskripsi, kategori, platform, tone, CTA, serta link referensi opsional.
2. Worker melakukan tepat dua request AI: visual brief, lalu paket `Scene`, `Sample Context`, naskah, caption, dan hashtag.
3. Hasil analisis langsung berstatus selesai dan seluruh teks dapat disalin dari halaman Generate atau Riwayat.

Video sumber tidak disimpan oleh Worker atau Supabase. Hanya frame terpilih yang dikirim ke Worker untuk dianalisis.

## Runtime

- Frontend dan API aktif: `apps/web` di Cloudflare Worker + Static Assets.
- Analisis utama: Aivene melalui `/chat/completions`.
- Setiap pengguna mendapat 10 analisis gratis dengan Aivene `qwen3.5-flash`.
- Setelah 10 gratis habis, pengguna melanjutkan dengan top up credit wallet dan tetap memakai model Aivene yang dipilih dari halaman Pengaturan AI.
- Fallback GLM-5V Turbo melalui API Z.AI direct hanya tersedia untuk superadmin.
- `apps/server` hanya server kompatibilitas; create/retry job lama merespons `410 Gone`.
- Generate session gratis menyimpan `charged_amount_idr = 0`, sedangkan generate berbayar memotong credit wallet sesuai `GENERATE_PRICE_IDR`.

## Environment

```env
AIVENE_API_KEY=your_aivene_api_key
AIVENE_BASE_URL=https://api.aivene.com/v1
AIVENE_SCRIPT_MODEL=qwen3.5-flash
AIVENE_REASONING_EFFORT=medium
ZAI_API_KEY=your_zai_api_key
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
ZAI_SCRIPT_MODEL=glm-5v-turbo
SCRIPT_PROVIDER=aivene
SCRIPT_FALLBACK_PROVIDER=zai
SUPABASE_URL=https://your_project_ref.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
INTERACTIVE_QRIS_WEBHOOK_SECRET=use_a_long_random_secret
INTERACTIVE_QRIS_SOURCE_PACKAGE=com.interactive.qrisid
INTERACTIVE_QRIS_UNIQUE_DIGITS=2
INTERACTIVE_QRIS_UNIQUE_CODE_MIN=71
INTERACTIVE_QRIS_UNIQUE_CODE_MAX=99
INTERACTIVE_QRIS_EXPIRY_MINUTES=60
INTERACTIVE_QRIS_TIME_ZONE=Asia/Jakarta
INTERACTIVE_QRIS_OPEN_HOUR=5
INTERACTIVE_QRIS_CLOSE_HOUR=22
VITE_SUPABASE_URL=https://your_project_ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

`AIVENE_API_KEY`, `ZAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, dan `INTERACTIVE_QRIS_WEBHOOK_SECRET` harus disimpan sebagai Cloudflare Worker secrets. Variabel non-secret sudah didefinisikan di `apps/web/wrangler.jsonc`. Model utama Aivene memakai `reasoning_effort` medium. Z.AI direct dengan `glm-5v-turbo` dibatasi hanya untuk fallback superadmin; seluruh user biasa dan user yang sudah top up selalu memakai Aivene saja.

## Top Up QRIS

Paket top up memakai nominal unik 2 digit `71-99`, berlaku 60 menit, dan hanya dapat dibuat pukul 05.00-21.59 WIB. Top up minimum adalah Rp2.000 untuk 1 generate. Notifikasi sukses dari InterActive QRIS diteruskan oleh MacroDroid ke webhook Worker dan langsung menambah credit wallet user. Konfigurasi lengkap tersedia di [MACRODROID_QRIS_SETUP.md](./MACRODROID_QRIS_SETUP.md).

## Commands

```bash
npm install
npm run test -w apps/web
npm run test -w apps/server
npm run build -w apps/web
npm run build -w apps/server
```

Migration QRIS terbaru: `supabase/migrations/20260715234500_migrate_interactive_qris_to_wallet_topups.sql`.
