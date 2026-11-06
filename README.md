# DietPal – Coach Diet Anda

PWA pembantu diet & turun berat badan dalam Bahasa Melayu untuk pengguna di Malaysia. Mobile-first, **mesti dipasang ke home screen** (atau sebagai app di komputer) sebelum boleh digunakan, dan berfungsi offline. Data diet disimpan dalam telefon pengguna — tiada akaun.

**Versi semasa:** 1.8.3

## Ciri utama

**Setup & profil**
- **Pasang dulu** – jika dibuka dalam browser, app hanya papar skrin pasang dengan arahan ikut peranti: butang *Pasang DietPal* (Android / Chrome / Edge), langkah *Share → Add to Home Screen* (iPhone), atau minta buka dalam Chrome/Safari (browser dalam WhatsApp, Instagram, Facebook dll.). Jika ada data lama dalam browser, butang *Simpan data saya* muncul — di iPhone, app yang dipasang bermula kosong, jadi pulihkan backup semasa setup.
- **Setup kali pertama** – 7 langkah ringkas: nama (atau *Pulihkan data* dari backup), jantina/umur/tinggi, berat semasa & sasaran, kadar turun, tahap aktiviti, pilihan makanan & kesihatan, sasaran, dan **Hidupkan peringatan**.
- **Sasaran automatik** – kalori dikira dengan formula Mifflin-St Jeor (BMR → TDEE → defisit ikut kadar 0.25/0.5/0.75 kg seminggu), air ~30 ml setiap kg, milestone setiap 10 kg hingga berat sasaran. Mod manual tersedia.
- **Had keselamatan** – minimum 1,500 kcal (lelaki) / 1,200 kcal (perempuan) dalam semua mod; berat sasaran tidak bawah BMI 18.5; umur 18–90 tahun.
- **Pilihan makanan & alahan** – tak makan daging lembu/kambing, ayam, ikan, makanan laut & belacan; alahan kacang, telur, susu; tak gemar pedas. Menu yang bercanggah tidak dicadangkan.
- **Nota kesihatan (pilihan)** – kencing manis, darah tinggi, gastrik; menyesuaikan panduan "Rasa tak selesa" dan cadangan menu.

**Harian**
- **Home baru (v1.6)** – reka bentuk dari Sleek: header hijau pandan dengan streak, ring kalori berbentuk pinggan (imbangan sayur/protein/karbo) + bar kemajuan ke sasaran, chip waktu makan, *Cadangan Coach* (mesej coach + satu menu), kad air & berat ringkas, dan pautan *Rasa tak selesa?* yang tenang.
- **Tab Makan (log dulu)** – log hari ini ikut waktu makan; butang *Tambah* membuka carian makanan untuk waktu makan itu (kerap dimakan, tapis kategori, makanan sendiri).
- **Scan makanan (v1.7)** – dalam sheet *Tambah*, ambil gambar atau pilih dari galeri; AI anggar item & kalori, padankan dengan preset app bila boleh. Pengguna **semak dan betulkan** (portion ½–5×, buang item) sebelum simpan — tiada apa dilog terus. Lihat bahagian *Scan makanan* di bawah.
- **Preset makanan Malaysia** – 69 item (nasi 1 senduk, ayam grill, ulam, roti canai, teh tarik, Milo ais, dll.) + makanan sendiri.
- **Cadangan menu (Enjin A)** – 58 gabungan menu di rumah atau di luar (gerai, mamak, nasi campur, kopitiam, makanan segera, kenduri, kedai serbaneka), dipilih ikut baki kalori, imbangan pinggan dan pilihan makanan. Butang *Cadangan lain* menggilirkan menu seterusnya dari senarai penuh. Berfungsi offline.
- **Tips hari ini (v1.8)** – satu tip sehari di Utama (bawah peringatan), dipilih dalam telefon ikut log 3 hari lepas, berat dan musim perayaan. Tekan untuk sheet penuh: sebab tip dipilih, *Tip ni membantu?* (👍/👎 dihantar ke Supabase), simpan, dan *Tanya Coach* dengan soalan siap. Semua tips ada di Panduan → *Koleksi tips*. Lihat bahagian *Tips hari ini* di bawah.
- **Penjejak air** – tekan untuk tambah gelas/botol, sasaran ikut berat badan.
- **Rasa tak selesa** – panduan ringkas untuk pening, sakit kepala, kembung, lemah, loya & kejang otot: langkah bernombor, semakan data hari ini, log segera, dan amaran bila perlu hubungi 999.
- **Notifikasi peringatan** – sampai walaupun app ditutup: log makan (lepas waktu makan biasa, jika belum log), minum air (setiap 2 jam, 9 pagi–7 malam, jika kurang), timbang berat mingguan, dan ringkasan kalori malam (~9.30 malam). Waktu senyap 10 malam–7 pagi, jarak minimum 45 minit. **Wajib:** setup tidak selesai dan app tidak boleh digunakan selagi notifikasi tidak dibenarkan. Jika pengguna tekan *Block / Don't Allow*, app papar langkah untuk hidupkan semula di tetapan telefon (iPhone, Android, komputer) dan butang *Saya dah hidupkan — teruskan*. Jika kebenaran ditarik balik kemudian, app disekat semula sehingga dibenarkan. Peranti yang tidak menyokong notifikasi (cth. iOS bawah 16.4) diminta kemas kini. Peringatan dalam app masih dipaparkan bila app dibuka.

