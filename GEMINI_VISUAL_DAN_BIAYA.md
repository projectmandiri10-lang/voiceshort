# Gemini Visual Alignment dan Estimasi Biaya Generate Voice Over

Dokumen ini menjelaskan biaya yang keluar untuk membuat voice over dengan flow aplikasi saat ini.

Update ini mengikuti kode di:

- `apps/server/src/services/job-processor.ts`
- `apps/server/src/services/gemini-service.ts`
- `apps/server/src/services/prompt-builder.ts`
- `data/settings.json`

## Jawaban Singkat

Dengan flow saat ini, biaya bukan hanya datang dari TTS. Satu generate voice over normalnya memakai:

1. 1x analisis video untuk membuat `visualBrief`
2. 1x generate script dari teks/visual brief
3. 1x generate caption metadata dari teks/visual brief
4. 1x generate speech/TTS dari script final
5. proses lokal `ffmpeg` untuk menggabungkan voice over ke `final.mp4`

Komponen paling besar biasanya:

- input video pada tahap `visualBrief`
- output audio pada tahap TTS

Estimasi paid tier produksi dengan kurs Rp17.308/USD:

| Durasi | TTS voice over saja | Total flow normal |
| --- | ---: | ---: |
| 15 detik | sekitar Rp80 - Rp90 | sekitar Rp180 - Rp320 |
| 30 detik | sekitar Rp160 - Rp175 | sekitar Rp330 - Rp520 |
| 60 detik | sekitar Rp330 - Rp350 | sekitar Rp650 - Rp950 |

Angka `Total flow normal` sudah memasukkan perkiraan overhead teks untuk visual brief, script, caption, dan input teks TTS. Angka exact per job belum tersedia karena aplikasi belum menyimpan `usage_metadata`.

## Flow Biaya Saat Ini

### 1. Upload video ke Gemini File API

`JobProcessor.processItem()` selalu meng-upload video lebih dulu:

`this.gemini.uploadVideo(job.videoPath, job.videoMimeType)`

Upload ini menyiapkan file agar bisa dipakai oleh Gemini. Biaya token utama dihitung ketika file video dipakai dalam `generateContent`, bukan saat `ffmpeg` lokal berjalan.

### 2. Generate visual brief dari video

Flow normal:

`generateVisualBrief({ model: settings.scriptModel, prompt, video: uploadedVideo })`

Ini adalah call multimodal utama. Video dipakai sebagai input, lalu Gemini mengembalikan JSON `visualBrief` berisi ringkasan visual, hook, timeline, teks layar, hal yang wajib disebut, dan hal yang harus dihindari.

Karena `data/settings.json` saat ini memakai:

`scriptModel = gemini-3-flash-preview`

maka estimasi memakai harga `Gemini 3 Flash Preview`.

### 3. Generate script dari visual brief

Jika visual brief valid, script dibuat tanpa mengirim video lagi:

`generateScript({ model: settings.scriptModel, prompt: scriptPrompt })`

Prompt berisi metadata job dan `visualBrief` JSON. Jadi biaya tahap ini dominan teks input dan teks output, bukan video.

### 4. Generate caption metadata dari visual brief

Caption metadata juga dibuat tanpa mengirim video lagi:

`generateCaptionMetadata({ model: settings.scriptModel, prompt: captionPrompt })`

Outputnya disimpan ke `caption.txt`. Tahap ini adalah teks input dan JSON output.

### 5. Generate speech/TTS

Audio voice over dibuat dari script final:

`generateSpeech({ model: settings.ttsModel, text: scriptText, voiceName, speechRate })`

Setting aktif:

`ttsModel = gemini-2.5-flash-preview-tts`

Catatan teknis penting: `speechRate` tidak dikirim sebagai parameter khusus ke Gemini TTS. Saat ini audio dibuat oleh Gemini, lalu aplikasi mengatur tempo/normalisasi melalui `ffmpeg` di `writeWav24kMono()` dan `combineVideoWithVoiceOver()`.

