# Catatan Legacy OCI

Status dokumen ini dicek pada `28 Mei 2026`.

Repo ini tidak lagi merekomendasikan Oracle Cloud OCI sebagai jalur deploy utama. Arsitektur aktif sekarang adalah:

- frontend + API di Cloudflare Worker
- render final dilakukan lokal di browser
- Supabase menyimpan metadata session

Jika suatu saat Anda perlu kembali ke backend Node terpisah, fallback yang lebih dianjurkan adalah **Google Cloud Run**. Lihat `tutorial.md`.

OCI hanya relevan bila Anda sengaja mempertahankan `apps/server` lama yang masih membutuhkan:

- filesystem lokal
- `ffmpeg` / `ffprobe`
- output video server-side

Untuk deploy yang aktif saat ini, gunakan `tutorial-cloudflare-workers-frontend.md`.
