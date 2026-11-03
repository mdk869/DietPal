# DietPal – Coach Diet Anda

PWA pembantu diet & turun berat badan dalam Bahasa Melayu, mobile-first, berjalan terus dalam browser telefon dan boleh dipasang ke home screen.

## Ciri utama
- **Dashboard kalori** – ring progress untuk sasaran 1,500–1,700 kcal, log ikut waktu makan (Sarapan, Tengah hari, Makan malam, Snek).
- **Preset makanan Malaysia** – 67 item (nasi 1 senduk, ayam grill, ulam, roti canai, teh tarik, dll.) + makanan sendiri.
- **Cadangan Menu Coach (Enjin A)** – 58 gabungan menu di rumah atau di luar (mamak, gerai, nasi campur, kopitiam, makanan segera, kenduri, kedai serbaneka), dikira ikut baki kalori. Berfungsi offline.
- **Bantuan Pening / Masuk Angin** – langkah lega yang selamat (elektrolit, kraker, pisang), semakan data hari ini, amaran bila perlu hubungi 999.
- **Berat & milestone** – graf trend, BMI (had Asia), milestone 87 / 77 / 65 kg.
- **Penjejak air** – sasaran 2.5–3 L.
- **Panduan pinggan Suku-Suku Separuh** – ½ sayur, ¼ protein, ¼ karbo kompleks; prinsip 80/20.
- **Setup kali pertama & Profil** – pengguna isi maklumat sendiri; sasaran kalori (Mifflin-St Jeor, had minimum 1,500/1,200 kcal), air (~30 ml/kg) dan milestone dikira automatik, dengan mod manual.
- **Pilihan makanan & kesihatan** – tak makan daging/ayam/ikan/makanan laut, alahan kacang/telur/susu, tak gemar pedas; nota kencing manis, darah tinggi, gastrik untuk sesuaikan nasihat & cadangan menu.
- **Tetapan** – tema cerah/gelap/ikut telefon, saiz teks, waktu makan biasa, peringatan dalam app (air, log makan, timbang mingguan), backup/restore JSON, export CSV.

## Teknologi
- HTML5 + Vanilla JS + Tailwind CSS (CDN) – tiada build step.
- `localStorage` (kunci `dietpal.v1`) – semua data kekal dalam telefon pengguna.
- `manifest.json` + `sw.js` – boleh dipasang (Android/iOS) dan berfungsi offline selepas buka kali pertama.

## Struktur
```
index.html      UI, data makanan & menu, enjin cadangan, logik app
manifest.json   Konfigurasi PWA
sw.js           Service worker (cache dietpal-v6)
icons/          Ikon 192, 512, maskable, apple-touch-icon
```

## Jalankan secara lokal
```bash
python3 -m http.server 8000
# buka http://localhost:8000
```
Service worker hanya berfungsi melalui `http://localhost` atau HTTPS.

## Deploy
Projek statik – import repo ini ke Vercel tanpa sebarang tetapan build (Framework: Other, output: root).

## Seterusnya: Coach AI (Enjin B)
Slot sudah ada dalam kod: isi `AI_ENDPOINT` (cth: `/api/coach`) selepas fungsi Vercel `api/coach.js` dan API key Anthropic disediakan (simpan key sebagai environment variable, bukan dalam kod).

> Nilai kalori adalah anggaran purata. App ini panduan gaya hidup, bukan nasihat perubatan.
