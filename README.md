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
- Pengguna biasa: Aivene `qwen3.5-flash` tanpa potongan saldo aplikasi.
- Superadmin: model Aivene yang dipilih dari halaman Pengaturan AI.
- Fallback analisis: GLM-5V Turbo melalui API Z.AI direct.
- `apps/server` hanya server kompatibilitas; create/retry job lama merespons `410 Gone`.
- Generate session pengguna biasa maupun superadmin tidak memotong saldo dan menyimpan `charged_amount_idr = 0`.

## Environment

```env
AIVENE_API_KEY=your_aivene_api_key
AIVENE_BASE_URL=https://api.aivene.com/v1
AIVENE_SCRIPT_MODEL=qwen3.7-plus
AIVENE_REASONING_EFFORT=medium
ZAI_API_KEY=your_zai_api_key
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
ZAI_SCRIPT_MODEL=glm-5v-turbo
SCRIPT_PROVIDER=aivene
SCRIPT_FALLBACK_PROVIDER=zai
SUPABASE_URL=https://your_project_ref.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VITE_SUPABASE_URL=https://your_project_ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

`AIVENE_API_KEY`, `ZAI_API_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` harus disimpan sebagai Cloudflare Worker secrets. Variabel non-secret sudah didefinisikan di `apps/web/wrangler.jsonc`. Model utama Aivene dipilih dari halaman Pengaturan AI superadmin dengan `reasoning_effort` medium; fallback tetap memakai `glm-5v-turbo` direct Z.AI.

## Commands

```bash
npm install
npm run test -w apps/web
npm run test -w apps/server
npm run build -w apps/web
npm run build -w apps/server
```

Migration workflow baru: `supabase/migrations/20260713233000_ai_studio_voice_upload_workflow.sql`.
