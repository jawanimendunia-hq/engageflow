# EngageFlow

Workflow manager komentar media sosial. Aplikasi ini **TIDAK** melakukan auto-post — ia hanya membantu mengatur, membagi, dan menampilkan komentar agar kamu bisa mengeksekusinya secara **manual** dengan cepat dan efisien.

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Deploy:** Vercel

---

## Fitur

- 🔐 Login email + password (Supabase Auth)
- 🌗 Light / dark / system theme
- 📊 Dashboard dengan ringkasan campaign, antrian per akun, stok komentar per kategori
- 🗂️ Sistem campaign dengan jumlah komentar per link kustom
- 📝 Catatan campaign, waktu perubahan terakhir, hapus campaign, dan penanda selesai manual
- 🔗 Manajemen link bulk import + kategori
- 🏷️ Riwayat keyword pencarian Meta pada setiap link
- ✨ **Import dari Meta Ads** — auto-fetch link postingan iklan via Marketing API, by campaign name atau ad creative name (multi keyword + pagination)
- 🏷️ **SKU dictionary** — auto-detect kategori dari kode SKU di nama campaign (mis. "KCM" → "kacamata")
- 🤖 **AI Komentar multi-provider** — opsional, auto-generate komentar saat import dari Meta Ads memakai Gemini, Cerebras, dan Groq dengan weighted rotation serta OpenRouter Free sebagai fallback terakhir. Free tier supported.
- 👥 Manajemen banyak akun dengan warna container Firefox
- 💬 Template komentar berbasis kategori + tone (pertanyaan/santai/testimoni/reaksi)
- ⚙️ **Mesin assignment otomatis**: variasi tone, distribusi merata, urutan akun acak, tidak ada duplikasi per link
- ⚡ **Mode Eksekusi Cepat**: per-akun, 1 link per layar, auto-open + auto-copy, full keyboard shortcut
- 📈 Tracking penggunaan komentar untuk balancing antar link
- 🔒 Row Level Security: setiap user hanya melihat datanya sendiri; token Meta di-encrypt AES-256-GCM

---

## Setup (5 menit)

### 1. Clone & install

```bash
npm install
```

### 2. Buat project Supabase

- Buka <https://supabase.com> → New project
- Tunggu sampai database siap
- Buka **Project Settings → API**, salin:
  - `Project URL`
  - `anon` `public` key

### 3. Setup environment

```bash
cp .env.local.example .env.local
```

Generate encryption key:

```bash
openssl rand -hex 32
```

Isi `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxx...
ENCRYPTION_KEY=<output dari openssl rand -hex 32>
```

> `ENCRYPTION_KEY` dipakai untuk meng-encrypt Meta access token di database (AES-256-GCM). Sekali di-set, **jangan ganti** karena token tersimpan tidak akan bisa di-decrypt lagi. Kalau hilang, set ulang token di Settings.

### 4. Jalankan SQL schema

Buka **Supabase Dashboard → SQL Editor → New query**, paste seluruh isi `supabase/schema.sql`, jalankan. Ini akan membuat tabel, indeks, trigger profile, dan policy RLS.

> **Sudah pakai EngageFlow versi sebelumnya?** Jalankan migration tambahan saja, **berurutan**:
> 1. `supabase/migration_2026_05_06_add_warna.sql` — kolom warna untuk akun
> 2. `supabase/migration_2026_05_07_meta_integration.sql` — tabel Meta credentials & SKU dictionary
> 3. `supabase/migration_2026_05_08_multi_account.sql` — dukungan multi ad account
> 4. `supabase/migration_2026_05_08_ai_credentials.sql` — tabel AI credentials (Gemini)
> 5. `supabase/migration_2026_05_14_multi_ai_providers.sql` — Gemini + Cerebras + Groq
> 6. `supabase/migration_2026_05_18_inline_ai_comments.sql` — komentar AI inline di assignment
> 7. `supabase/migration_2026_08_19_free_ai_rotation.sql` — model free aktif + cooldown provider
> 8. `supabase/migration_2026_08_19_openrouter_fallback.sql` — OpenRouter Free sebagai fallback terakhir
> 9. `supabase/migration_2026_08_19_campaign_management.sql` — catatan, waktu perubahan, dan status selesai manual campaign
> 10. `supabase/migration_2026_08_19_ai_comment_cleanup.sql` — hapus assignment AI otomatis setelah campaign selesai
> 11. `supabase/migration_2026_08_19_ai_provider_health.sql` — statistik sukses/gagal dan health provider
> 12. `supabase/migration_2026_08_19_link_keywords.sql` — simpan keyword asal pada setiap link Meta
>
> Semua migration idempotent (`if not exists`), aman dijalankan ulang.

### 5. (Opsional) Matikan email confirmation

Untuk testing cepat di dev, buka **Authentication → Providers → Email**, lalu nonaktifkan "Confirm email".

### 6. Jalankan dev server

