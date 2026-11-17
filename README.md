# Wedding Invitation — Alif & Indy

Undangan pernikahan dengan frontend statis (HTML/CSS/JS murni) dan backend kecil **Bun + Neon Postgres** untuk RSVP & ucapan.

---

## 📁 Struktur

```
├── server.ts            # Bun server: API + serve folder public
├── vercel.json          # Konfigurasi deploy Vercel (Bun runtime)
├── bun.lock             # Wajib untuk preset Bun di Vercel
├── public/
│   ├── index.html       # halaman undangan
│   ├── css/invitation.css
│   ├── js/invitation.js
│   ├── images/
│   ├── audio/
│   ├── favicon.ico
│   └── robots.txt
├── .env                 # kredensial database (tidak di-commit)
├── .env.example
└── package.json
```

Backend memakai `Bun.SQL` bawaan Bun (tanpa driver database tambahan); satu-satunya dependency runtime adalah `nodemailer` untuk notifikasi SMTP. Dev dependency: `@types/bun` dan `@types/nodemailer`.

---

## 🚀 Menjalankan Lokal

1. Salin `.env.example` ke `.env`.
2. Isi konfigurasi SMTP (wajib). Database opsional — set `DATABASE=true` + URL Neon kalau ingin menyimpan data.
3. Jalankan:

```bash
bun run start
```

Buka `http://localhost:8080` atau `http://localhost:8080/?to=Budi+Santoso`.

Mode auto-reload saat development:

```bash
bun run dev
```

Server menolak start jika `SMTP_HOST`, `MAIL_TO`, dan `MAIL_FROM` (atau `SMTP_USER`) belum diisi.
Tabel `rsvps` dan `wishes` dibuat otomatis hanya saat `DATABASE=true`.

### Environment Variables

Semua konfigurasi dibaca dari `.env` (Bun memuatnya otomatis). Di Vercel, isi variabel yang sama lewat Project Settings → Environment Variables.

| Variabel | Wajib | Default | Keterangan |
| :--- | :--- | :--- | :--- |
| `DATABASE` | Tidak | `false` | `true` untuk menyimpan RSVP & ucapan di PostgreSQL; `false` = mode email-only. |
| `DATABASE_URL` | Ya jika `DATABASE=true` | — | Connection string Neon (direct). |
| `DATABASE_URL_POOLED` | Tidak | — | Connection string Neon pooled; dipakai lebih dulu jika ada. |
| `PORT` | Tidak | `8080` | Port lokal (diabaikan Vercel). |
| `TRUST_PROXY` | Tidak | `0` | `1` jika di belakang Caddy/Nginx agar IP asli dari `X-Forwarded-For` dipakai dan cookie `Secure` aktif. |
| `SMTP_HOST` | **Ya** | — | Host SMTP, contoh `smtp.gmail.com`. |
| `SMTP_PORT` | Tidak | `587` | Port SMTP. |
| `SMTP_SECURE` | Tidak | `false` | `true` untuk TLS langsung (biasanya port 465); `false` untuk STARTTLS. |
| `SMTP_USER` | Tidak | — | Username SMTP (wajib untuk Gmail). |
| `SMTP_PASS` | Tidak | — | Password / API key SMTP (Gmail: App Password). |
| `MAIL_FROM` | **Ya*** | `SMTP_USER` | Alamat pengirim. |
| `MAIL_TO` | **Ya** | — | Alamat pemilik yang menerima notifikasi. |

\* Wajib diisi jika `SMTP_USER` kosong.

Contoh `.env.example` memakai Gmail (`smtp.gmail.com:587`, STARTTLS). Untuk Gmail, `SMTP_PASS` harus **App Password 16 karakter** (aktifkan 2-Step Verification lalu buat di [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)); password akun biasa akan ditolak. Untuk port 465 set `SMTP_SECURE=true`.

### Mode tanpa database (default)

Saat `DATABASE=false`:

- RSVP dan ucapan tidak disimpan; setiap kiriman hanya dikirim ke email `MAIL_TO`.
- Karena email adalah satu-satunya rekaman, kegagalan SMTP membuat request gagal (`502`) supaya tamu bisa mencoba lagi.
- Daftar ucapan di halaman hanya berasal dari memori instance server yang sedang hidup — hilang saat restart dan tidak dibagi antar instance (mis. di Vercel).
- Set `DATABASE=true` untuk penyimpanan permanen. Saat database aktif, kegagalan SMTP hanya dicatat di log (`[mail]`) dan data tetap tersimpan.

---

## 🔌 API

