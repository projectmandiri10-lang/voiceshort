# VoiceShort Personal

Workspace pribadi untuk menganalisis video pendek, menyiapkan paket teks Google AI Studio, lalu menggabungkan voice yang diunggah pengguna secara lokal di browser.

## Workflow

1. Upload video maksimal 60 detik dan isi judul, deskripsi, kategori, platform, tone, CTA, serta link referensi opsional.
2. Worker melakukan tepat dua request AI: visual brief, lalu paket `Scene`, `Sample Context`, naskah, caption, dan hashtag.
3. Salin tiga field ke Google AI Studio dan generate voice dengan instruksi durasi yang sudah disertakan.
4. Upload WAV, MP3, M4A/MP4 audio, atau OGG maksimal 25 MB.
5. Browser menggabungkan audio dan video dengan FFmpeg tanpa mengubah FPS sumber, lalu menampilkan hasil download, caption, hashtag, dan link. Subtitle dibuat melalui platform tujuan setelah upload.

File video, audio upload, dan video final disimpan di IndexedDB perangkat. Media tidak dikirim ke Worker atau Supabase.

## Runtime

- Frontend dan API aktif: `apps/web` di Cloudflare Worker + Static Assets.
- Analisis utama: Aivene melalui `/chat/completions`.
- Fallback analisis: GLM-5V Turbo melalui API Z.AI direct.
- `apps/server` hanya server kompatibilitas; create/retry job lama merespons `410 Gone`.
- Generate session tidak memotong saldo dan menyimpan `charged_amount_idr = 0`.

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
