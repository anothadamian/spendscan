# SpendScan

Versi awal aplikasi pencatatan pengeluaran lokal dengan Next.js App Router dan React. Desain mengikuti `apple-DESIGN (1).md`: permukaan putih/abu-abu, aksen #0066cc, panel charcoal, tanpa bayangan dekoratif.

## Menjalankan

```sh
npm install
npm run dev
```

Buka http://localhost:3000. Untuk produksi lokal: `npm run build` lalu `npm start`.

## Yang tersedia

- Dashboard bulanan, grafik mingguan, kategori, transaksi terbaru.
- Data contoh terpisah dari transaksi pribadi; transaksi pribadi mulai kosong.
- Input manual dan pembacaan struk dengan Google Gemini, lalu review dan konfirmasi transaksi.
- Riwayat dengan pencarian, filter kategori, dan ekspor CSV.
- Pencapaian dan streak berdasarkan tanggal transaksi.
- Money Wrapped bulanan dengan salin ringkasan.
- Tampilan responsif untuk desktop dan ponsel.

## Batas versi ini

Data pribadi disimpan di localStorage browser ini, bukan akun/cloud. Gunakan ekspor CSV untuk menyimpan salinan; menghapus data browser dapat menghapus catatan. Mode contoh tidak mengubah data pribadi.

## Scanner Gemini

Isi `GEMINI_API_KEY` di `.env.local` dengan API key milikmu dari https://aistudio.google.com/apikey. Jangan kirim key melalui chat atau masukkan ke variabel `NEXT_PUBLIC_`. `GEMINI_MODEL` secara default `gemini-3.8-flash` dan dapat disesuaikan dengan model yang tersedia di proyek Google milikmu. Setelah mengubah konfigurasi, restart `npm run dev` jika status belum diperbarui.

Alur: pilih foto → tekan **Baca dengan AI** → periksa merchant, total rupiah, kategori, dan tanggal → **Konfirmasi & simpan**. Memilih foto saja tidak mengirimnya. API key hanya dibaca oleh server. Foto dikirim ke Google Gemini setelah tombol ditekan dan tidak disimpan oleh aplikasi. Pemrosesan Google mengikuti kebijakan akun/API yang digunakan. Data pengeluaran tetap disimpan lokal setelah konfirmasi. Total mata uang selain IDR atau mata uang yang tidak dikenali tidak diisi otomatis; pengguna mengisi nilai rupiah sendiri.

Scanner menerima JPG, PNG, WebP maksimal 5 MB dengan pemeriksaan signature server. Hasil divalidasi; angka/tanggal yang tidak terbaca tetap kosong. Ada timeout, penanganan kuota/API key, pembatasan 10 percobaan per menit per proses, satu scan aktif, dan pembatalan saat dialog ditutup. Endpoint dibatasi ke localhost dengan Origin sama karena aplikasi ini belum memiliki autentikasi. Jangan membuka server ke publik tanpa menambahkan autentikasi dan pembatasan penggunaan lintas proses. Belum ada login, sinkronisasi, atau PWA offline.

Dokumentasi integrasi: https://ai.google.dev/gemini-api/docs/generate-content/image-understanding dan https://ai.google.dev/gemini-api/docs/generate-content/structured-output.

## Pemeriksaan

`npm test` menjalankan 17 pengujian scanner dengan respons Gemini tiruan (tanpa panggilan eksternal), termasuk urutan fallback otomatis `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash` ketika model sedang penuh. `npm run typecheck` dan `npm run build` memeriksa kompilasi. Pembacaan struk sungguhan memerlukan API key yang valid.
