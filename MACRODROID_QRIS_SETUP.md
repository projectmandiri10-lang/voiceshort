# MacroDroid untuk Langganan VoiceShort

MacroDroid meneruskan notifikasi pembayaran dari aplikasi InterActive QRIS ke Worker VoiceShort. File siap impor dapat diunduh oleh superadmin melalui **Pengaturan AI > Download MacroDroid**, dan salinan sumbernya tersedia di `macrodroid/voiceshort-interactive-qris.macro`. Makro web app lain tetap dipertahankan karena file VoiceShort berdiri sendiri.

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

Setelah mengimpor file macro, isi secure variable `VOICESHORT_QRIS_SECRET` dengan nilai `INTERACTIVE_QRIS_WEBHOOK_SECRET` dari file `.env` lokal. Nilai variable sengaja dikosongkan di file impor. Jangan memakai secret web app lain dan jangan membagikannya ke frontend.

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

1. Login sebagai superadmin, buka **Pengaturan AI**, lalu tekan **Download MacroDroid**. Pindahkan file ke HP bila unduhan dilakukan melalui komputer.
2. Buka MacroDroid dan pilih menu import macro.
3. Impor file tersebut tanpa menghapus makro web app lain.
4. Buka secure global variable `VOICESHORT_QRIS_SECRET` dan isi nilainya dari `.env`.
5. Pastikan trigger menampilkan InterActive QRIS dengan package `com.interactive.qrisid`.
6. Aktifkan macro, Notification Access, battery `Unrestricted`, dan background/auto-start untuk MacroDroid.

## Cara kerja nominal unik

- Harga dasar dan masa aktif diatur superadmin, default Rp20.000 untuk 30 hari.
- VoiceShort menambahkan kode unik 2 digit dalam rentang `71` sampai `99`.
- User wajib membayar persis nominal invoice. Contoh: harga Rp20.000 dan kode `73` berarti transfer Rp20.073.
- Satu nominal hanya dipakai oleh satu invoice aktif dan invoice kedaluwarsa tepat setelah 60 menit.
- Invoice baru hanya dapat dibuat pukul 05.00–21.59 WIB. Invoice yang sudah dibuat tetap dapat dibayar sampai masa 60 menitnya berakhir, paling lambat sekitar pukul 22.59 WIB.
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