```bash
npm run dev
```

Buka <http://localhost:3000>.

---

## Cara pakai

**Workflow direkomendasikan: Firefox + Multi-Account Containers extension** (lihat bagian "Workflow multi-akun FB" di bawah).

1. **Daftar** akun, login.
2. **Tambahkan akun-akun** (`/accounts`) — daftarkan akun-akun media sosial yang akan kamu pakai (mis. nama akun FB-mu). Pilih warna container untuk tiap akun (cocokkan dengan warna container Firefox-mu nanti).
3. **Tambahkan komentar** (`/comments`) dengan kategori sesuai yang akan kamu pakai (mis. `kacamata`, `minyak dayak`, `skincare`). Variasikan tone-nya.
4. **Buat campaign** baru. Tambahkan link via single atau bulk import. Format bulk:
   ```
   ## kacamata
   https://facebook.com/post/abc
   https://facebook.com/post/def

   https://facebook.com/post/ghi | minyak dayak
   ```
5. Klik **Generate Assignment** — engine akan memasangkan tiap link dengan N akun + N komentar (mengikuti kategori, tone variatif, urutan akun acak, hindari komentar yang terlalu sering dipakai).
6. Klik **Mode Eksekusi** — alurnya:
   - **Pilih akun**: pilih akun yang sedang kamu login di browser FB (mis. Akun 1).
   - Sistem tampilkan antrian semua tugas untuk akun itu, satu per satu.
   - Klik **Buka Link & Copy Komentar** (atau tekan Enter) → tab baru ke link FB terbuka, komentar otomatis tersalin ke clipboard.
   - Pindah ke tab FB, paste komentar, post.
   - Balik ke EngageFlow, klik **Selesai & Lanjut** (atau tekan D) → assignment ditandai selesai, link berikutnya **otomatis terbuka** dan komentarnya **otomatis tersalin**.
   - Lanjutkan sampai habis. Setelah akun ini selesai, login ke akun berikutnya di browser, lalu pilih akun itu di EngageFlow.

### Import link dari Meta Ads (opsional)

Kalau kamu running iklan FB lewat Ads Manager, EngageFlow bisa auto-import link postingannya tanpa harus copy-paste manual.

**Setup awal di Settings (`/settings`):**

