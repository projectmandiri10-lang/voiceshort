# Tutorial Deploy Backend `voiceshort` ke Render

Dokumen ini fokus hanya untuk deploy backend project `voiceshort` ke Render.
Frontend tetap Anda taruh di shared hosting atau static hosting Anda sendiri.

Contoh placeholder yang dipakai di tutorial ini:

```txt
Frontend: https://frontend-anda.example.com
Backend Render: https://voiceshort-backend.onrender.com
```

## 1. Pahami arsitektur project ini dulu

Pada repo ini, susunannya sederhana:

- frontend ada di `apps/web`
- backend ada di `apps/server`
- auth dan data utama memakai Supabase
- file upload video, output video, preview suara, dan log masih disimpan oleh backend

Artinya, untuk deploy production:

- frontend static tetap Anda upload ke hosting static/shared hosting
- backend Node.js kita deploy ke Render sebagai `Web Service`
- backend perlu `Persistent Disk` supaya folder `uploads/`, `outputs/`, dan `logs/` tidak hilang saat restart atau deploy ulang

## 2. Prasyarat sebelum mulai

Sebelum buka Render, siapkan ini dulu:

- akun GitHub
- akun Render
- project Supabase yang sudah aktif
- endpoint LiteLLM yang benar-benar bisa diakses dari internet
- akses ke file `.env` lokal project ini, karena nilainya akan dipindah ke Render

Repo ini saat ini cocok dideploy dengan mode:

```txt
AI_PROVIDER=litellm
```

## 3. Pastikan source code sudah ada di GitHub

Render paling nyaman dipakai jika source code repo sudah ada di GitHub.

Checklist singkat:

- project `voiceshort` sudah dipush ke GitHub
- branch yang mau dideploy sudah benar
- isi code backend yang akan dipakai production memang branch itu

Kalau Anda nanti update backend, cukup push lagi ke branch yang sama lalu Render bisa redeploy.

## 4. Buat backend service baru di Render

Masuk ke dashboard Render, lalu buat service baru:

1. Klik `New +`
2. Pilih `Web Service`
3. Hubungkan GitHub Anda
4. Pilih repo `voiceshort`
5. Pilih branch yang mau dideploy

Saat form service terbuka, isi konsepnya seperti ini:

```txt
Service Type: Web Service
Source Code: GitHub repo
Root Directory: kosongkan / repo root
```

Untuk command, isi seperti ini:

```bash
Build Command:
npm install && npm run build -w apps/server

Start Command:
npm run start -w apps/server
```

Penting:

- jangan deploy `apps/web` di Render untuk tutorial ini
- backend ini dijalankan dari root repo, bukan dari folder `apps/server`
- script start backend repo ini pada akhirnya menjalankan:

```bash
node dist/index.js
```

## 5. Tambahkan Persistent Disk

Ini bagian yang sangat penting untuk repo ini.

Backend `voiceshort` menulis file ke filesystem lokal untuk:

- upload video mentah
- hasil render video
- preview voice
- log

Kalau Anda deploy tanpa `Persistent Disk`, maka file-file itu bisa hilang saat:

- service restart
- deploy ulang
- instance berpindah

Di Render, tambahkan disk lalu pakai mount path tetap berikut:

```txt
/var/data/voiceshort
```

Setelah disk dibuat, nanti tambahkan env ini:

```txt
APP_STORAGE_ROOT=/var/data/voiceshort
```

Dengan cara ini, backend akan menyimpan data runtime ke lokasi disk tersebut, bukan ke folder sementara instance.

## 6. Isi Environment Variables di Render

Buka bagian `Environment` atau `Environment Variables`, lalu isi satu per satu.

### Env wajib untuk backend mode `litellm`

Isi minimal ini:

```txt
AI_PROVIDER=litellm
LITELLM_BASE_URL=https://litellm-anda.example.com/v1
LITELLM_SECRET_KEY=isi-jika-dipakai
LITELLM_SCRIPT_MODEL=gemini/gemini-3-flash-preview
LITELLM_TTS_MODEL=gemini/gemini-2.5-pro-preview-tts
SUPABASE_URL=https://project-ref-anda.supabase.co
SUPABASE_ANON_KEY=isi-key-anda
SUPABASE_SERVICE_ROLE_KEY=isi-service-role-key-anda
SUPERADMIN_EMAIL=email-admin-anda@example.com
APP_STORAGE_ROOT=/var/data/voiceshort
```

