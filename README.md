# Scriptoria (Vue 3 + Auth API)

Scriptoria adalah ruang digital pribadi untuk menulis, mengelola, dan membagikan cerita dengan pengalaman baca yang cepat, bersih, dan fokus pada isi.

## Fitur Utama

- Login backend dengan session token (`access` + `refresh`)
- RBAC role: `admin`, `manager`, `staff`, `viewer`
- Audit log aktivitas autentikasi dan workspace
- Manajemen cerita:
  - Buat, edit, hapus cerita
  - Status cerita (`Draft`, `Review`, `Published`, `Archived`)
  - Target kata dan progres menulis
- Editor bab:
  - Simpan dokumen per cerita
  - Publish cerita
  - Halaman baca publik per cerita
- Aktivitas menulis:
  - Catat sesi tambah/kurang kata
  - Riwayat aktivitas
- Backup & data:
  - Export JSON / CSV / XLSX
  - Import JSON / CSV / XLSX
  - Auto-backup + restore
  - Undo aksi terakhir
- Persist data ke SQLite (backend)
- Migrasi otomatis data legacy `inventory_*` ke schema Scriptoria saat startup backend

## Teknologi

- Vue 3 + Vite
- Pinia
- Vue Router
- Tailwind CSS + daisyUI
- Node.js native HTTP API
- SQLite (`node:sqlite`)

## Prasyarat

- Node.js `v22+`

## Menjalankan Aplikasi

```bash
npm install
npm run dev:server
npm run dev
```

Jalankan `dev:server` dan `dev` di terminal terpisah.

## Konfigurasi Environment

Contoh `.env.example`:

```env
VITE_API_BASE_URL=http://localhost:8787
VITE_APP_DEMO_PASSWORD=Admin@12345

API_PORT=8787
API_HOST=127.0.0.1
CLIENT_ORIGIN=http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173
ACCESS_TOKEN_TTL_SEC=900
REFRESH_TOKEN_TTL_SEC=604800
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=5
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@12345
AUTH_DB_PATH=server/data/scriptoria-auth.db
```

## Struktur Singkat

- `src/components/scriptoria/` komponen UI Scriptoria
- `src/views/` halaman utama aplikasi
- `src/layouts/` layout aplikasi
- `src/stores/scriptoria.js` state + logic workspace cerita
- `src/stores/auth.js` state autentikasi
- `src/router/index.js` route + auth guard
- `server/index.js` auth API + Scriptoria API + SQLite

## Endpoint API (Ringkas)

Auth:
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

Scriptoria:
- `GET /api/scriptoria/snapshot`
- `PATCH /api/scriptoria/settings`
- `POST /api/scriptoria/stories`
- `PATCH /api/scriptoria/stories/:id`
- `DELETE /api/scriptoria/stories/:id`
- `POST /api/scriptoria/stories/:id/words`
- `GET /api/scriptoria/stories/:id/document`
- `PUT /api/scriptoria/stories/:id/document`
- `POST /api/scriptoria/stories/:id/publish`
- `GET /api/scriptoria/stories/:id/public`
- `POST /api/scriptoria/import`

Admin:
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id/role`
- `GET /api/admin/audit-logs`
