# DietPal – Coach Diet Anda

PWA pembantu diet & turun berat badan dalam Bahasa Melayu untuk pengguna di Malaysia. Mobile-first, **mesti dipasang ke home screen** (atau sebagai app di komputer) sebelum boleh digunakan, dan berfungsi offline. Data diet disimpan dalam telefon pengguna — tiada akaun.

**Versi semasa:** 1.5.0

## Ciri utama

**Setup & profil**
- **Pasang dulu** – jika dibuka dalam browser, app hanya papar skrin pasang dengan arahan ikut peranti: butang *Pasang DietPal* (Android / Chrome / Edge), langkah *Share → Add to Home Screen* (iPhone), atau minta buka dalam Chrome/Safari (browser dalam WhatsApp, Instagram, Facebook dll.). Jika ada data lama dalam browser, butang *Simpan data saya* muncul — di iPhone, app yang dipasang bermula kosong, jadi pulihkan backup semasa setup.
- **Setup kali pertama** – 7 langkah ringkas: nama (atau *Pulihkan data* dari backup), jantina/umur/tinggi, berat semasa & sasaran, kadar turun, tahap aktiviti, pilihan makanan & kesihatan, sasaran, dan **Hidupkan peringatan**.
- **Sasaran automatik** – kalori dikira dengan formula Mifflin-St Jeor (BMR → TDEE → defisit ikut kadar 0.25/0.5/0.75 kg seminggu), air ~30 ml setiap kg, milestone setiap 10 kg hingga berat sasaran. Mod manual tersedia.
- **Had keselamatan** – minimum 1,500 kcal (lelaki) / 1,200 kcal (perempuan) dalam semua mod; berat sasaran tidak bawah BMI 18.5; umur 18–90 tahun.
- **Pilihan makanan & alahan** – tak makan daging lembu/kambing, ayam, ikan, makanan laut & belacan; alahan kacang, telur, susu; tak gemar pedas. Menu yang bercanggah tidak dicadangkan.
- **Nota kesihatan (pilihan)** – kencing manis, darah tinggi, gastrik; menyesuaikan panduan "Rasa tak selesa" dan cadangan menu.

**Harian**
- **Dashboard kalori** – ring progress ikut sasaran pengguna, log ikut waktu makan (Sarapan, Tengah hari, Makan malam, Snek).
- **Tab Makan (log dulu)** – log hari ini ikut waktu makan; butang *Tambah* membuka carian makanan untuk waktu makan itu (kerap dimakan, tapis kategori, makanan sendiri).
- **Preset makanan Malaysia** – 69 item (nasi 1 senduk, ayam grill, ulam, roti canai, teh tarik, Milo ais, dll.) + makanan sendiri.
- **Cadangan menu (Enjin A)** – 58 gabungan menu di rumah atau di luar (gerai, mamak, nasi campur, kopitiam, makanan segera, kenduri, kedai serbaneka), dipilih ikut baki kalori, imbangan pinggan dan pilihan makanan. Butang *Cadangan lain* menggilirkan menu seterusnya dari senarai penuh. Berfungsi offline.
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
- Backup / restore (JSON), export CSV (makanan, air, berat), padam semua data.

## Teknologi
- HTML5 + Vanilla JS + Tailwind CSS (CDN) – tiada build step.
- Ikon garis SVG terbina dalam kod (tiada emoji, tiada pustaka ikon luaran).
- `localStorage` (kunci `dietpal.v1`) – data v1.0 di bawah kunci lama dipindahkan secara automatik.
- `manifest.json` + `sw.js` – boleh dipasang (Android/iOS) dan berfungsi offline selepas buka kali pertama.

## Struktur
```
index.html      UI, data makanan & menu, enjin cadangan, profil & tetapan, ikon, logik app
manifest.json   Konfigurasi PWA
sw.js           Service worker (cache dietpal-v12, terima & buka notifikasi)
vercel.json     Tetapan fungsi Vercel (maxDuration 60 s)
supabase/       Fungsi push (Edge Function) & setup.sql untuk notifikasi
api/coach.js    Fungsi Vercel untuk Coach AI (OpenAI)
icons/          Ikon 192, 512, maskable, apple-touch-icon
```

## Jalankan secara lokal
```bash
python3 -m http.server 8000
# buka http://localhost:8000
```
Service worker hanya berfungsi melalui `http://localhost` atau HTTPS. App disekat dalam browser biasa — tambah `?dev=1` untuk buka di localhost atau preview Vercel (`…-git-…vercel.app`). Pautan production tidak menerima `?dev=1`.