Catatan penting:

- jika gateway Anda memakai `LITELLM_API_KEY` alih-alih `LITELLM_SECRET_KEY`, itu juga bisa dipakai
- untuk mode `AI_PROVIDER=litellm`, backend ini akan gagal boot jika `LITELLM_BASE_URL`, `LITELLM_SCRIPT_MODEL`, atau `LITELLM_TTS_MODEL` kosong
- backend ini juga akan gagal boot jika `SUPABASE_URL`, `SUPABASE_ANON_KEY`, atau `SUPABASE_SERVICE_ROLE_KEY` kosong

Kalau Anda memang lebih nyaman pakai alias lama, bentuknya seperti ini:

```txt
LITELLM_API_KEY=isi-jika-pakai-alias-lama
```

### Env wajib untuk frontend terpisah

Karena frontend Anda tidak dideploy di Render, backend tetap perlu tahu dari domain mana request frontend datang.

Sementara domain final belum ada, pakai placeholder seperti ini dulu:

```txt
WEB_ORIGIN=https://frontend-anda.example.com
APP_WEB_URL=https://frontend-anda.example.com
APP_PROD_WEB_URL=https://frontend-anda.example.com
ADDITIONAL_REDIRECT_URLS=https://frontend-anda.example.com
APP_API_URL=https://voiceshort-backend.onrender.com
```

Fungsi singkatnya:

- `WEB_ORIGIN` untuk CORS
- `APP_WEB_URL` untuk referensi URL frontend
- `APP_PROD_WEB_URL` untuk URL frontend production
- `ADDITIONAL_REDIRECT_URLS` untuk tambahan redirect auth jika dibutuhkan
- `APP_API_URL` untuk referensi URL backend production

Kalau nanti domain frontend final berubah, env di atas tinggal Anda ganti.

### Env opsional untuk sinkronisasi Google OAuth otomatis

Isi ini hanya kalau Anda ingin backend otomatis menyinkronkan konfigurasi Google OAuth ke Supabase lewat Management API:

```txt
SUPABASE_ACCESS_TOKEN=isi-personal-access-token-supabase
SUPABASE_PROJECT_REF=project-ref-anda
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=isi-google-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=isi-google-client-secret
```

Kalau env ini tidak diisi, backend tetap bisa hidup. Hanya saja sinkronisasi config Google OAuth otomatis akan dilewati.

### Env opsional untuk billing WebQRIS

Kalau fitur billing berbayar memang dipakai, isi juga:

```txt
WEBQRIS_BASE_URL=https://webqris.com
WEBQRIS_API_TOKEN=isi-token-webqris
WEBQRIS_WEBHOOK_SECRET=isi-webhook-secret
GENERATE_PRICE_IDR=2000
```

Kalau billing belum dipakai, bagian ini boleh kosong.

### Env yang tidak perlu dipaksa diisi

Untuk deploy backend Render repo ini:

```txt
PORT tidak perlu diisi manual
SUPERADMIN_PASSWORD bukan syarat boot backend ini
VITE_SUPABASE_URL tidak perlu diisi di backend Render
VITE_SUPABASE_ANON_KEY tidak perlu diisi di backend Render
```

Penjelasan singkat:

- Render akan menyediakan `PORT` sendiri
- `SUPERADMIN_PASSWORD` dipakai di flow bootstrap tertentu, bukan syarat startup backend utama ini
- env `VITE_*` adalah kebutuhan frontend build, bukan kebutuhan backend Render

## 7. Deploy pertama

Setelah semua env dan persistent disk sudah siap:

1. Klik `Create Web Service` atau `Deploy`
2. Tunggu proses build selesai
3. Lihat log startup

Target hasil yang ingin Anda lihat:

- build sukses
- start command jalan
- server listen normal
- tidak ada error boot karena env wajib kosong

Repo ini punya endpoint health check berikut:

```txt
/api/health
```

Setelah service aktif, uji URL ini dari browser:

```txt
https://voiceshort-backend.onrender.com/api/health
```

Respons yang diharapkan kira-kira berbentuk:

```json
{
  "status": "ok",
  "now": "2026-05-09T00:00:00.000Z"
}
```

## 8. Log startup yang perlu diperhatikan

Saat deploy pertama, cek log Render dan cari tanda-tanda ini:

