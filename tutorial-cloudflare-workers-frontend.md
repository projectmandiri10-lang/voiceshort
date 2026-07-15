# Deploy Cloudflare Worker

Runtime aktif berada di `apps/web` dan memakai Cloudflare Worker dengan Static Assets.

## Variabel non-secret

`apps/web/wrangler.jsonc` menyimpan:

- `SCRIPT_PROVIDER=aivene`
- `SCRIPT_FALLBACK_PROVIDER=zai`
- `AIVENE_BASE_URL=https://api.aivene.com/v1`
- `AIVENE_SCRIPT_MODEL=qwen3.7-plus`
- `AIVENE_REASONING_EFFORT=medium`
- `ZAI_BASE_URL=https://api.z.ai/api/paas/v4`
- `ZAI_SCRIPT_MODEL=glm-5v-turbo`
- `SUPABASE_URL`

## Secrets

Atur secrets berikut di Cloudflare Worker:

```bash
cd apps/web
npx wrangler secret put AIVENE_API_KEY
npx wrangler secret put ZAI_API_KEY
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Frontend build juga memerlukan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` pada environment build jika deployment tidak memakai nilai lokal.

## Deploy dan verifikasi

```bash
npm run test -w apps/web
npm run build -w apps/web
npm run deploy:cloudflare -w apps/web
```

Verifikasi `/api/health`, login, analisis video, dua request `/chat/completions`, upload voice lokal, render MP4, dan resume dari Riwayat. Worker tidak menerima atau menyimpan file audio.