**Kemajuan & panduan**
- **Berat & milestone** – graf trend, BMI (had Asia), perubahan 7 hari, milestone yang boleh diedit.
- **Panduan pinggan Suku-Suku Separuh** – ½ sayur, ¼ protein, ¼ karbo kompleks; prinsip 80/20; elak diet ekstrem.
- **Makan di luar dengan bijak** – 3 cara mudah memesan dan tukaran kecil dengan anggaran kalori dijimat.
- **Sumber rujukan** – senarai rujukan yang digunakan dalam app (lihat di bawah).

**Tetapan**
- Tema cerah / gelap / ikut telefon, saiz teks, waktu makan biasa, jenis peringatan (log makan, air, timbang, ringkasan malam), status notifikasi dan butang *Hantar notifikasi ujian*.
- Peringatan backup dalam app: selepas seminggu guna, kemudian setiap 30 hari sejak backup terakhir (tutup = tanya semula seminggu lagi). Kad Data papar tarikh backup terakhir.
- Backup / restore (JSON), export CSV (makanan, air, berat), padam semua data. Data yang dipulihkan disemak medan demi medan (jenis, julat, panjang) dan medan asing dibuang; alamat notifikasi telefon lama tidak dibawa. *Padam semua data* turut mematikan notifikasi di server.

