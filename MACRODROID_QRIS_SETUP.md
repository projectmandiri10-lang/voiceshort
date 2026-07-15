# MacroDroid untuk Langganan VoiceShort

MacroDroid meneruskan notifikasi pembayaran dari aplikasi InterActive QRIS ke Worker VoiceShort. Makro web app lain tetap dipertahankan; tambahkan satu action HTTP Request baru untuk VoiceShort pada trigger notifikasi yang sama.

## Konfigurasi Worker

Endpoint production:

```text
POST https://voiceshort.jho-j80.workers.dev/api/webhooks/interactive-qris
```

Header:

```text
Content-Type: application/json
x-interactive-qris-secret: {v=VOICESHORT_QRIS_SECRET}
```

Isi secure variable `VOICESHORT_QRIS_SECRET` dengan nilai `INTERACTIVE_QRIS_WEBHOOK_SECRET` dari file `.env` lokal. Jangan memakai secret web app lain dan jangan membagikannya ke frontend.

Body JSON:

```json
{
  "packageName": "{not_app_package}",
  "title": "{not_title}",
  "text": "{notification}",
  "raw": "{not_text_big}"
}
```

Jika MacroDroid tidak mengenali teks `{v=VOICESHORT_QRIS_SECRET}`, pilih variable tersebut melalui menu magic text pada action HTTP Request.

## Langkah di MacroDroid

1. Buka makro InterActive QRIS yang sudah digunakan web app lain.
2. Pertahankan trigger `Notification Received` untuk aplikasi InterActive QRIS (`com.interactive.qrisid`).
3. Tambahkan action `HTTP Request` baru setelah action webhook lama.
4. Pilih method `POST`, masukkan endpoint, kedua header, dan body JSON di atas.
5. Simpan response body ke string variable `qris_webhook_response`.
6. Tambahkan action Log atau Toast yang menampilkan HTTP status dan `{v=qris_webhook_response}` saat pengujian.
7. Aktifkan Notification Access, battery `Unrestricted`, dan background/auto-start untuk MacroDroid.

## Cara kerja nominal unik

- Harga dasar dan masa aktif diatur superadmin, default Rp20.000 untuk 30 hari.
- VoiceShort menambahkan kode unik 2 digit dalam rentang `71` sampai `99`.
- User wajib membayar persis nominal invoice. Contoh: harga Rp20.000 dan kode `73` berarti transfer Rp20.073.
- Satu nominal hanya dipakai oleh satu invoice aktif dan invoice kedaluwarsa setelah 30 menit.
- Webhook hanya mengaktifkan langganan bila ada invoice pending dengan nominal yang sama. Notifikasi lama atau kiriman ulang tidak memberi langganan dua kali.

## Membaca response webhook

- `"credited": true`: pembayaran cocok dan langganan aktif.
- `"duplicate": true`: notifikasi yang sama sudah pernah diproses.
- `"reason": "payment_not_found"`: tidak ada invoice pending dengan nominal tersebut.
- HTTP `401`: secret MacroDroid tidak sama dengan Worker.
- `"reason": "unexpected_package"`: `packageName` bukan `com.interactive.qrisid`.

Jangan hanya melihat HTTP `200`; selalu periksa isi `qris_webhook_response`.

## Konfigurasi di aplikasi

Login sebagai superadmin, buka **Pengaturan AI**, lalu isi harga langganan, masa aktif, nama merchant, URL gambar QRIS statis, dan petunjuk pembayaran. Setelah disimpan, user dapat membuat invoice dari menu **Langganan**. Status pembayaran diperiksa otomatis setiap 5 detik.