- tidak ada error `SUPABASE_URL, SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY wajib diisi`
- tidak ada error `LITELLM_BASE_URL wajib diisi saat AI_PROVIDER=litellm`
- tidak ada error `LITELLM_SCRIPT_MODEL wajib diisi saat AI_PROVIDER=litellm`
- tidak ada error `LITELLM_TTS_MODEL wajib diisi saat AI_PROVIDER=litellm`
- ada log bahwa server berjalan normal

Kalau Google OAuth env tidak diisi penuh, kemungkinan Anda akan melihat log bahwa sinkronisasi Google OAuth dilewati. Itu normal.

## 9. Setelah backend hidup

Begitu backend Render sudah aktif, catat URL final service Anda, misalnya:

```txt
https://voiceshort-backend.onrender.com
```

Lalu di frontend static Anda, arahkan request API ke URL backend tersebut melalui env frontend:

```txt
VITE_API_BASE=https://voiceshort-backend.onrender.com
```

Karena frontend Anda berada di hosting terpisah, nanti saat domain final sudah jadi, update juga env backend berikut:

```txt
WEB_ORIGIN=https://frontend-anda.example.com
APP_WEB_URL=https://frontend-anda.example.com
APP_PROD_WEB_URL=https://frontend-anda.example.com
ADDITIONAL_REDIRECT_URLS=https://frontend-anda.example.com
```

Kalau frontend Anda pindah ke domain baru, jangan lupa redeploy backend atau simpan ulang env di Render.

## 10. Troubleshooting khusus repo ini

### Backend gagal boot karena env Supabase kosong

Gejala:

```txt
SUPABASE_URL, SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY wajib diisi pada .env.
```

Solusi:

- cek lagi semua env Supabase di Render
- pastikan tidak ada typo pada nama env
- simpan env lalu redeploy

### Backend gagal boot karena env LiteLLM kosong

Gejala:

```txt
LITELLM_BASE_URL wajib diisi saat AI_PROVIDER=litellm.
LITELLM_SCRIPT_MODEL wajib diisi saat AI_PROVIDER=litellm.
LITELLM_TTS_MODEL wajib diisi saat AI_PROVIDER=litellm.
```

Solusi:

- pastikan `AI_PROVIDER=litellm`
- isi semua env LiteLLM yang wajib
- pastikan URL LiteLLM dapat diakses dari internet, bukan URL localhost

### Frontend kena error CORS

Gejala umum:

- login atau fetch API gagal dari browser
- request dari frontend diblokir browser

Solusi:

- pastikan domain frontend sudah masuk ke `WEB_ORIGIN`
- jika perlu lebih dari satu origin, pisahkan dengan koma

Contoh:

```txt
WEB_ORIGIN=https://frontend-anda.example.com,https://www.frontend-anda.example.com
```

### File output hilang setelah restart atau deploy ulang

Penyebab paling umum:

- `Persistent Disk` belum dipasang
- `APP_STORAGE_ROOT` belum diarahkan ke mount path disk

Solusi:

- pasang `Persistent Disk`
- gunakan mount path berikut:

```txt
/var/data/voiceshort
```

- isi env:

```txt
APP_STORAGE_ROOT=/var/data/voiceshort
```

### Job yang sedang jalan berubah menjadi `interrupted`

Ini memang perilaku yang mungkin terjadi pada repo ini saat:

- service restart
- deploy ulang
- instance mati saat job masih berjalan

Karena itu:

- hindari redeploy saat job penting sedang proses
- anggap Render restart sebagai risiko operasional normal untuk job panjang

### Google login tidak tersinkron otomatis

Penyebab:

- `SUPABASE_ACCESS_TOKEN` belum diisi
- `SUPABASE_PROJECT_REF` belum diisi
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` atau secret belum diisi

Solusi:

- isi env opsional Google OAuth lengkap jika memang ingin auto-sync
- kalau tidak ingin auto-sync, Anda bisa atur konfigurasi Google OAuth langsung di dashboard Supabase

## 11. Checklist akhir

Kalau semua sudah benar, kondisi minimumnya akan seperti ini:

```txt
Backend source dari GitHub
Service type = Web Service
Build command = npm install && npm run build -w apps/server
Start command = npm run start -w apps/server
Persistent Disk terpasang
APP_STORAGE_ROOT=/var/data/voiceshort
Health check /api/health berhasil
Frontend static diarahkan ke VITE_API_BASE backend Render
```

Kalau checklist ini sudah terpenuhi, backend `voiceshort` Anda sudah siap dipakai dari frontend static di hosting terpisah.
