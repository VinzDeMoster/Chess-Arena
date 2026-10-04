# Chess Arena

Prototype website catur realtime berbasis Firebase.

## Fitur
- Email/password Login + Sign Up
- Profil, Elo/rating, rank, win/draw/loss
- History
- Ranked & Classic matchmaking queue
- Friend room dengan kode 14 karakter
- Computer: Easy, Normal, Hard, Super Hard, Impossible
- Training panel yang hanya aktif untuk akun dengan `trainingAccess`
- Friend requests
- Admin panel: user management, admin role, Elo/rank, announcement realtime, maintenance
- Firestore security rules

## Setup
1. Buat Firebase project.
2. Aktifkan Authentication > Email/Password.
3. Buat Firestore Database.
4. Tambahkan Web App.
5. Isi `firebase-config.js`.
6. Deploy rules dari `firestore.rules`.
7. Jalankan melalui web server (jangan buka file HTML langsung dengan `file://`).
8. Setelah akun pertama dibuat, jadikan akun admin melalui Firebase Console dengan mengubah:
   `users/<UID>.admin = true`
9. Login ulang.

## Catatan keamanan
Admin panel client-side tetap harus dilindungi Firestore Rules. Untuk produksi, operasi sensitif seperti menghapus akun Authentication, custom claims, suspend/banned enforcement, dan perubahan role sebaiknya dilakukan melalui Cloud Functions/Admin SDK, bukan langsung dari browser.

## Fair-play
Fitur Training/Mod pada proyek ini dibatasi untuk private/computer/training games. Tidak ada fitur untuk mengganggu lawan, membuat koneksi lawan lag, atau menghindari sistem deteksi pada pertandingan publik.


## FIXED build
Versi ini memperbaiki:
- Firebase init error tidak lagi membuat halaman terlihat "diam".
- Login/signup menampilkan error yang jelas.
- Akun Firebase yang sudah ada tetapi dokumen `users/<UID>` hilang akan dibuat ulang otomatis.
- chess.js tidak lagi dimuat saat halaman login, sehingga kegagalan library catur tidak memblokir Login.
- Firestore listener diberi error handler.
- History tidak bergantung pada composite index `orderBy`.
- Queue matchmaking tidak dibuat ulang saat Cancel.
- Room/game punya pengecekan error yang lebih jelas.
- Admin user management lebih tahan terhadap data kosong.

### Jika masih stuck
Buka browser console dan cari pesan merah. Pastikan:
1. Authentication > Sign-in method > Email/Password = Enabled.
2. Firestore Database sudah dibuat.
3. `firebase-config.js` cocok dengan Web App Firebase.
4. `firestore.rules` sudah dipublish.
5. Website dijalankan lewat HTTPS/web server, bukan `file://`.