Audio TTS hanya disimpan sebagai file sementara di folder temp sistem saat proses merge. File `voice.wav` tidak disimpan sebagai artifact di folder `outputs/<jobId>`.

### 6. Proses lokal ffmpeg

Tahap berikut berjalan lokal:

- tulis file audio sementara untuk proses merge
- sesuaikan tempo audio bila perlu
- gabungkan video asli + voice over menjadi `final.mp4`
- hapus file audio sementara setelah merge selesai

Ini tidak menambah biaya API Gemini.

## Pricing Yang Dipakai

Basis estimasi per 24 April 2026:

- `gemini-3-flash-preview`
  - input text/image/video: USD 0.50 per 1 juta token
  - output text: USD 3.00 per 1 juta token
- `gemini-2.5-flash-preview-tts`
  - input text: USD 0.50 per 1 juta token
  - output audio: USD 10.00 per 1 juta token
- Video Gemini pada default media resolution: sekitar 300 token per detik video.
- Audio: 32 token per detik audio.
- Kurs estimasi: Rp17.308 per USD.

## Rumus Biaya Dominan

### A. Biaya input video untuk visual brief

Flow normal membaca video 1 kali:

`1 x 300 token/detik x durasi video`

Harga input `gemini-3-flash-preview`:

`USD 0.50 / 1.000.000 token`

Biaya video per detik:

`300 x 0.50 / 1.000.000 = USD 0.00015`

Dalam Rupiah:

`USD 0.00015 x Rp17.308 = sekitar Rp2,60 per detik video`

### B. Biaya output audio TTS

Token audio:

`32 token/detik`

Harga output audio `gemini-2.5-flash-preview-tts`:

`USD 10.00 / 1.000.000 token`

Biaya TTS output per detik:

`32 x 10 / 1.000.000 = USD 0.00032`

Dalam Rupiah:

`USD 0.00032 x Rp17.308 = sekitar Rp5,54 per detik audio`

### C. Biaya dominan per detik flow normal

Jika durasi audio final kurang lebih sama dengan durasi video:

`Rp2,60 + Rp5,54 = sekitar Rp8,14 per detik`

Angka ini belum memasukkan overhead teks. Overhead teks tetap ada, terutama:

- prompt `visualBrief`
- output JSON `visualBrief`
- prompt script yang membawa `visualBrief`
- output script
- prompt caption yang membawa `visualBrief` dan script
- output caption JSON
- input teks ke TTS

Untuk video short 15-60 detik, overhead teks biasanya lebih kecil daripada gabungan video + audio, tetapi tetap cukup terasa karena output `visualBrief` bisa panjang.

## Estimasi Detail

### TTS voice over saja

Ini menghitung tahap `generateSpeech` saja, terutama output audio.

| Durasi audio | Estimasi TTS |
| --- | ---: |
| 15 detik | sekitar Rp80 - Rp90 |
| 30 detik | sekitar Rp160 - Rp175 |
| 60 detik | sekitar Rp330 - Rp350 |

Input teks TTS biasanya hanya menambah beberapa rupiah atau kurang untuk durasi short.

### Total flow normal

Ini menghitung flow sukses normal:

1. video dibaca 1 kali untuk `visualBrief`
2. script dibuat text-only dari `visualBrief`
3. caption dibuat text-only dari `visualBrief`
4. TTS membuat audio
5. `ffmpeg` lokal, biaya API Rp0

| Durasi video | Biaya durasi dominan | Estimasi total normal |
| --- | ---: | ---: |
| 15 detik | sekitar Rp122 | sekitar Rp180 - Rp320 |
| 30 detik | sekitar Rp244 | sekitar Rp330 - Rp520 |
| 60 detik | sekitar Rp488 | sekitar Rp650 - Rp950 |

Range dibuat longgar karena ukuran `visualBrief`, panjang script, caption, dan jumlah token output tidak selalu sama.

## Jika Visual Brief Gagal

Kode saat ini punya fallback:

