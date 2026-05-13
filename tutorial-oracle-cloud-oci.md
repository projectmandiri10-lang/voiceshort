# Tutorial Deploy `voiceshort` Sepenuhnya ke Oracle Cloud OCI Always Free

Status panduan ini dicek pada `11 Mei 2026`.

Dokumen ini fokus pada deploy penuh aplikasi `voiceshort` ke `Oracle Cloud Infrastructure (OCI)` dengan pola:

- `1 VM OCI Always Free`
- `frontend + backend` jalan di server yang sama
- `domain` dikelola melalui `OCI DNS`
- `file upload/output` disimpan di block volume OCI
- `Supabase` tetap dipakai untuk auth dan database

Arsitektur target:

```txt
Internet
  |
Domain Anda -> OCI DNS -> Public IP VM OCI
  |
Nginx (HTTPS)
  |
Fastify app voiceshort
  |- frontend dist
  |- API /api/*
  |- file output /outputs/*
  |
Block Volume /var/data/voiceshort
```

## 1. Kenapa OCI Always Free cocok untuk repo ini

Berdasarkan dokumentasi resmi OCI Always Free:

- `OCI Ampere A1` gratis sampai total `4 OCPU` dan `24 GB RAM`
- block volume gratis total `200 GB` gabungan `boot volume + block volume`
- outbound data gratis `10 TB/bulan`
- object storage Always Free setelah trial hanya `20 GB`

Untuk repo ini, strategi paling masuk akal adalah:

- `1 VM.Standard.A1.Flex`
- `50 GB` boot volume
- `150 GB` block volume tambahan
- block volume dipasang ke `/var/data/voiceshort`

Kenapa bukan `Object Storage` sebagai storage utama video user:

- setelah masa free trial, Always Free `Object Storage` hanya `20 GB`
- dokumentasi OCI menyebut jika akun turun ke mode Always Free dan object storage Anda melebihi `20 GB`, object dapat dihapus
- target Anda adalah memaksimalkan `200 GB`, jadi media utama harus di block volume, bukan object storage

## 2. Catatan realistis tentang "kompresi seperti YouTube"

YouTube memakai pipeline transcoding dan streaming yang jauh lebih kompleks:

- multi-bitrate
- multi-resolution ladder
- adaptive streaming
- fragmenting
- CDN
- lifecycle storage yang sangat matang

Project ini **tidak** diubah menjadi platform streaming.

Implementasi yang dipakai di repo ini sekarang adalah versi realistis untuk aplikasi generator MP4:

- output final selalu dire-encode ulang
- `H.264`
- `CRF 26`
- `preset medium`
- sisi terpanjang dibatasi `1280 px`
- `fps` dibatasi `30`
- audio `AAC mono 64 kbps`
- metadata dihapus
- `raw upload` dihapus setelah job sukses
- job sukses yang belum diunduh habis akan dibersihkan otomatis setelah `72 jam`

Dengan pola ini, `200 GB` akan terasa jauh lebih awet daripada menyimpan:

- source upload mentah
- final video kualitas terlalu tinggi
- artifact lama tanpa batas waktu

## 3. Fakta OCI Always Free yang perlu Anda pegang

Ringkasan penting dari dokumentasi OCI:

- Always Free compute harus dibuat di `home region`
- `VM.Standard.A1.Flex` bisa dibagi fleksibel sampai total `4 OCPU / 24 GB`
- total `block volume + boot volume` gratis adalah `200 GB`
- `Object Storage` Always Free setelah trial hanya `20 GB`
- OCI memberi `1` Always Free flexible load balancer `10 Mbps`, tetapi panduan ini sengaja **tidak** memakainya agar arsitektur tetap sederhana
- OCI dapat mereclaim instance Always Free yang dianggap idle terlalu lama

Karena itu, panduan ini memakai:

- `single VM`
- tanpa load balancer
- tanpa object storage utama

## 4. Arsitektur production yang dipakai

Susunan production yang dipakai di tutorial ini:

- domain utama misalnya `https://suara-baru-anda.com`
- aplikasi frontend dan backend pada domain yang sama
- `Nginx` sebagai reverse proxy HTTPS
- `Fastify` melayani:
  - frontend React build
  - endpoint API
  - endpoint download file output
- `Supabase` tetap untuk auth dan data aplikasi
- semua file runtime disimpan di:

```txt
/var/data/voiceshort
```