## Deploy
Projek statik – import repo ini ke Vercel tanpa sebarang tetapan build (Framework: Other, output: root). Setiap push ke `main` akan deploy semula.

Bila menukar fail app, naikkan versi cache dalam `sw.js` (cth: `dietpal-v12` → `dietpal-v13`) supaya telefon yang dah pasang app mendapat versi baru.

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
| `OPENAI_MODEL` | Tidak | Model yang digunakan (lalai: `gpt-4.1-mini`). |
| `COACH_RATE_LIMIT` | Tidak | Had permintaan setiap IP dalam 10 minit (lalai: 12). |
| `ALLOWED_ORIGINS` | Tidak | Domain tambahan dibenarkan, dipisah koma (cth: `https://dietpal.my`). |

**Cara AI menjawab**
- Prompt berasaskan prinsip, bukan senarai peraturan panjang: jawab soalan yang ditanya, jawapan spesifik 1–3 ayat.
- Menu ialah hidangan sebenar yang lazim di tempat itu (cth: "Nasi kandar ikan bakar"), dengan komponen dalam sukatan rumah. Untuk sarapan, tengah hari dan malam, setiap menu ialah hidangan lengkap (protein, karbohidrat, sayur) ikut Pinggan Sihat Malaysia.
- Soalan fakta (kalori, waktu makan, boleh/tidak) dijawab terus tanpa menu.
- Soalan tentang hari ini guna jumlah kalori yang dikira oleh app dan sasaran harian pengguna.
- Nota kesihatan dan pantang dipatuhi secara senyap; kotak amaran merah hanya untuk risiko sebenar.
- Preset makanan app dihantar sebagai rujukan kcal sahaja; kcal item diselaraskan dengan preset bila nama & sukatan sepadan.

**Perlindungan**
- Julat kcal setiap menu (±20%, snek ±40%): jika menu jelas terkeluar, server melaraskan sukatan (tambah nasi jika tiada karbo, protein → karbo maks 40% → buah → sayur; kurangkan karbo jika lebih). Menu yang masih terkeluar ditanda "bawah/atas sasaran".
- Had kalori minimum harian, tiada skip makan atau potong nasi/garam terus, patuhi pantang & alahan, tiada diagnosis/ubat/dos.
- Simptom serius (sakit dada, sesak nafas, pengsan, dll.) dikesan di server dan terus dijawab dengan amaran 999 tanpa memanggil AI.
- Input disaring di server (hanya medan tertentu, panjang terhad); output disemak dan jumlah kcal dikira semula.
- Had kadar setiap IP, semakan origin, had saiz permintaan, tamat masa 30 saat.
- App menanda item AI yang bercanggah dengan pantang/alahan pengguna.
- Data dihantar: soalan, ringkasan makanan hari ini, sasaran kalori, pantang/alahan, nota kesihatan. **Nama dan berat tidak dihantar.**
- Tanpa internet atau jika AI gagal, app terus guna cadangan menu Enjin A.

Disyorkan: tetapkan had perbelanjaan bulanan di dashboard OpenAI.

> Nilai kalori adalah anggaran purata. App ini panduan gaya hidup, bukan nasihat perubatan. Rujuk doktor atau pegawai dietetik untuk keadaan kesihatan tertentu.

## Notifikasi (Supabase)
Notifikasi dihantar dengan *Web Push* dari projek Supabase **dietpal** (`jlbdtmzccrebjmlrjvgh`, Singapura). Tiada tetapan Vercel diperlukan.

| Bahagian | Fungsi |
| --- | --- |
| Edge Function `push` | `subscribe`, `status`, `unsubscribe`, `test` dari app; `run` dari penjadual. Kunci VAPID dijana sekali di server dan disimpan dalam `push_config`. |
| Jadual `push_subs` | Satu baris setiap telefon: alamat push, zon waktu, tetapan peringatan, status ringkas hari ini, peringatan yang sudah dihantar. RLS hidup tanpa policy — hanya fungsi server boleh baca/tulis. |
| `pg_cron` `dietpal-push` | Setiap 15 minit memanggil `push` (`run`) dengan rahsia `cron_secret`. |

**Data yang dihantar ke server:** alamat push, zon waktu, waktu makan & pilihan peringatan, dan status hari ini (waktu makan yang dah dilog — ya/tidak, jumlah air, jumlah kalori, tarikh timbang terakhir). **Nama, berat dan senarai makanan tidak dihantar.** Langganan yang tamat (404/410) dipadam secara automatik.

Skema penuh: [`supabase/setup.sql`](supabase/setup.sql). Kod fungsi: [`supabase/functions/push/index.ts`](supabase/functions/push/index.ts).