1. coba `generateVisualBrief`
2. kalau output JSON tidak valid, coba ulang dengan strict JSON prompt
3. kalau masih tidak valid, fallback ke script dan caption multimodal langsung

Pada kasus fallback, video bisa terbaca lebih dari 1 kali:

- normal sukses langsung: 1x baca video
- strict visual brief sukses setelah retry struktur: 2x baca video
- fallback setelah visual brief tetap invalid: bisa menjadi sekitar 4x baca video

Perkiraan biaya dominan per detik:

| Kondisi | Baca video | Biaya dominan per detik |
| --- | ---: | ---: |
| Normal sukses | 1x | sekitar Rp8,14/detik |
| Strict visual brief sukses | 2x | sekitar Rp10,73/detik |
| Fallback multimodal | 4x | sekitar Rp15,92/detik |

Retry karena error transient atau rate limit juga bisa menggandakan biaya call yang sempat diproses. Jadi estimasi produksi sebaiknya menyisakan buffer.

## Apa Yang Belum Bisa Dihitung Exact

Saat ini repo belum menyimpan:

- `usage_metadata`
- `prompt_token_count`
- `candidates_token_count`
- `thoughts_token_count`
- `total_token_count`
- hasil `countTokens`

Akibatnya aplikasi belum bisa menampilkan biaya exact per job. Estimasi di dokumen ini berbasis durasi video, asumsi token video/audio resmi, pricing model, dan overhead teks rata-rata.

Supaya exact cost bisa ditampilkan di UI, perubahan minimal yang dibutuhkan:

1. Ambil `usage_metadata` dari setiap respons Gemini.
2. Simpan usage per stage: `visualBrief`, `script`, `caption`, dan `tts`.
3. Simpan model yang dipakai saat job berjalan.
4. Hitung biaya berdasarkan pricing per model dan kurs yang dipilih.
5. Tampilkan total biaya job di halaman Jobs.

## Catatan Free Tier

Jika request masih masuk free tier Google AI Studio/Gemini API, biaya marginal aktual bisa Rp0 sampai kuota gratis habis.

Estimasi di dokumen ini lebih tepat dibaca sebagai estimasi paid tier produksi.

## Catatan Optimasi

Optimasi terbesar yang sudah dilakukan oleh flow sekarang adalah video tidak dibaca ulang untuk script dan caption saat `visualBrief` berhasil. Ini lebih murah dan lebih konsisten daripada flow lama yang membaca video langsung pada script dan caption.

Optimasi lanjutan yang masih masuk akal:

- simpan `usage_metadata` untuk biaya exact
- pakai `countTokens` sebelum generate untuk estimasi awal
- gunakan `media_resolution` rendah hanya untuk video yang visualnya sederhana
- naikkan FPS hanya untuk video dengan cut cepat, teks kecil, atau motion tinggi
- pertimbangkan context caching jika video panjang atau dipakai berkali-kali

Jangan menurunkan resolusi/FPS secara buta untuk konten short yang banyak teks layar atau perubahan scene cepat, karena voice over bisa jadi kurang menempel ke visual.

## Sumber Resmi

- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Token guide: https://ai.google.dev/gemini-api/docs/tokens
- Video understanding: https://ai.google.dev/gemini-api/docs/video-understanding
- Speech generation/TTS: https://ai.google.dev/gemini-api/docs/speech-generation
- JISDOR Bank Indonesia: https://www.bi.go.id/en/statistik/informasi-kurs/jisdor/default.aspx

## Ringkasan Akhir

- Flow saat ini sudah lebih hemat daripada membaca video dua kali untuk script dan caption.
- Biaya TTS voice over saja kira-kira Rp5,54 per detik audio pada paid tier.
- Biaya total flow normal kira-kira Rp8,14 per detik untuk komponen durasi dominan, lalu ditambah overhead teks.
- Untuk video short 60 detik, estimasi total normal ada di sekitar Rp650 - Rp950 per generate.
- Angka exact per job baru bisa dihitung setelah aplikasi menyimpan `usage_metadata` dari Gemini.
