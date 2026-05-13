# Estimasi Biaya Pembuatan Video (Voice Short App)

Dokumen ini berisi estimasi kalkulasi biaya untuk 1 kali *generate job* (pembuatan voice over, analisis visual, penyusunan script, pembuatan hashtag, dan caption) menggunakan **Gemini AI** dan layanan **Text-to-Speech (TTS) Standar Premium**.

*(Asumsi Kurs: 1 USD = Rp 16.000)*

---

## 1. Parameter Penggunaan AI (Per Video)

Berdasarkan algoritma aplikasi, sistem menggunakan alur berikut:
1. **Ekstraksi Frame**: Sistem mengekstrak gambar dari video (dibatasi maksimum **20 frame** per video untuk menghemat biaya dan memori).
2. **Analisis Visual (Gemini)**: Membaca 20 frame + instruksi sistem untuk merangkum kejadian di video.
3. **Pembuatan Script (Gemini)**: Menulis naskah dengan panjang sekitar 1.8 kata/detik (1 menit = ~108 kata | 15 menit = ~1.620 kata).
4. **Pembuatan Caption (Gemini)**: Menulis caption sosial media dan hashtag berdasarkan script.
5. **Text-to-Speech (TTS)**: Mengubah script teks menjadi suara MP3/WAV.

---

## 2. Estimasi Biaya Menggunakan Gemini 1.5 Flash (Paling Ekonomis & Cepat)

Gemini 1.5 Flash sangat disarankan untuk automasi dalam jumlah besar karena biayanya yang sangat murah.
*Harga resmi API Flash: Input $0.075/1M token | Output $0.30/1M token | Gambar ~$0.00002/gambar*

### A. Durasi Pendek (1 Menit)
- **Token Gambar (20 Frame)**: ~$0.0004 (Rp 6,4)
- **Token Teks Input & Output (Analisis, Script, Caption)**: ~$0.0007 (Rp 11,2)
- **Biaya Text-to-Speech (~800 karakter)**: ~$0.0128 (Rp 204,8)
- **TOTAL ESTIMASI BIAYA**: **~Rp 225 per video**

### B. Durasi Panjang (15 Menit)
- **Token Gambar (20 Frame - dilimitasi sistem)**: ~$0.0004 (Rp 6,4)
- **Token Teks Input & Output (Script panjang ~1600 kata)**: ~$0.0020 (Rp 32)
- **Biaya Text-to-Speech (~12.000 karakter)**: ~$0.192 (Rp 3.072)
- **TOTAL ESTIMASI BIAYA**: **~Rp 3.110 per video**

---

## 3. Estimasi Biaya Menggunakan Gemini 1.5 Pro (Akurasi Tinggi / Reasoning Complex)

Jika menggunakan Gemini 1.5 Pro (misalnya untuk kebutuhan konten bernalar tinggi), harganya jauh lebih mahal dibanding Flash.
*Harga resmi API Pro: Input $3.50/1M token | Output $10.50/1M token | Gambar ~$0.0013/gambar*

### A. Durasi Pendek (1 Menit)
- **Token Gambar (20 Frame)**: ~$0.026 (Rp 416)
- **Token Teks Input & Output**: ~$0.028 (Rp 448)
- **Biaya Text-to-Speech**: ~$0.0128 (Rp 205)
- **TOTAL ESTIMASI BIAYA**: **~Rp 1.069 per video**

### B. Durasi Panjang (15 Menit)
- **Token Gambar (20 Frame)**: ~$0.026 (Rp 416)
- **Token Teks Input & Output**: ~$0.078 (Rp 1.248)
- **Biaya Text-to-Speech**: ~$0.192 (Rp 3.072)
- **TOTAL ESTIMASI BIAYA**: **~Rp 4.736 per video**

---

## 4. Kesimpulan & Rekomendasi
Dari data di atas, dapat dilihat bahwa biaya terbesar untuk video berdurasi panjang (seperti 15 menit) justru tidak terletak pada Gemini AI, melainkan pada pemrosesan **Text-to-Speech (TTS)** karena jumlah karakter yang disintesis sangat banyak.

Sedangkan berkat optimasi **pembatasan ekstraksi maksimum 20 frame gambar** per video yang baru saja kita pasang, biaya pembacaan visual AI (Computer Vision) menjadi *sangat murah dan statis*, terlepas dari apakah video tersebut berdurasi 1 menit atau 15 menit.

**Rekomendasi Skala Besar:**
Gunakan **Gemini 1.5 Flash**, maka modal operasional bersih untuk menghasilkan konten video utuh:
- **Video 1 Menit (Shorts/Reels/TikTok)**: Hanya **Rp 250,-** / video.
- **Video 15 Menit (YouTube Long Form)**: Sekitar **Rp 3.200,-** / video.