## Teknologi
- HTML5 + Vanilla JS + Tailwind CSS v3 (dijana sekali ke `app.css`, tiada skrip CDN) – Vercel tidak perlu build step.
- Content-Security-Policy ketat dalam `vercel.json`: hanya skrip dari domain sendiri, tiada skrip inline.
- Ikon SVG terbina dalam kod: ikon garis sendiri + ikon Phosphor (dibenam terus, tiada pustaka ikon luaran, tiada emoji).
- Fon Nunito (tajuk) + Nunito Sans (teks); palet krim hangat, hijau pandan, warna pinggan tetap (sayur #6ba539, protein #e0573f, karbo #e9b21c).
- `localStorage` (kunci `dietpal.v1`) – data v1.0 di bawah kunci lama dipindahkan secara automatik.
- `manifest.json` + `sw.js` – boleh dipasang (Android/iOS) dan berfungsi offline selepas buka kali pertama.

## Struktur
```
index.html      Rangka halaman (header, nav, sheet) + gaya tambahan
app.js          Logik app: data menu, enjin cadangan, profil & tetapan, ikon, Coach AI, notifikasi
foods.js        69 preset makanan Malaysia — dikongsi app & api/coach.js
app.css         CSS Tailwind yang dijana (jangan edit terus)
tailwind.config.js, src/app.input.css   Sumber untuk jana app.css
tips.js         47 tips diet & kesihatan + logik pilih tip harian
tests/          Ujian unit (node --test): data backup, pengesanan pantang, kuota & origin Coach AI
.github/workflows/test.yml   CI: sintaks, ujian, app.css terkini, deno check fungsi push
manifest.json   Konfigurasi PWA
sw.js           Service worker (cache dietpal-v18, terima & buka notifikasi)
vercel.json     Fungsi Vercel (maxDuration 60 s) + header keselamatan (CSP dll.)
supabase/       Fungsi push (Edge Function) & setup.sql untuk notifikasi
api/coach.js    Fungsi Vercel untuk Coach AI (OpenAI)
api/scan.js     Fungsi Vercel untuk Scan makanan (OpenAI, input gambar)
icons/          Ikon 192, 512, maskable, apple-touch-icon
```

## Ujian
```bash
node --test tests/*.test.js
```
CI (GitHub Actions) menjalankan ujian ini, semak sintaks, pastikan `app.css` sepadan dengan kelas dalam kod, dan `deno check` fungsi push pada setiap PR.

## Jalankan secara lokal
```bash
python3 -m http.server 8000
# buka http://localhost:8000
```
Service worker hanya berfungsi melalui `http://localhost` atau HTTPS. App disekat dalam browser biasa — tambah `?dev=1` untuk buka di localhost atau preview Vercel (`…-git-…vercel.app`). Pautan production tidak menerima `?dev=1`. Untuk uji notifikasi dari localhost, tambah `http://localhost:8000` dalam secret `ALLOWED_ORIGINS` fungsi `push` di Supabase.

## Deploy
Projek statik – import repo ini ke Vercel tanpa sebarang tetapan build (Framework: Other, output: root). Setiap push ke `main` akan deploy semula.

Bila menukar kelas Tailwind dalam `index.html` / `app.js`, jana semula CSS dan commit `app.css`:
```bash
npx tailwindcss@3 -i src/app.input.css -o app.css --minify
```

Bila menukar fail app, naikkan versi cache dalam `sw.js` (cth: `dietpal-v14` → `dietpal-v15`) supaya telefon yang dah pasang app mendapat versi baru.

## Sumber rujukan
| Digunakan untuk | Sumber |
| --- | --- |
| Pinggan Suku-Suku Separuh | Pinggan Sihat Malaysia, Kementerian Kesihatan Malaysia ([Album Makanan Malaysia Edisi Kedua, 2024](https://iku.moh.gov.my/images/teknikal-report/album-makanan-malaysia-edisi-kedua-2024-1.pdf)) |
| Kategori BMI (18.5 / 23 / 27.5) | [CPG Management of Obesity, Edisi Ke-2 (2023)](https://medic.usm.my/images/Anaesthesiology%20and%20Intensive%20Care%20Unit/Guidelines/CPG%20Management%20of%20Obesity%20230518.pdf) — KKM, MEMS, MDA & lain-lain |
| Sasaran kalori automatik (BMR → TDEE) | [Mifflin MD, St Jeor ST et al., Am J Clin Nutr 1990;51:241–247](https://agris.fao.org/search/ar/records/65de26fe7c7033e84be9ee76) |
| Ambang gula rendah (< 4.0 mmol/L) | Garis panduan hipoglisemia antarabangsa, ambang 3.9–4.0 mmol/L ([kajian sistematik, BMC Endocrine Disorders 2026](https://ruor.uottawa.ca/bitstreams/25132578-f3be-4701-96d9-702abc7eb43b/download)) |

Anggaran umum tanpa sumber khusus: nilai kalori makanan & menu, sasaran air (~30 ml/kg), kadar turun berat (~7,700 kcal ≈ 1 kg).

## Had semasa
- Nilai kalori dan TDEE adalah anggaran purata.
- Data tidak diselaraskan antara peranti — guna Backup secara berkala.
- Notifikasi wajib, jadi DietPal perlukan iOS 16.4+ (app dipasang) atau browser Android/komputer yang menyokong Web Push.

## Coach AI (Enjin B)
Butang **Tanya Coach AI** dalam kad cadangan menu membuka soalan bebas. Pengguna boleh pilih waktu makan (Sarapan, Tengah hari, Malam, Snek) atau **Umum**, tetapi **soalan pengguna diutamakan**: jika soalan menyebut waktu makan atau tempat (cth: "mamak tengah hari"), AI ikut soalan dan memulangkan waktu makan yang difahami. Julat kalori dan butang *Log ke …* ikut waktu makan itu. Kotak soalan dikosongkan setiap kali Coach AI dibuka.

Permintaan dihantar ke fungsi Vercel `api/coach.js`, yang memanggil OpenAI Chat Completions dengan *Structured Outputs* (`reply`, `meal`, `menus`, `safety_note`).

**Environment variables di Vercel**
| Nama | Wajib | Keterangan |
| --- | --- | --- |
| `OPENAI_API_KEY` | Ya | API key OpenAI. Jangan letak dalam kod. |
| `OPENAI_MODEL` | Tidak | Model yang digunakan (lalai: `gpt-4.1-mini`, kini *deprecated* oleh OpenAI). Calon pengganti: `gpt-6-luna` — murah ($0.10 / $0.50 setiap 1M token), menyokong Chat Completions & Structured Outputs. |
| `OPENAI_REASONING_EFFORT` | Tidak | Hanya untuk model reasoning (`gpt-5.x`, `gpt-6…`). Lalai `none` — jawapan Coach ringkas, jadi tiada token "berfikir". Cuba `low` jika kualiti kurang. |
| `SUPABASE_URL` | Ya | `https://jlbdtmzccrebjmlrjvgh.supabase.co` |
| `SUPABASE_SECRET_KEY` | Disyorkan | *Secret key* projek Supabase **dietpal** (`sb_secret_…`, Project Settings → API Keys). Bila diset, fungsi kuota tak perlu akses awam — lepas itu pasang migration `supabase/migrations/20261105_coach_usage_private.sql`. |
| `SUPABASE_ANON_KEY` | Jika tiada secret key | Publishable key (cara lama). Diabaikan bila `SUPABASE_SECRET_KEY` diset. |
| `COACH_QUOTA_SECRET` | Ya | Rahsia `coach_secret` dalam jadual `push_config` (lihat di bawah). |
| `COACH_TOKENS_WINDOW` | Tidak | Bajet token setiap telefon dalam satu tempoh (lalai: 8000). |
| `COACH_WINDOW_MIN` | Tidak | Panjang tempoh dalam minit (lalai: 15). |
| `COACH_TOKENS_DAY` | Tidak | Bajet token setiap telefon sehari, reset 12 tengah malam waktu Malaysia (lalai: 30000). |
| `COACH_IP_FACTOR` | Tidak | Bajet setiap IP = bajet telefon × nilai ini (lalai: 3). |
| `COACH_CACHED_WEIGHT` | Tidak | Berat token input *cached* dalam kiraan had (lalai: 0.1 — sepadan harga cache ~1/10). Set `1` untuk kira penuh. |
| `COACH_RESERVE` | Tidak | Token yang ditempah sebelum setiap panggilan OpenAI (lalai: 3500). |
| `COACH_QUOTA_OPTIONAL` | Tidak | Untuk ujian lokal sahaja: `1` = benarkan Coach tanpa env had token, guna had permintaan setiap IP (`COACH_RATE_LIMIT`, lalai 12 dalam 10 minit). Jangan set di production. |
| `ALLOWED_ORIGINS` | Tidak | Origin tambahan dibenarkan, dipisah koma (cth: `https://dietpal.my`). Lalai: domain deploy itu sendiri, `dietpal-blond.vercel.app` dan preview projek ini. |

**Cara AI menjawab**
- Prompt berasaskan prinsip, bukan senarai peraturan panjang: jawab soalan yang ditanya, jawapan spesifik 1–3 ayat.
- Menu ialah hidangan sebenar yang lazim di tempat itu (cth: "Nasi kandar ikan bakar"), dengan komponen dalam sukatan rumah. Untuk sarapan, tengah hari dan malam, setiap menu ialah hidangan lengkap (protein, karbohidrat, sayur) ikut Pinggan Sihat Malaysia.
- Soalan fakta (kalori, waktu makan, boleh/tidak) dijawab terus tanpa menu.
- Soalan tentang hari ini guna jumlah kalori yang dikira oleh app dan sasaran harian pengguna.
- Nota kesihatan dan pantang dipatuhi secara senyap; kotak amaran merah hanya untuk risiko sebenar.
- Preset makanan (`foods.js`) disimpan di server dalam mesej sistem yang sama setiap kali, jadi *prompt caching* OpenAI boleh guna semula (input cached lebih murah). Telefon hanya hantar makanan *sendiri* pengguna. kcal item diselaraskan dengan preset bila nama & sukatan sepadan.

**Perlindungan**
- Julat kcal setiap menu (±20%, snek ±40%): jika menu **di rumah** jelas terkeluar, server melaraskan sukatan (tambah nasi hanya jika tiada karbo langsung — burger, roti, mee, nasi dsb. dikira sudah ada karbo; protein → karbo maks 40% → buah → sayur; kurangkan karbo jika lebih). Hidangan penuh (burger, mee goreng…) tidak dibesarkan jadi "1.5 biji". **Makan di luar** tidak dilaraskan sebab hidangan datang seperti yang kedai hidang — menu terkeluar hanya ditanda "bawah/atas sasaran".
- Had kalori minimum harian, tiada skip makan atau potong nasi/garam terus, patuhi pantang & alahan, tiada diagnosis/ubat/dos.
- Simptom serius (sakit dada, sesak nafas, pengsan, dll.) dikesan di server dan terus dijawab dengan amaran 999 tanpa memanggil AI.
- Input disaring di server (hanya medan tertentu, panjang terhad); output disemak dan jumlah kcal dikira semula.
- **Had penggunaan (token)** – dikira di server dalam Supabase, jadi tak boleh di-reset dari telefon. Setiap telefon (ID rawak dalam `localStorage`, kunci `dietpal.device`) dapat 8,000 token setiap 15 minit dan 30,000 token sehari; setiap IP dapat 3× ganda (ramai telefon boleh berkongsi satu IP). Kiraan ikut kos sebenar dari `usage` OpenAI: input baru dan output dikira penuh, input *cached* (prompt sistem + preset yang sama setiap soalan) dikira 1/10. Bila habis, server pulangkan 429 `quota` dengan masa menunggu dan app papar "Coach AI rehat sekejap…". Bila baki ≤ 30%, app papar amaran kecil. Soalan kecemasan tidak dikira. Dengan gpt-6-luna, soalan pertama ≈ 2,900 token dikira dan soalan susulan (cache aktif) ≈ 600–700, jadi ≈ 8–9 soalan setiap 15 minit. Server **menempah** ~3,500 token dulu (atomik dalam Postgres) sebelum memanggil OpenAI, kemudian melaraskan ikut penggunaan sebenar — jadi permintaan serentak tak boleh melepasi had. Jika Supabase tak dapat dihubungi atau env belum diset, Coach AI **berhenti sementara** (503) dan tidak berjalan tanpa had.
- Jawapan dihadkan kepada 1,200 token output.
- Semakan origin (wajib ada header Origin, senarai tepat), had saiz permintaan, tamat masa 30 saat. Origin hanya menyekat laman web lain — had token ialah perlindungan sebenar.
- App menanda item AI yang bercanggah dengan pantang/alahan pengguna.
- Data dihantar: soalan, ringkasan makanan hari ini, sasaran kalori, pantang/alahan, makanan sendiri, nota kesihatan (jika pengguna benarkan). **Nama dan berat tidak dihantar.**
- **Persetujuan:** sebelum soalan pertama, app terangkan data yang dihantar ke OpenAI dan minta *Setuju & teruskan*. Pengguna boleh matikan *Kongsi nota kesihatan* atau tarik balik persetujuan di Tetapan → Privasi. Notis privasi penuh ada di Tetapan dan Panduan.
- Tanpa internet atau jika AI gagal, app terus guna cadangan menu Enjin A.

Disyorkan: tetapkan had perbelanjaan bulanan di dashboard OpenAI.

> Nilai kalori adalah anggaran purata. App ini panduan gaya hidup, bukan nasihat perubatan. Rujuk doktor atau pegawai dietetik untuk keadaan kesihatan tertentu.

## Scan makanan
Butang **Scan makanan dengan kamera** dalam sheet *Tambah*. Gambar dikecilkan dalam telefon (≈1024 px JPEG, biasanya 100–250 KB — cukup untuk baca label), dihantar ke `api/scan.js`, yang memanggil OpenAI (model yang sama dengan Coach AI, input gambar) dengan *Structured Outputs*: senarai item dengan `preset` (id dalam `foods.js` atau kosong), `qty`, `kcal`, `plate` dan `confidence`.

- **Label nutrisi (v1.7.1):** gambar panel *Maklumat Pemakanan* → AI baca kcal sehidangan (atau setiap 100 g/ml jika itu sahaja yang ada; kJ ditukar ke kcal). Item ditanda *dari label* dan tidak ditukar ke preset.
- **Komposisi pinggan (v1.8.2):** hidangan campur yang bukan preset (cth sandwic, nasi bujang) disimpan dengan `mix` anggaran AI (karbo / protein / serat, maks 3 setiap kumpulan), jadi ring pinggan di Utama turut mengiranya.
- **Padanan preset:** jika AI pilih preset, nama/sukatan/kcal/jenis pinggan diambil dari `foods.js` — bukan nombor AI. Item lain disimpan sebagai item sekali guna.
- **Pengguna semak dulu:** ubah portion, buang item salah, kemudian *Simpan ke …*. Item "kurang pasti" dan item yang bercanggah dengan pantang/alahan ditanda.
- **Persetujuan berasingan** sebelum scan pertama (gambar ialah data baru). Tarik balik di Tetapan → Privasi bersama Coach AI.
- **Gambar tidak disimpan** oleh DietPal — tidak di server, tidak dalam log Vercel (hanya kiraan token dilog), tidak dalam backup.
- **Had scan** dikira setiap scan (bukan token) dalam jadual `coach_usage` yang sama, tetapi kunci berasingan (`sd:` / `sip:`), jadi tidak makan bajet Coach AI. Lalai: 5 scan setiap 10 minit dan 10 sehari setiap telefon; IP dapat 3×. Scan yang gagal (ralat OpenAI) dipulangkan. Fail closed seperti Coach AI.
- Tiada migration Supabase diperlukan.

**Environment variables (semua pilihan)**
| Nama | Keterangan |
| --- | --- |
| `SCAN_DISABLED` | `1` = tutup scan serta-merta (app papar "ditutup sementara"). Tak perlu ubah kod. |
| `SCAN_PER_DAY` | Scan setiap telefon sehari (lalai: 10). |
| `SCAN_PER_WINDOW` / `SCAN_WINDOW_MIN` | Scan dalam satu tempoh (lalai: 5 setiap 10 minit). |
| `SCAN_MODEL` | Model untuk scan (lalai: `OPENAI_MODEL`, kemudian `gpt-6-luna`). Mesti menyokong input gambar. |
| `SCAN_REASONING_EFFORT` | Lalai `low` (kenal pasti hidangan & portion). |
| `SCAN_IMAGE_DETAIL` | `low` / `high` / `auto` (lalai: `high`, supaya tulisan kecil pada label boleh dibaca). |

## Tips hari ini
Tips ditulis siap dalam [`tips.js`](tips.js) — tiada AI, tiada kos. Setiap tip ada kategori, tajuk, teks ringkas (kad & notifikasi), teks penuh, soalan untuk Coach AI, dan pilihan `on` (isyarat), `tags` (makanan yang disebut) dan `season`.

**Cara pilih (sekali sehari, tetap sepanjang hari):**
1. Isyarat dari 3 hari lepas (hanya hari dengan ≥ 2 item dilog): kalori bawah minimum, terlebih, protein/sayur rendah, air manis, air kurang; tiada log 2 hari; hujung minggu lepas terlebih (Jumaat/Sabtu); berat naik ≥ 1 kg atau tak berubah 2 minggu; minggu pertama.
2. Ikut keutamaan: keselamatan & berat dulu (`under`, `lapse`, `gain`, `plateau`), kemudian musim perayaan, kemudian tabiat harian. Sebab yang sama tidak diulang dua hari berturut jika ada isyarat lain.
3. Tip tidak berulang dalam 30 hari; tip yang ditanda *tak membantu* tidak dipilih lagi; tip yang menyebut makanan dalam pantang/alahan disorok.
4. Tiada isyarat → giliran umum (tip yang belum pernah dilihat dulu).

Tip esok dipilih awal dan dihantar bersama status notifikasi, jadi notifikasi tengah hari dan kad Utama esok ialah tip yang sama. **Musim perayaan (dikira automatik, tiada kemas kini tahunan):** Tahun Baru Cina guna kalendar Cina, Ramadan / Aidilfitri / Aidiladha guna kalendar Hijrah (Umm al-Qura) — kedua-duanya terbina dalam browser (`Intl`). Deepavali = sehari sebelum bulan baru antara 17 Okt – 15 Nov (formula fasa bulan Meeus). Tarikh yang dikira sama dengan cuti rasmi atau beza sehari (rukyah vs kiraan); setiap musim ialah tempoh beberapa hari, jadi beza sehari tak menjejaskan. Ujian membandingkan dengan tarikh rasmi 2018–2028 dan memastikan setiap perayaan wujud hingga 2040. Jika mahu tarikh rasmi tepat, isi `TIP_FESTIVAL_OVERRIDE` dalam `tips.js` (pilihan). Telefon yang tiada kalendar tersebut tidak dapat tips perayaan sahaja.

**Notifikasi:** 15–60 minit sebelum waktu makan tengah hari pengguna (tajuk + teks ringkas, buka terus ke tip). Boleh dimatikan di Tetapan → Peringatan → *Tips hari ini*. Hanya tajuk & teks tip dihantar ke server — bukan sebab tip dipilih.

**Maklum balas (👍/👎):** dihantar ke fungsi `push` (action `tipfb`) dan disimpan dalam jadual `tip_feedback`: tip, undian, sebab dipaparkan, hash ID telefon & IP. Satu baris setiap telefon setiap tip; tekan sekali lagi = tarik balik. Jika tiada internet, undian disimpan dalam telefon dan dihantar kemudian. Lihat ringkasan di SQL Editor:
```sql
select * from tip_feedback_summary;
```

## Notifikasi (Supabase)
Notifikasi dihantar dengan *Web Push* dari projek Supabase **dietpal** (`jlbdtmzccrebjmlrjvgh`, Singapura). Tiada tetapan Vercel diperlukan.

| Bahagian | Fungsi |
| --- | --- |
| Edge Function `push` | `subscribe`, `status`, `unsubscribe`, `test` dari app; `run` dari penjadual. Kunci VAPID dijana sekali di server dan disimpan dalam `push_config`. |
| Jadual `push_subs` | Satu baris setiap telefon: alamat push, zon waktu, tetapan peringatan, status ringkas hari ini, peringatan yang sudah dihantar. RLS hidup tanpa policy — hanya fungsi server boleh baca/tulis. |
| `pg_cron` `dietpal-push` | Setiap 15 minit memanggil `push` (`run`) dengan rahsia `cron_secret`. |

**Data yang dihantar ke server:** alamat push, zon waktu, waktu makan & pilihan peringatan, dan status hari ini (waktu makan yang dah dilog — ya/tidak, jumlah air, jumlah kalori, tarikh timbang terakhir). **Nama, berat dan senarai makanan tidak dihantar.** Langganan yang tamat (404/410) dipadam secara automatik.

**Had Coach AI** juga guna projek ini: jadual `coach_usage` (kiraan token setiap telefon/IP — IP disimpan sebagai hash) dan fungsi `coach_usage_add`, yang hanya boleh dipanggil dengan rahsia `coach_secret`. Dapatkan rahsia untuk `COACH_QUOTA_SECRET` di SQL Editor: `select value from push_config where key = 'coach_secret';`. Baris lama (> 2 hari) dipadam setiap hari oleh `pg_cron` `dietpal-coach-cleanup`.

**Skala:** fungsi `run` jawab penjadual serta-merta (`EdgeRuntime.waitUntil`) dan teruskan di latar: baca langganan 1,000 sebaris (keyset), hantar 20 serentak, berhenti mula hantaran baru selepas ~110 s (baki diambil larian seterusnya). Langganan baru dihadkan 20 setiap IP (hash) sehari; notifikasi ujian 1 seminit.

**Deploy perubahan fungsi `push`:** pasang migration dulu, kemudian deploy fungsi: [`20261105_push_ip_limit.sql`](supabase/migrations/20261105_push_ip_limit.sql) (lajur `ip_hash`) dan, untuk v1.8, [`20261105_tip_feedback.sql`](supabase/migrations/20261105_tip_feedback.sql) (jadual `tip_feedback`).

Skema penuh: [`supabase/setup.sql`](supabase/setup.sql). Kod fungsi: [`supabase/functions/push/index.ts`](supabase/functions/push/index.ts).