1. Buka [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Pilih app kamu (atau buat baru di [developers.facebook.com/apps](https://developers.facebook.com/apps/))
3. Klik **Generate Access Token**, centang permission `ads_read`
4. Copy token (format `EAAxxxxxx...`)
5. Ambil Ad Account ID dari URL Ads Manager (`act=12345...`)
6. Paste keduanya di EngageFlow → Settings → tab "Meta Ads Integration" → Save

**SKU dictionary** (di Settings juga):

Bikin kamus singkatan di nama campaign → kategori. Contoh:

| Kode | Kategori |
|---|---|
| KCM | kacamata |
| MDK | minyak dayak |
| SKC | skincare |

Saat import, campaign bernama "ON - PURCHASE - **KCM**-FCI - LC - 22/04" akan otomatis terdeteksi kategori = `kacamata`.

**Cara import:**

1. Di campaign detail, klik **Import Meta**
2. Pilih mode:
   - **By campaign name** — cari campaign by keyword → pilih → list semua ads di dalamnya
   - **By ad/creative name** — cari ads langsung
3. Hasil ditampilkan dengan kategori auto-detected (override per row kalau perlu)
4. Centang yang mau diimport, klik "Import N link" → masuk ke campaign EngageFlow

Token di-encrypt AES-256-GCM di database. Read-only access, **tidak ada posting otomatis** — ini cuma fetch metadata iklan.

### Generate sekitar 300 komentar per hari

- Aktifkan **Groq** (`openai/gpt-oss-20b`) dan **Cerebras** (`gpt-oss-120b`) di Settings, lalu test masing-masing. Gemini dan OpenRouter menjadi cadangan; free tier tidak menjamin kapasitas harian.
- Empat komentar per postingan berarti sekitar **75 request awal** untuk 300 komentar, bukan 300 request. Kandidat tambahan dihasilkan dalam request yang sama. Repair/fallback menambah request dan pemakaian token.
- Komentar yang lolos dipertahankan saat quality gate menolak sebagian hasil. Sistem hanya meminta kekurangannya, dengan maksimal satu repair tambahan per request API; retry singkat di modal membawa hasil parsial, bukan mulai dari nol.
- Batch berjalan berurutan, dengan jeda 8–12 detik setelah hasil sukses maupun gagal. Batas waktu satu pemanggilan provider 12 detik, keseluruhan fallback 45 detik. Jangan menjalankan beberapa batch bersamaan karena semuanya memakai kuota project/organisasi yang sama.
- Kuota harian dibedakan dari limit menit berdasarkan metadata provider. Jika kuota harian habis, sistem mencoba provider lain; bila tidak ada yang tersedia, batch berhenti, bukan mengulang tiap menit.
- Periksa kuota request **dan token** akunmu di [Groq Limits](https://console.groq.com/settings/limits), [Cerebras](https://cloud.cerebras.ai/), dan [Google AI Studio](https://aistudio.google.com/rate-limit). Kalau tetap kurang, gunakan paket berbayar dengan batas pengeluaran yang kamu tentukan; aplikasi tidak mengaktifkan billing secara otomatis.

Uji regresi lokal tanpa mengonsumsi kuota provider: `npm run test:ai`.

### Workflow multi-akun FB dengan Firefox Multi-Account Containers

EngageFlow tidak menyimpan login Facebook (itu memang batasan keamanan browser). Untuk mengelola 5+ akun FB sekaligus, gunakan extension Firefox berikut:

**Setup awal (sekali, ~15 menit):**

1. Install Firefox + extension [Firefox Multi-Account Containers](https://addons.mozilla.org/en-US/firefox/addon/multi-account-containers/).
2. Buat 1 container per akun FB dengan warna berbeda (mis. `FB-Akun-1` merah, `FB-Akun-2` biru, dst.).
3. Login akun FB-mu di tiap container — sesi tersimpan persisten.
4. Login EngageFlow di tiap container (sekali per container, karena cookie jar terpisah).
5. Di halaman `/accounts` EngageFlow, pilih warna untuk tiap akun **cocokkan dengan warna container Firefox-nya**.

**Saat eksekusi:**

- Buka EngageFlow di container yang ingin dikerjakan (mis. container `FB-Akun-1`).
- Pilih akun itu di Mode Eksekusi.
- `window.open()` dari EngageFlow akan otomatis buka link di container yang sama → langsung logged in sebagai akun yang benar.
- Banner di atas execute view akan tampilkan warna container untuk reminder visual.

**Selesai untuk satu akun → switch:**

- Tutup tab EngageFlow di container A.
- Buka EngageFlow di container B (klik ikon container → pilih container → buka URL).
- Pilih akun B di picker. Lanjutkan.

### Keyboard shortcut (Mode Eksekusi)

| Tombol | Aksi |
|---|---|
| `Enter` | Buka link + copy komentar |
| `D` | Tandai selesai & lanjut (auto-buka link berikutnya) |
| `C` | Copy komentar saja |
| `←` / `→` | Navigasi antar antrian |

---

## Mesin Assignment — bagaimana kerjanya

Untuk setiap link, engine (di `src/lib/assignment.ts`):

1. **Filter komentar** yang `kategori`-nya sama dengan link.
2. **Group by tone**, lalu untuk tiap tone urutkan komentar berdasarkan jumlah pemakaian (ascending) — komentar yang jarang dipakai didahulukan.
3. **Round-robin antar tone** sehingga komentar yang dipilih tidak monoton.
4. **Pilih N akun acak** dari pool akun (urutan diacak Fisher–Yates), lewati akun yang sedang `cooldown_until`.
5. **Pasangkan** akun ke komentar 1:1.
6. **Update `comment_usage`** sehingga link berikutnya yang berkategori sama akan menghindari komentar yang sudah dipakai.

Constraint hard-enforced:

- 1 akun → maks 1 komentar per link (UNIQUE constraint DB)
- 1 komentar → tidak boleh muncul 2x dalam 1 link (UNIQUE constraint DB)
- Hanya komentar berkategori sama yang dipertimbangkan

---

## Deploy ke Vercel

1. Push repo ke GitHub.
2. Import ke Vercel → tambahkan environment variables `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy.
4. Di Supabase → **Authentication → URL Configuration**, tambahkan domain Vercel ke "Site URL" dan "Redirect URLs".

---

## Struktur direktori

```
src/
├── app/
│   ├── (app)/                    # route group: layout dengan sidebar
│   │   ├── layout.tsx            # auth guard + sidebar
│   │   ├── dashboard/
│   │   ├── campaigns/
│   │   │   ├── new/
│   │   │   └── [id]/
│   │   │       └── execute/      # mode eksekusi cepat
│   │   ├── accounts/
│   │   └── comments/
│   ├── login/
│   ├── register/
│   ├── globals.css
│   ├── layout.tsx                # html/body root
│   └── page.tsx                  # landing
├── components/
│   └── Sidebar.tsx
├── lib/
│   ├── supabase/{client,server,middleware}.ts
│   ├── assignment.ts             # 🧠 mesin assignment
│   ├── types.ts
│   └── utils.ts
└── middleware.ts                 # auth redirect
supabase/
└── schema.sql                    # jalankan di SQL Editor
```

---

## Larangan (sengaja)

Aplikasi ini **tidak** melakukan, dan tidak akan ditambahkan:

- Auto-post komentar ke media sosial
- Integrasi API posting platform manapun
- Bot atau headless browser otomatis

Tujuannya: tetap **manual & aman** dari sisi platform, tapi sangat cepat secara workflow.
