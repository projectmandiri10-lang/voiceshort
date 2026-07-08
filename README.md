# VoiceOver Shorts 60

Aplikasi untuk membuat voice over Bahasa Indonesia untuk video pendek sampai `60 detik` dengan arsitektur **Cloudflare Worker penuh**.

## Arsitektur Aktif

- `apps/web` adalah aplikasi utama:
  - frontend React + Vite
  - Cloudflare Worker untuk route `/api/*`
  - static assets Vite dilayani dari origin yang sama
- Browser melakukan:
  - baca durasi video lokal
  - ekstraksi frame via `video + canvas`
  - render `final.mp4` lokal via `ffmpeg.wasm`
- Worker melakukan:
  - auth/session via Supabase token
  - generate visual brief, script, caption, dan hashtag via provider text yang dipilih (`LiteLLM`, `Gemini Direct`, atau `OpenRouter`)
  - generate voice over via provider TTS yang dipilih (`LiteLLM`, `Gemini Direct`, atau `OpenRouter`)
  - billing flat per generate
  - simpan metadata history ke Supabase `generation_sessions`
- Video asli dan `final.mp4` tidak disimpan permanen di server.

`apps/server` masih ada sebagai jalur legacy/arsip dan bukan target deploy utama lagi.

## Struktur Repo

- `apps/web`: frontend + Worker API aktif
- `apps/server`: backend Node lama, hanya untuk fallback/arsip
- `supabase/migrations`: migration schema aplikasi
- `tutorial-cloudflare-workers-frontend.md`: panduan deploy Cloudflare Worker penuh
- `tutorial.md`: fallback jika nanti ingin backend Node di Cloud Run
- `tutorial-oracle-cloud-oci.md`: catatan legacy OCI

## Env yang Dipakai

Untuk Worker / `wrangler`:

```env
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
LITELLM_BASE_URL=https://your-litellm-host
LITELLM_API_KEY=your_litellm_secret_key
LITELLM_TTS_MODEL=gemini/gemini-2.5-flash-preview-tts
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_publishable_or_anon_key
GENERATE_PRICE_IDR=2000
```

Untuk build frontend:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
VITE_API_BASE=http://localhost:8787
```

Catatan:

- Default aktif tetap kompatibel dengan perilaku lama:
  - provider script utama: `litellm`
  - provider TTS utama: `litellm`
  - fallback TTS utama: `openrouter`
- Superadmin sekarang dapat memilih provider utama dan fallback terpisah untuk script dan TTS dari halaman `Pengaturan`.
- `VITE_API_BASE` hanya berguna untuk local dev saat Vite dan Worker berjalan di port berbeda.
- Di production single-origin, frontend otomatis memakai origin Worker yang sama.
- `WEBQRIS_*` hanya dibutuhkan jika billing QRIS diaktifkan.

## Setup Lokal

1. Install dependency:

```bash
npm install
```

2. Buat `.env`:

```bash
copy .env.example .env
```

3. Isi minimal:

```env
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
LITELLM_BASE_URL=https://your-litellm-host
LITELLM_API_KEY=your_litellm_secret_key
LITELLM_TTS_MODEL=gemini/gemini-2.5-flash-preview-tts
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_publishable_or_anon_key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
VITE_API_BASE=http://localhost:8787
```

Jika Anda juga menjalankan `apps/server` legacy, tambahkan env berikut:

```env
AI_PROVIDER=litellm
SCRIPT_PROVIDER=litellm
SCRIPT_FALLBACK_PROVIDER=openrouter
LITELLM_SCRIPT_MODEL=gemini/gemini-2.5-flash-lite
TTS_PROVIDER=litellm
TTS_FALLBACK_PROVIDER=openrouter
LITELLM_TTS_MODEL=gemini/gemini-2.5-flash-preview-tts
OPENROUTER_TTS_MODEL=google/gemini-3.1-flash-tts-preview
```

4. Jalankan UI Vite:

```bash
npm run dev -w apps/web
```

5. Jalankan Worker API di terminal kedua:

```bash
npm run dev:worker -w apps/web
```

Default lokal:

- frontend: `http://localhost:5174`
- Worker API: `http://localhost:8787`

## Build dan Deploy

Build frontend:

```bash
npm run build -w apps/web
```

Deploy Worker:

```bash
cd apps/web
npx wrangler deploy
```

Panduan langkah demi langkah ada di `tutorial-cloudflare-workers-frontend.md`.

## API Ringkas

- `GET /api/health`
- `GET /api/auth/session`
- `GET /api/tts/voices`
- `POST /api/tts/preview`
- `GET /api/billing/wallet`
- `POST /api/billing/topups`
- `GET /api/billing/topups/:id/status`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:email`
- `DELETE /api/admin/users/:email`
- `POST /api/admin/users/:email/package-grants`
- `GET /api/generation-sessions`
- `POST /api/generation-sessions`
- `GET /api/generation-sessions/:id`
- `POST /api/generation-sessions/:id/tts`
- `POST /api/generation-sessions/:id/complete`
- `POST /api/generation-sessions/:id/fail`

Route `/api/jobs*`, SSE progress, server-side download artifact, dan `open-location` sekarang dianggap legacy.

## Catatan Operasional

- Hard cap video: `60 detik`
- Billing default: `Rp2.000/generate`
- Default provider split:
  - script/caption/visual brief: `LiteLLM`
  - TTS: `LiteLLM`
  - fallback TTS: `OpenRouter`
- Fallback otomatis tersedia untuk script dan TTS bila provider utama gagal.
- Frame analisis: JPEG terkompresi, lebar maksimal `448px`
- Final MP4 hanya tersedia di browser yang sama kecuali user mengunduhnya
- Retry render lokal memanfaatkan cache IndexedDB agar tidak charge ulang

## Testing

```bash
npm run test -w apps/web
```
