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
- AI: Gemini (`@google/genai`)
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
3. Isi `GEMINI_API_KEY`.

## Menjalankan (dev)

```bash
npm run dev
```

Default:

- Backend API: `http://localhost:8788`
- Frontend UI: `http://localhost:5174`

Alternatif launcher Windows:

- `start-dev.bat`
- `start-server.bat`
- `start-frontend.bat`

## Menjalankan dari Laptop + Android (LAN)

1. Cari IP laptop di jaringan yang sama.
2. Set `WEB_ORIGIN` di `.env`, contoh:
```env
WEB_ORIGIN=http://localhost:5174,http://192.168.1.20:5174
```
3. Jalankan `npm run dev`.
4. Buka dari browser HP ke `http://<ip-laptop>:5174`.

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

## Testing

```bash
npm run test
```
