# Fallback: Backend Node di Google Cloud Run

Status panduan ini dicek pada `28 Mei 2026`.

Arsitektur utama repo sekarang adalah **Cloudflare Worker penuh**. Dokumen ini hanya dipakai jika nanti Anda memutuskan kembali ke backend Node karena membutuhkan:

- penyimpanan video asli/final di server
- final MP4 lintas perangkat
- render video di backend
- validasi media server-side

Untuk kebutuhan itu, fallback yang direkomendasikan adalah **Google Cloud Run**, bukan OCI.

## 1. Kapan memakai Cloud Run

Pilih jalur ini jika Anda ingin:

- `apps/web` tetap di Cloudflare
- `apps/server` aktif lagi sebagai backend Node
- `ffmpeg` dan `ffprobe` berjalan di container
- hasil render disimpan server-side

## 2. Env minimum backend

```txt
AIVENE_API_KEY=your_aivene_api_key
AIVENE_BASE_URL=https://api.aivene.com/v1
AIVENE_SCRIPT_MODEL=gemini-2.5-pro
AIVENE_TTS_MODEL=tts-1-hd
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_TTS_MODEL=google/gemini-3.1-flash-tts-preview
SUPABASE_URL=https://project-ref.supabase.co
SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
APP_STORAGE_ROOT=/tmp/voiceshort
WEB_ORIGIN=https://your-frontend.workers.dev
APP_WEB_URL=https://your-frontend.workers.dev
APP_PROD_WEB_URL=https://your-frontend.workers.dev
ADDITIONAL_REDIRECT_URLS=https://your-frontend.workers.dev
APP_API_URL=https://your-cloud-run-service-url
```

## 3. Build dan Container

```bash
npm install
npm run build -w apps/server
```

Deploykan `apps/server` dalam container Node yang juga menyediakan `ffmpeg` dan `ffprobe`.

## 4. Catatan Penting

- Cloud Run adalah fallback, bukan jalur default repo ini
- flow `generation_sessions` Worker tetap tidak otomatis berubah menjadi flow backend render
- jika Anda pindah ke Cloud Run nanti, API dan frontend kemungkinan perlu disesuaikan lagi

Untuk deploy default saat ini, gunakan `tutorial-cloudflare-workers-frontend.md`.
