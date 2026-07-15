# MacroDroid untuk Top Up Credit VoiceShort

MacroDroid meneruskan notifikasi pembayaran dari aplikasi InterActive QRIS ke Worker VoiceShort. File siap impor dapat diunduh oleh superadmin melalui **Pengaturan AI > Download MacroDroid**, dan salinan sumbernya tersedia di `macrodroid/voiceshort-interactive-qris.macro`.

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

Setelah mengimpor file macro, isi secure variable `VOICESHORT_QRIS_SECRET` dengan nilai `INTERACTIVE_QRIS_WEBHOOK_SECRET` dari file `.env` lokal. Nilai variable sengaja dikosongkan di file impor.

Body JSON:

```json
{
  "packageName": "com.interactive.qrisid",
  "title": "{not_title}",
  "text": "{notification}",
  "raw": "{not_text_big}"
}
```

## Langkah di MacroDroid

1. Login sebagai superadmin, buka **Pengaturan AI**, lalu tekan **Download MacroDroid**.
2. Impor file tersebut di MacroDroid.
3. Isi secure global variable `VOICESHORT_QRIS_SECRET` dari `.env`.
4. Pastikan trigger memakai package `com.interactive.qrisid`.
5. Aktifkan Notification Access, battery `Unrestricted`, dan background/auto-start untuk MacroDroid.

## Cara kerja nominal unik

- VoiceShort membuat invoice top up dengan nominal unik 2 digit dalam rentang `71` sampai `99`.
- User wajib membayar persis nominal invoice. Contoh: paket Rp20.000 dan kode `73` berarti transfer Rp20.073.
- Satu nominal hanya dipakai oleh satu invoice top up aktif.
- Invoice baru hanya dapat dibuat pukul 05.00-21.59 WIB.
- Invoice yang sudah dibuat tetap dapat dibayar sampai masa aktif 60 menitnya habis.
- Webhook hanya menambah credit wallet bila ada invoice top up `pending` dengan nominal yang sama.

## Membaca response webhook

- `"credited": true`: pembayaran cocok dan credit wallet berhasil masuk.
- `"duplicate": true`: notifikasi yang sama sudah pernah diproses.
- `"reason": "payment_not_found"`: tidak ada invoice pending dengan nominal tersebut.
- HTTP `401`: secret MacroDroid tidak sama dengan Worker.
- `"reason": "unexpected_package"`: payload tidak dikenali sebagai notifikasi InterActive QRIS.

Jangan hanya melihat HTTP `200`; selalu periksa isi `qris_webhook_response`.
