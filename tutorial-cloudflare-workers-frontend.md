# Tutorial Deploy `voiceshort` ke Cloudflare Worker Penuh

Status panduan ini dicek pada `28 Mei 2026`.

Nama file ini dipertahankan agar kompatibel dengan repo lama, tetapi isinya sekarang menjelaskan deploy **single Cloudflare Worker app** untuk frontend dan API sekaligus.

## 1. Arsitektur Target

- `apps/web` menjadi aplikasi utama
- Cloudflare Worker menangani `/api/*`
- static assets Vite dilayani dari binding `ASSETS`
- browser mengekstrak frame video dan merender `final.mp4` lokal
- Supabase dipakai untuk auth, profile, wallet, settings, dan history metadata
- Gemini dipanggil langsung dari Worker via REST untuk teks/analisis, sementara TTS memakai OpenRouter Gemini TTS

Video asli dan final MP4 tidak disimpan permanen di server.

## 2. Prasyarat

Siapkan:

- akun Cloudflare
- `wrangler` CLI
- project Supabase aktif
- Gemini API key aktif
- OpenRouter API key aktif
- migration `generation_sessions` sudah diterapkan

## 3. File yang Dipakai

- `apps/web/src/worker.ts`
- `apps/web/src/worker-api.ts`
- `apps/web/wrangler.jsonc`
- `apps/web/dist`
- `supabase/migrations/20260528144734_add_generation_sessions.sql`

`wrangler.jsonc` saat ini sudah mengatur:

- `main = "./src/worker.ts"`
- `assets.directory = "./dist"`
- SPA fallback
- `run_worker_first = ["/api/*"]`

## 4. Env dan Secrets

Worker secrets:

```txt
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
SUPABASE_URL=https://project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_publishable_or_anon_key
GENERATE_PRICE_IDR=2000
```

Opsional:

```txt
WEBQRIS_BASE_URL=https://webqris.com
WEBQRIS_API_TOKEN=your_webqris_api_token
WEBQRIS_WEBHOOK_SECRET=your_webqris_webhook_secret
```

Env build frontend:

```txt
VITE_SUPABASE_URL=https://project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
VITE_API_BASE=http://localhost:8787
```

Catatan:

- `VITE_API_BASE` hanya untuk local dev saat origin Vite dan Worker berbeda
- production single-origin tidak membutuhkan `VITE_API_BASE`

## 5. Local Development

Terminal 1:

```bash
npm run dev -w apps/web
```

Terminal 2:

```bash
npm run dev:worker -w apps/web
```

Default lokal:

- Vite UI: `http://localhost:5174`
- Worker API: `http://localhost:8787`

## 6. Build

```bash
npm run build -w apps/web
```

Pastikan folder ini ada:

```txt
apps/web/dist
```

## 7. Set Secret di Cloudflare

Contoh:

```bash
cd apps/web
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SUPABASE_ANON_KEY
```

Jika QRIS aktif, set juga `WEBQRIS_*`.

## 8. Deploy

```bash
cd apps/web
npx wrangler deploy
```

## 9. Verifikasi

Checklist:

1. buka URL Worker
2. login Supabase berhasil
3. upload video lokal
4. frame extraction berjalan di browser
5. Worker menghasilkan script/caption/session
6. TTS berhasil
7. final MP4 selesai dirender lokal
8. riwayat session tetap tampil setelah reload

## 10. Endpoint Baru

- `POST /api/generation-sessions`
- `POST /api/generation-sessions/:id/tts`
- `POST /api/generation-sessions/:id/complete`
- `POST /api/generation-sessions/:id/fail`
- `GET /api/generation-sessions`
- `GET /api/generation-sessions/:id`

Route `jobs` lama, SSE, dan download artifact server-side tidak dipakai lagi.

## 11. Troubleshooting

### UI bisa dibuka tapi API 401

Periksa:

- session Supabase di browser
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Generate gagal sebelum session tersimpan

Periksa:

- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`
- `GENERATE_PRICE_IDR`
- migration `generation_sessions`

### Final MP4 tidak bisa diunduh di perangkat lain

Perilaku ini memang desain baru:

- final MP4 dirender dan disimpan lokal di browser yang sama
- untuk lintas perangkat, user perlu unduh file secara manual atau nanti pindah ke backend render terpisah