## 5. Persiapan sebelum mulai

Siapkan:

- akun OCI yang masih memenuhi syarat `Always Free`
- domain yang sudah Anda miliki di registrar
- akses untuk mengubah nameserver atau record DNS domain
- repo `voiceshort` di GitHub
- project Supabase aktif
- endpoint AI production yang valid

Catatan penting untuk repo ini:

- backend membaca file root `.env`
- frontend build mengambil `VITE_*` dari env repo root
- backend sekarang cocok dideploy sebagai `single-domain app`
- frontend production default akan memakai `window.location.origin` jika `VITE_API_BASE` tidak diisi

## 6. Rencana resource OCI yang dipakai

Pakai alokasi berikut:

```txt
Compute shape: VM.Standard.A1.Flex
OCPU: 4
Memory: 24 GB
Boot volume: 50 GB
Attached block volume: 150 GB
OS image: Ubuntu
```

Dengan alokasi ini:

- `50 GB` habis untuk boot volume
- `150 GB` sisa dipakai untuk storage aplikasi
- total tetap `200 GB`, masih sesuai jatah Always Free

## 7. Buat jaringan dasar di OCI

Di OCI Console:

1. Buat `VCN` baru dengan internet connectivity
2. Buat `public subnet`
3. Pastikan route table punya jalur ke `Internet Gateway`
4. Pada `Security List` atau `Network Security Group`, buka:

```txt
TCP 22
TCP 80
TCP 443
```

Kalau Anda belum yakin, buat NSG khusus server app agar aturan lebih rapi.

## 8. Launch VM Always Free Ubuntu

Di `Compute` -> `Instances` -> `Create instance`:

Isi acuan seperti ini:

```txt
Name: voiceshort-oci
Image: Ubuntu
Shape: VM.Standard.A1.Flex
OCPU: 4
Memory: 24 GB
Boot volume: 50 GB
Networking: public subnet
Public IPv4: aktif
SSH key: upload public key Anda
```

Catatan:

- kalau muncul `out of host capacity`, coba availability domain lain atau tunggu beberapa saat
- pastikan image yang dipilih tetap `Always Free Eligible`

## 9. Buat block volume 150 GB untuk storage aplikasi

Di `Block Storage` -> `Block Volumes`:

1. Buat volume baru
2. Nama misalnya:

```txt
voiceshort-data
```

3. Ukuran:

```txt
150 GB
```

4. Pastikan dibuat di `home region`
5. Attach ke instance `voiceshort-oci` sebagai `Read/Write`

## 10. Format dan mount block volume di Ubuntu

SSH ke server:

```bash
ssh ubuntu@IP_PUBLIK_ANDA
```

Cek disk:

```bash
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT
```

Di OCI, device block volume bisa muncul sebagai:

- `/dev/oracleoci/oraclevdb`
- `/dev/sdb`
- atau nama serupa

Sesuaikan semua command di bawah dengan device yang benar dari hasil `lsblk`.

Contoh:

```bash
sudo mkfs.ext4 /dev/oracleoci/oraclevdb
sudo mkdir -p /var/data/voiceshort
sudo mount /dev/oracleoci/oraclevdb /var/data/voiceshort
df -h
```

Ambil UUID:

```bash
sudo blkid /dev/oracleoci/oraclevdb
```

Tambahkan ke `/etc/fstab`:

```bash
sudo nano /etc/fstab
```

Tambahkan satu baris:

```txt
UUID=UUID_ANDA /var/data/voiceshort ext4 defaults,nofail 0 2
```

Uji:

```bash
sudo umount /var/data/voiceshort
sudo mount -a
df -h
```

## 11. Install paket sistem di Ubuntu

Install paket dasar:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl nginx certbot python3-certbot-nginx ffmpeg
```

Install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential
node -v
npm -v
ffmpeg -version
ffprobe -version
```

Untuk server OCI ARM, repo ini sekarang aman memakai binary sistem:

```txt
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
```

## 12. Siapkan user aplikasi dan folder kerja

Buat user khusus:

```bash
sudo adduser --disabled-password --gecos "" voiceshort
sudo mkdir -p /opt/voiceshort
sudo chown -R voiceshort:voiceshort /opt/voiceshort
sudo chown -R voiceshort:voiceshort /var/data/voiceshort
```

Clone repo:

```bash
sudo -u voiceshort git clone https://github.com/USERNAME-ANDA/voiceshort.git /opt/voiceshort
```

