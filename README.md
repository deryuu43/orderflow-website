# OrderFlow — Sistem Manajemen Pemesanan & Produksi Bisnis Custom

> **Manage Orders. Track Production. Deliver on Time.**

OrderFlow adalah aplikasi web SaaS multi-tenant untuk bisnis manufaktur berbasis pesanan seperti **Percetakan, Konveksi, Sablon, Merchandise, Souvenir, dan Furniture Custom**.

---

## Arsitektur & Teknologi

Di lingkungan AI Studio Cloud Run, OrderFlow berjalan di atas:
- **Database**: Google Cloud SQL untuk **PostgreSQL** (dikelola melalui **Drizzle ORM** & `pg.Pool` Object Method)
- **Autentikasi**: **Firebase Authentication** (Google Sign-In OAuth dengan verifikasi ID Token server-side `firebase-admin`)
- **Backend API**: Node.js + Express + validasi skema **Zod** + proteksi Rate Limiting & isolasi tenant `business_id`
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + React Router + React Hook Form + Recharts + jsPDF Invoice Generator

---

## 8 Modul Utama

1. **Autentikasi & Workspace Otomatis**: Login/Register Google OAuth, pembuatan workspace bisnis otomatis untuk Owner baru, klaim undangan otomatis untuk Admin/Staf Produksi/Pelanggan, manajemen profil & role (RBAC).
2. **Dashboard Operasional**: 6 kartu statistik real-time dari PostgreSQL, grafik pesanan & pendapatan bulanan (Recharts), distribusi status produksi, deadline terdekat, daftar perhatian, dan log aktivitas.
3. **Manajemen Pesanan**: Multi-item produk (`Subtotal = ∑(Qty × Harga Satuan)`, `Grand Total = Subtotal + Biaya Tambahan - Diskon`), penomoran otomatis, pencarian, filter status & tanggal, paginasi, dan pembatalan aman.
4. **Manajemen Pelanggan**: Direktori pelanggan, riwayat pesanan, total nilai transaksi terverifikasi, dan undangan ke Customer Portal.
5. **Manajemen Produksi (Kanban & QC Gate)**: Papan Kanban 6 tahap (`Menunggu Produksi`, `Persiapan`, `Dalam Produksi`, `Quality Control`, `Siap Dikirim`, `Selesai`). Produksi dikunci hingga pesanan dikonfirmasi, DP terpenuhi, dan desain disetujui. Pekerjaan wajib lolos inspeksi **QC** sebelum dikirim/selesai.
6. **Manajemen Desain & Revisi**: Unggah draf desain ber-versi (`v1`, `v2`, ...), unggah referensi pelanggan, permintaan revisi dengan catatan, dan persetujuan desain yang mengunci acuan produksi resmi.
7. **Pembayaran & Invoice PDF**: Pembayaran bertahap (DP, Cicilan, Pelunasan, Refund), unggah bukti transfer, verifikasi Admin dalam transaksi database atomik, serta unduh **PDF Invoice** siap cetak.
8. **Pelacakan Pesanan Publik (`/track/[token]`)**: Pelacakan aman berbasis token acak kriptografis + verifikasi PIN 4 digit nomor telepon pelanggan tanpa mengekspos data internal bisnis.

---

## Struktur Folder Proyek

```text
/
├── migrations/
│   └── 0001_orderflow_schema.sql     # SQL migration lengkap 18 tabel + trigger + RLS
├── src/
│   ├── db/
│   │   ├── drizzle.config.ts         # Konfigurasi Drizzle Kit (Admin SQL)
│   │   ├── index.ts                  # Koneksi Pool PostgreSQL (Object Method)
│   │   ├── schema.ts                 # Definisi 18 tabel ternormalisasi
│   │   ├── workspace.ts              # Upsert pengguna, RBAC & provisioning tenant
│   │   └── repositories/             # Query layer & transaksi bisnis
│   ├── lib/
│   │   ├── firebase.ts               # Client Firebase Auth
│   │   ├── firebase-admin.ts         # Server Firebase Admin SDK
│   │   ├── fileUpload.ts             # Validasi & kompresi upload gambar
│   │   ├── formatters.ts             # Format Rupiah, tanggal & label Indonesia
│   │   └── pdfInvoice.ts             # Generator Invoice PDF
│   ├── middleware/
│   │   └── auth.ts                   # Verifikasi Bearer Token, RBAC & Rate Limiter
│   ├── context/
│   │   └── AuthContext.tsx           # State autentikasi in-memory token
│   ├── components/
│   │   ├── layout/AppShell.tsx       # Sidebar adaptif role & notifikasi
│   │   └── ui/DesignSystem.tsx       # Komponen UI konsisten
│   └── pages/                        # Seluruh halaman aplikasi & Customer Portal
└── server.ts                         # Express API Server + Vite Middleware
```

---

## Instalasi & Menjalankan Lokal

1. Salin variabel environment dari `.env.example` ke `.env` dan sesuaikan kredensial PostgreSQL (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`).
2. Instal dependensi:
   ```bash
   npm install
   ```
3. Terapkan skema database PostgreSQL menggunakan Drizzle Kit:
   ```bash
   npx drizzle-kit push --config=src/db/drizzle.config.ts
   ```
4. Jalankan server pengembangan (port `3000`):
   ```bash
   npm run dev
   ```
5. Untuk build produksi:
   ```bash
   npm run build
   npm start
   ```