| Method | Path | Keterangan |
| :--- | :--- | :--- |
| `GET` | `/api/csrf` | Ambil token CSRF (sekaligus set cookie `csrf`) |
| `GET` | `/api/wishes` | 30 ucapan terbaru |
| `POST` | `/api/rsvp` | Simpan konfirmasi kehadiran |
| `POST` | `/api/wishes` | Simpan ucapan + kembalikan daftar terbaru |

`POST` menerima JSON dan wajib menyertakan header `X-CSRF-Token` yang sama dengan cookie `csrf`.

Setiap `POST` yang berhasil mengirim notifikasi email ke `MAIL_TO` (konfigurasi SMTP wajib).

---

## 🔒 Keamanan

- **CSRF**: token acak 256-bit, cookie `HttpOnly` + `SameSite=Strict`, dicocokkan dengan header via constant-time compare.
- **Origin check**: request `POST` dengan `Origin` berbeda ditolak.
- **Rate limit**: maksimal 10 kiriman per 5 menit per endpoint. Kuncinya kombinasi IP + User-Agent + `Accept-Language` + `Sec-CH-UA*`, jadi banyak tamu di satu IP (NAT/WiFi venue) tidak saling memblokir (in-memory, reset saat server restart).
- **Validasi ganda**: di browser dan di server (nama, panjang pesan, jumlah tamu, pilihan kehadiran).
- **Query parameterized** (`Bun.SQL` tagged template), tanpa string SQL dinamis.
- Batas ukuran body 64 KB, `Content-Type` wajib `application/json`.

---

## 🌐 Deploy ke Vercel (satu klik)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffaiz2710%2Fwedding-lite&env=DATABASE,DATABASE_URL,DATABASE_URL_POOLED,SMTP_HOST,SMTP_PORT,SMTP_SECURE,SMTP_USER,SMTP_PASS,MAIL_FROM,MAIL_TO&envDescription=SMTP%20wajib%3B%20DATABASE%20opsional%20(default%20false)&project-name=wedding-invitation&repository-name=wedding-invitation)

Atau via CLI:

```bash
bunx vercel login
bunx vercel deploy
```

Saat import project, isi environment variable SMTP (wajib). Variabel database Neon (`DATABASE_URL`, `DATABASE_URL_POOLED`) hanya perlu diisi jika ingin mengaktifkan penyimpanan dengan `DATABASE=true`; default `DATABASE=false`. Lihat tabel [Environment Variables](#environment-variables).

Konfigurasi yang sudah disiapkan di `vercel.json`:

- `bunVersion: "1.4.x"` → seluruh Function berjalan di runtime Bun.
- `server.ts` + `bun.lock` → Vercel otomatis memakai **Bun framework preset**, jadi semua request (HTML, aset, API) ditangani `Bun.serve()`.
- `functions.includeFiles: "public/**"` → folder `public/` ikut dibundel ke Function (tanpa ini aset statis akan 404 di Vercel).
- `regions: ["sin1"]` → Function di Singapore, dekat database Neon `ap-southeast-1`.

Catatan: `nodemailer` adalah satu-satunya dependency runtime; sisanya hanya tipe TypeScript untuk development.

---

## 🌐 Deploy VPS

Jalankan `bun run start` sebagai service (systemd/pm2), lalu reverse proxy Caddy/Nginx ke port `8080`.

Jika di belakang reverse proxy, set `TRUST_PROXY=1` agar rate limit memakai IP asli dari `X-Forwarded-For` dan cookie `Secure` aktif pada HTTPS.

Contoh systemd:

```ini
[Unit]
Description=Wedding Invitation
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/wedding-lite
ExecStart=/usr/local/bin/bun run /var/www/wedding-lite/server.ts
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 🎯 Fitur

1. Opening amplop 3D + personalisasi nama tamu via URL `?to=Nama+Tamu`.
2. Musik latar dengan tombol play/pause (mulai setelah interaksi pengguna).
3. Hero ayat QS Ar-Rum:21, profil mempelai, detail akad & resepsi.
4. Tombol **"Simpan ke kalender"** — file `.ics` dibuat di browser.
5. Lokasi + tombol Google Maps.
6. Countdown real-time menuju 28 November 2026.
7. Kado digital dengan tombol salin nomor rekening.
8. Galeri momen.
9. RSVP dan Wedding Wishes — bisa disimpan di PostgreSQL (`DATABASE=true`) atau hanya dikirim via email (`DATABASE=false`, default).
10. Notifikasi email otomatis via SMTP setiap ada RSVP atau ucapan baru.