Masuk ke repo:

```bash
cd /opt/voiceshort
sudo -u voiceshort npm install
```

## 13. Siapkan `.env` production

Repo ini membaca env dari file root:

```txt
/opt/voiceshort/.env
```

Buat file:

```bash
sudo -u voiceshort cp /opt/voiceshort/.env.example /opt/voiceshort/.env
sudo -u voiceshort nano /opt/voiceshort/.env
```

Contoh bentuk env single-domain production:

```env
AI_PROVIDER=litellm
LITELLM_BASE_URL=https://litellm-anda.example.com/v1
LITELLM_SECRET_KEY=isi-key-anda
LITELLM_SCRIPT_MODEL=gemini/gemini-3-flash-preview
LITELLM_TTS_MODEL=gemini/gemini-2.5-pro-preview-tts

SUPABASE_URL=https://project-ref-anda.supabase.co
SUPABASE_ANON_KEY=isi-anon-atau-publishable-key
SUPABASE_SERVICE_ROLE_KEY=isi-service-role-key
SUPERADMIN_EMAIL=email-admin-anda@example.com

PORT=8788
APP_STORAGE_ROOT=/var/data/voiceshort
WEB_ORIGIN=https://domain-anda.com
APP_WEB_URL=https://domain-anda.com
APP_PROD_WEB_URL=https://domain-anda.com
APP_API_URL=https://domain-anda.com
ADDITIONAL_REDIRECT_URLS=https://domain-anda.com

VITE_SUPABASE_URL=https://project-ref-anda.supabase.co
VITE_SUPABASE_ANON_KEY=isi-anon-atau-publishable-key

SUCCESS_OUTPUT_RETENTION_HOURS=72
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
```

Catatan:

- `VITE_API_BASE` tidak wajib diisi untuk single-domain production
- aplikasi sekarang memakai `AI_PROVIDER=litellm` untuk seluruh proses AI
- kalau Anda memakai Google login dan ingin backend menyinkronkan config Supabase otomatis, isi juga:
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
  - `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`

## 14. Build aplikasi

Build frontend dan backend dari root repo:

```bash
cd /opt/voiceshort
sudo -u voiceshort npm run build
```

Karena backend akan serve frontend build dari `apps/web/dist`, build frontend wajib sukses.

## 15. Uji server secara manual sebelum systemd

Jalankan dulu manual:

```bash
cd /opt/voiceshort
sudo -u voiceshort npm run start
```

Kalau sukses, server akan listen di:

```txt
http://127.0.0.1:8788
```

Uji dari server:

```bash
curl http://127.0.0.1:8788/api/health
```

Kalau sudah `ok`, hentikan proses dengan `Ctrl+C`.

## 16. Jalankan dengan systemd

Buat file service:

```bash
sudo nano /etc/systemd/system/voiceshort.service
```

Isi:

```ini
[Unit]
Description=voiceshort app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=voiceshort
WorkingDirectory=/opt/voiceshort
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Aktifkan:

```bash
sudo systemctl daemon-reload
sudo systemctl enable voiceshort
sudo systemctl start voiceshort
sudo systemctl status voiceshort --no-pager
```

Lihat log:

```bash
journalctl -u voiceshort -f
```

## 17. Konfigurasi Nginx untuk single domain

Buat site config:

```bash
sudo nano /etc/nginx/sites-available/voiceshort
```

Isi:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name domain-anda.com;

    client_max_body_size 500M;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
}
```

Aktifkan config:

```bash
sudo ln -s /etc/nginx/sites-available/voiceshort /etc/nginx/sites-enabled/voiceshort
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx --no-pager
```

## 18. Setup domain di OCI DNS

Panduan ini mengasumsikan domain sudah Anda miliki di registrar.

Alurnya:

1. Buat `Public Zone` di `OCI DNS`
2. Tambahkan record untuk domain
3. Ubah nameserver di registrar ke nameserver OCI **atau** tetap pakai registrar dan buat record di sana

Kalau Anda ingin OCI yang mengelola DNS:

1. Masuk `Networking` -> `DNS Management` -> `Zones`
2. Buat `Public Zone` dengan nama domain Anda, misalnya:

```txt
domain-anda.com
```

3. Tambahkan record:

```txt
Type: A
Name: (kosong / apex)
Value: IP_PUBLIK_VM
TTL: 300
```

