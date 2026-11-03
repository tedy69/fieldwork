# Mulai menggunakan Fieldwork

Panduan ini untuk menjalankan demo lokal dan mulai berkontribusi. Tampilan aplikasi masih memakai bahasa Inggris.

## Siapkan proyek

Pasang Git dan **Node.js 24 LTS** beserta npm. Periksa versi Node dengan `node --version`; hasilnya harus `v24.x.x`. Jika memakai nvm, jalankan `nvm install 24` lalu `nvm use 24`.

```sh
git clone https://github.com/tedy69/fieldwork.git
cd fieldwork
npm ci
npm run db:seed
npm run dev
```

`npm ci` memasang dependensi sesuai lockfile. `db:seed` membuat akun dan pekerjaan demo di `data/fieldwork.sqlite`. Jalankan seed sekali pada basis data kosong. Jika data sudah ada, seed akan menolak menimpanya; jangan hapus data yang masih dibutuhkan.

Biarkan terminal tetap berjalan. Buka [http://localhost:5173](http://localhost:5173) untuk aplikasi web. API berjalan di [http://localhost:3001](http://localhost:3001); [http://localhost:3001/health](http://localhost:3001/health) dapat dipakai untuk memeriksa apakah server aktif. Gunakan `Ctrl+C` untuk menghentikan web dan API.

Port 5173 dan 3001 harus tersedia. Jika salah satunya sedang dipakai, hentikan proses demo milik Anda yang memakai port tersebut sebelum menjalankan proyek lagi.

## Masuk dengan akun demo

| Peran               | Email                     | Kata sandi       |
| ------------------- | ------------------------- | ---------------- |
| Pengelola penugasan | `manager@fieldwork.local` | `fieldwork-demo` |
| Petugas lapangan    | `worker@fieldwork.local`  | `fieldwork-demo` |

Akun, lokasi, dan pekerjaan dari seed adalah data contoh. Akun ini hanya untuk demo lokal. Untuk server yang akan digunakan bersama tim, ikuti [panduan self-hosting](self-hosting.md) dan [catatan keamanan](../SECURITY.md).

Sebagai petugas, buka salah satu pekerjaan di **My assignments**, isi hasil pemeriksaan dan ringkasan, lalu lampirkan foto. Pengelola dapat meninjau laporan setelah laporan berhasil tersinkron. Gunakan profil browser terpisah jika ingin mencoba kedua peran bersamaan.

## Coba bekerja tanpa koneksi

Halaman yang dimuat ulang saat offline membutuhkan **build produksi**. Service worker tidak diaktifkan oleh `npm run dev`.

1. Hentikan `npm run dev` dengan `Ctrl+C`.
2. Jalankan perintah berikut dari folder proyek:

   ```sh
   npm run build
   npm start
   ```

3. Buka [http://localhost:3001](http://localhost:3001) dan masuk sebagai petugas saat masih online. Tunggu service worker aktif; statusnya bisa diperiksa di DevTools, bagian **Application → Service Workers**. Muat ulang sekali saat masih online, lalu buka satu pekerjaan agar tersimpan di perangkat.
4. Isi pemeriksaan, catatan dan ringkasan, lalu tambahkan foto. Gunakan mode **Offline** di panel Network pada DevTools browser. Muat ulang halaman dan buka pekerjaan tadi untuk memeriksa bahwa draf masih ada.
5. Pilih **Save report for sync**. Laporan masuk ke **Sync outbox** dan tetap di perangkat sampai server mengonfirmasi penerimaannya.
6. Matikan mode Offline dan tekan ikon sinkronisasi (**Sync now**) bila laporan masih menunggu. Jika sesi berakhir, masuk lagi dengan akun petugas yang sama.

Jika laporan tertahan karena pekerjaan sudah berubah, buka **Sync outbox**. Gunakan **Export draft** untuk menyimpan salinan JSON berisi jawaban, catatan dan foto. File ini berisi data laporan; simpan secara pribadi. Ekspor tidak mengirim laporan atau menghapus antrean. **Keep draft and open latest order** mengambil versi pekerjaan terbaru agar Anda bisa memeriksa draf sebelum mengirim ulang. Jika pekerjaan tidak lagi tersedia untuk akun tersebut, hubungi pengelola; jangan menghapus data browser untuk mencoba memperbaiki sinkronisasi. Lihat [cara kerja sinkronisasi](offline-sync.md).

## Jalankan pemeriksaan sebelum membuka PR

Dari folder proyek, jalankan:

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`npm run check` memeriksa format, tipe web/mobile, tes unit/API, dan membuat build web produksi. Jalankan tes browser setelah build selesai. Tes browser memakai server dan basis data sementara sendiri, terpisah dari data demo Anda. Port 4173 harus tersedia untuk tes tersebut.

Jika mengubah aplikasi Expo, jalankan juga `npm run check:expo` dan ikuti [panduan pengujian mobile](mobile.md). Pemeriksaan tipe atau ekspor JavaScript tidak menggantikan pengujian di simulator atau perangkat.

Baca [panduan kontribusi](../CONTRIBUTING.md) sebelum membuat perubahan. Gunakan data sintetis dalam tes dan tangkapan layar. Jangan masukkan token, file `.env`, basis data SQLite, atau bundel hasil build ke Git.
