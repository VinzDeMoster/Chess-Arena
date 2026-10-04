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