Opsional untuk `www`:

```txt
Type: CNAME
Name: www
Value: domain-anda.com
TTL: 300
```

4. Setelah zone aktif, ubah nameserver domain di registrar ke nameserver OCI yang diberikan zone tersebut

Catatan penting:

- OCI DNS mengelola `zone` dan `record`
- pembelian domain publik tetap diasumsikan dilakukan di registrar

## 19. Aktifkan HTTPS dengan Let's Encrypt

Setelah DNS mengarah ke IP server dan port `80` terbuka:

```bash
sudo certbot --nginx -d domain-anda.com
```

Kalau juga ingin `www`:

```bash
sudo certbot --nginx -d domain-anda.com -d www.domain-anda.com
```

Cek auto-renew:

```bash
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --dry-run
```

## 20. Folder storage production yang dipakai aplikasi

Setelah env:

```txt
APP_STORAGE_ROOT=/var/data/voiceshort
```

Aplikasi akan menulis ke:

```txt
/var/data/voiceshort/data
/var/data/voiceshort/uploads
/var/data/voiceshort/outputs
/var/data/voiceshort/logs
```

Perilaku storage yang sekarang berlaku:

- source upload dihapus setelah job sukses
- output final dibersihkan langsung setelah kedua artifact diunduh
- success job yang masih tertahan akan dibersihkan otomatis setelah `72 jam`

Ini adalah kunci utama agar `150 GB` block volume terasa jauh lebih awet.

## 21. Checklist setelah deploy

Setelah semua aktif, cek:

```bash
curl https://domain-anda.com/api/health
```

Lalu pastikan:

- halaman frontend bisa dibuka
- login Supabase berjalan
- upload video berhasil
- `caption.txt` dan `final.mp4` bisa diunduh
- file baru masuk ke `/var/data/voiceshort`
- setelah job sukses, source upload mentah tidak tertinggal

## 22. Operasi harian yang penting

Cek service:

```bash
sudo systemctl status voiceshort --no-pager
sudo systemctl restart voiceshort
journalctl -u voiceshort -f
```

Cek Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Cek disk:

```bash
df -h
lsblk
du -sh /var/data/voiceshort/*
```

Cek build baru setelah update code:

```bash
cd /opt/voiceshort
sudo -u voiceshort git pull
sudo -u voiceshort npm install
sudo -u voiceshort npm run build
sudo systemctl restart voiceshort
```

## 23. Troubleshooting cepat

### A. Domain belum resolve

Periksa:

- nameserver registrar sudah diarahkan ke OCI atau belum
- record `A` mengarah ke IP yang benar
- propagasi DNS belum selesai

### B. Upload video gagal di Nginx

Periksa:

- `client_max_body_size 500M`
- service backend hidup
- disk `/var/data/voiceshort` masih cukup

### C. Backend gagal membaca video

Periksa:

```bash
ffmpeg -version
ffprobe -version
which ffmpeg
which ffprobe
```

Pastikan env:

```txt
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
```

### D. Frontend blank atau asset 404

Periksa:

- `npm run build` sukses
- folder `apps/web/dist` ada
- backend restart setelah build

### E. Storage cepat penuh

Periksa:

```bash
du -sh /var/data/voiceshort/uploads
du -sh /var/data/voiceshort/outputs
```

Kalau penuh terlalu cepat:

- cek apakah job sukses gagal dibersihkan
- cek apakah ada file hasil lama di luar flow aplikasi
- pastikan deploy memakai code terbaru yang sudah menghapus upload mentah setelah sukses

## 24. Catatan batasan Always Free

Meskipun setup ini hemat, tetap ada batasan:

- OCI bisa mereclaim instance Always Free yang sangat idle
- `200 GB` itu gabungan boot + block volume, jadi kapasitas efektif data aplikasi Anda bukan 200 penuh
- object storage Always Free setelah trial bukan tempat aman untuk library video besar
- single VM berarti semua beban ada di satu mesin

Untuk tahap awal project ini, kompromi tersebut masih sangat masuk akal.

## 25. Sumber resmi OCI

- Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Free Tier overview: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Public DNS overview: https://docs.oracle.com/en-us/iaas/Content/DNS/Concepts/gettingstarted.htm
- Managing DNS zones: https://docs.oracle.com/en-us/iaas/Content/DNS/Tasks/managingdnszones.htm
- Block volumes overview: https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/overview.htm
