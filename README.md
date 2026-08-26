# Monitoring Stok & Tools TBS TCN — versi web (Vercel)

Project ini siap di-deploy ke Vercel. Semua orang yang membuka link deployment-nya akan **melihat & mengubah data yang sama** (tersimpan di server lewat database Upstash Redis), bukan cuma tersimpan di browser masing-masing.

## Isi folder

```
index.html      -> seluruh aplikasi (dashboard, real stok, stock opname, barang masuk/keluar, tools, master kode spek)
api/state.js    -> serverless function untuk baca/simpan data (dipakai otomatis oleh index.html)
package.json    -> dependency @upstash/redis
```

## Langkah deploy

### 1. Deploy ke Vercel

**Cara tercepat (tanpa GitHub) — pakai Vercel CLI:**
```bash
npm install -g vercel
cd tcn-stock-webapp     # masuk ke folder ini
vercel                  # ikuti instruksi (login, pilih/buat project)
vercel --prod           # deploy ke production
```

**Atau lewat GitHub:**
1. Upload folder ini jadi repo baru di GitHub.
2. Di vercel.com -> **Add New Project** -> import repo tersebut.
3. Framework preset biarkan **"Other"**, klik **Deploy**.

Deployment pertama ini akan **gagal/error saat dibuka** dulu — itu wajar, karena database-nya belum dipasang (langkah 2).

### 2. Aktifkan database Upstash Redis (penyimpanan bersama)

> Vercel KV sudah dihentikan (di-sunset) dan dipindah ke Vercel Marketplace dengan nama **Upstash Redis**. Fungsinya sama persis seperti KV dulu, cuma nama & letak menunya berubah.

1. Buka project-nya di dashboard Vercel -> tab **Storage** (atau menu **Marketplace** di sidebar).
2. Cari **"Upstash for Redis"** (kadang muncul sebagai **"Upstash"** saja) -> klik **Add** / **Install**.
3. Kalau diminta, pilih **Create Database** (paket gratis cukup untuk pemakaian kecil), beri nama bebas.
4. Pastikan langkah **Connect Project** memilih project ini, lalu **Save** / **Connect**.
5. Vercel akan otomatis menambahkan environment variable yang dibutuhkan (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — kadang juga muncul dengan nama lama `KV_REST_API_URL` / `KV_REST_API_TOKEN`; kode di `api/state.js` sudah mendukung kedua nama tersebut) ke project ini.

**Kalau di dashboard benar-benar tidak ada opsi Storage/Marketplace** (jarang terjadi, biasanya karena akun/region tertentu), alternatif manual lewat Upstash langsung:
1. Buat akun gratis di upstash.com -> buat database Redis baru.
2. Di halaman database itu, salin **REST URL** dan **REST TOKEN**-nya.
3. Di Vercel: project ini -> **Settings** -> **Environment Variables** -> tambahkan manual:
   - `UPSTASH_REDIS_REST_URL` = (REST URL dari Upstash)
   - `UPSTASH_REDIS_REST_TOKEN` = (REST TOKEN dari Upstash)
4. Lanjut ke langkah 3 di bawah (redeploy).

### 3. Redeploy

Environment variable baru hanya berlaku setelah deploy ulang:
- Dashboard Vercel -> tab **Deployments** -> klik **...** pada deployment terakhir -> **Redeploy**.
- Atau jalankan `vercel --prod` lagi dari terminal.

### 4. Cek

Buka URL deployment-nya (mis. `https://nama-project.vercel.app`). Di pojok kanan atas harus muncul tulisan:

> **Tersimpan di server — dibagikan ke semua pengguna**

Kalau yang muncul malah **"Tersimpan di browser ini saja"**, berarti database Upstash belum ter-connect dengan benar, atau belum redeploy setelah connect — ulangi langkah 2–3.

## Catatan

- Data awal (isi 5 sheet Excel yang diunggah) sudah tertanam di `index.html` sebagai data awal. Begitu ada transaksi pertama, data disimpan ke database dan dipakai bersama sejak saat itu.
- Aplikasi ini otomatis mendeteksi cara ia dibuka: kalau dibuka langsung sebagai file (bukan lewat Vercel), ia akan memakai penyimpanan browser (localStorage) tanpa error — tapi datanya tidak akan dibagikan ke orang lain. Untuk berbagi data, harus diakses lewat link Vercel yang sudah di-deploy.
- Tombol **"Reset ke data awal"** di aplikasi akan mereset data untuk **semua orang** yang memakai link ini — dipakai dengan hati-hati.
- Kalau butuh kontrol akses (misalnya supaya tidak sembarang orang bisa reset/edit data), itu perlu ditambahkan lapisan login — beri tahu Claude kalau butuh ini nanti.
