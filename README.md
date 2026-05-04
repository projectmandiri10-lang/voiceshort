# General AI Voice Over Shorts App

Aplikasi untuk otomatisasi voice over general short-form berbahasa Indonesia dengan durasi maksimal 60 detik.

## Fungsi Utama

- Input: `video + judul + brief/deskripsi + kategori konten + gender suara + tone`
- Opsi tambahan: `CTA` dan `reference link`
- Output per job:
  - `caption.txt`
  - `final.mp4`

## Kategori Konten

- affiliate
- komedi
- informasi
- hiburan
- gaul
- cerita
- review-produk
- edukasi
- motivasi
- promosi-event

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Fastify + TypeScript
- AI: repo ini memakai LiteLLM proxy untuk mengakses model Gemini lewat endpoint OpenAI-compatible
- Media: `ffmpeg-static` + `ffprobe-static`
- Runtime: Node.js

## Struktur

- `apps/server`: API + processor job general
- `apps/web`: UI
- `data/settings.json`: konfigurasi model, batas durasi, dan default voice pria/wanita
- `data/jobs.json`: metadata job
- `outputs/<jobId>`: artifact hasil job
- `uploads/<jobId>`: source upload video

## Setup

1. Install dependency:
```bash
npm install
```
2. Buat `.env` dari contoh:
```bash
copy .env.example .env
```
3. `.env` lokal project ini saat ini memakai mode LiteLLM:
```env
AI_PROVIDER=litellm
LITELLM_BASE_URL=http://127.0.0.1:4000
LITELLM_API_KEY=
LITELLM_SCRIPT_MODEL=gemini/gemini-3-flash-preview
LITELLM_TTS_MODEL=gemini/gemini-2.5-pro-preview-tts
LITELLM_FILE_TARGET_MODEL=gemini/gemini-3-flash-preview
PORT=8788
WEB_ORIGIN=http://localhost:5174,http://192.168.1.20:5174
APP_WEB_URL=http://localhost:5174
APP_API_URL=http://localhost:8788
APP_PROD_WEB_URL=https://replace-me.example.com
ADDITIONAL_REDIRECT_URLS=http://127.0.0.1:5174,http://192.168.1.20:5174,https://replace-me.example.com
```
4. Isi juga env auth/storage yang memang dipakai backend saat startup:
- `SUPERADMIN_EMAIL`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
- `SUPERADMIN_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
5. Env billing seperti `WEBQRIS_*` dan `GENERATE_PRICE_IDR` bersifat opsional, tidak wajib untuk `.env` lokal default.

## Menjalankan (dev)

```bash
npm run dev
```

Default:

- Backend API: `http://localhost:8788`
- Frontend UI: `http://localhost:5174`

## LiteLLM Proxy

- Project ini sekarang mendukung LiteLLM proxy eksternal untuk seluruh flow Gemini: upload file, analisis visual, script, caption, dan TTS.
- Endpoint default yang diasumsikan di `.env` adalah `http://127.0.0.1:4000`.
- TTS default di mode LiteLLM diarahkan ke `gemini/gemini-2.5-pro-preview-tts` agar hasil voice over lebih natural dan realistis.
- `LITELLM_API_KEY` boleh kosong jika proxy lokal Anda tidak memakai auth.
- Seluruh request AI pada setup default repo ini diarahkan ke LiteLLM, bukan ke Gemini API direct.

Alternatif launcher Windows:

- `start-dev.bat`
- `start-server.bat`
- `start-frontend.bat`

## Menjalankan dari Laptop + Android (LAN)

1. Cari IP laptop di jaringan yang sama.
2. `.env` lokal repo ini memang sudah memakai format multi-origin seperti:
```env
WEB_ORIGIN=http://localhost:5174,http://192.168.1.20:5174
```
3. Sesuaikan IP LAN jika alamat laptop Anda berbeda.
4. Jalankan `npm run dev`.
5. Buka dari browser HP ke `http://<ip-laptop>:5174`.

## Menjalankan (build + start)

```bash
npm run build
npm run start
```

## API Ringkas

- `GET /api/health`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/tts/voices`
- `POST /api/tts/preview`
- `POST /api/jobs`
- `GET /api/jobs`
- `GET /api/jobs/:jobId`
- `PUT /api/jobs/:jobId`
- `DELETE /api/jobs/:jobId`
- `POST /api/jobs/:jobId/retry`
- `POST /api/jobs/:jobId/open-location`

## Catatan Operasional

- Bahasa utama: `id-ID`
- Batas durasi hard cap: `60 detik`
- V1 memakai single general job, bukan multi-platform batch
- Default voice diatur per gender pada halaman settings
- Mode default dan yang direkomendasikan untuk repo ini adalah `AI_PROVIDER=litellm`
- Di mode LiteLLM, model runtime script/TTS mengikuti env `LITELLM_SCRIPT_MODEL` dan `LITELLM_TTS_MODEL`
- Backend akan gagal boot jika `SUPABASE_URL`, `SUPABASE_ANON_KEY`, atau `SUPABASE_SERVICE_ROLE_KEY` belum diisi di `.env`
- `WEBQRIS_*` dan `GENERATE_PRICE_IDR` hanya dibutuhkan jika fitur billing/generate berbayar diaktifkan

## Testing

```bash
npm run test
```
