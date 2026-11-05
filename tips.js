// DietPal — Tips diet & kesihatan (v1.8). Ditulis siap, tiada AI: kos sifar, isi konsisten & boleh disemak.
// Setiap tip: id · cat (kategori) · t (tajuk) · s (ringkas: kad Utama & notifikasi, ≤ 120 aksara) · b (penuh, dalam sheet)
//   ask (soalan siap untuk "Tanya Coach") · on (isyarat dari log yang mengutamakan tip ini) · tags (makanan yang disebut —
//   tip disorok jika bercanggah dengan pantang/alahan) · season (hanya dalam musim itu) · note (nota ikut nota kesihatan).
// Loaded by the app (<script src="tips.js">) and by the unit tests (require).
const TIP_CATS = {
  protein: 'Protein', sayur: 'Sayur', karbo: 'Karbo', gula: 'Gula & minuman', luar: 'Makan luar',
  air: 'Air', berat: 'Berat badan', tabiat: 'Tabiat', perayaan: 'Musim perayaan'
};

// Why a tip was picked today — shown in the sheet ("Anda nampak tip ni sebab …").
const TIP_WHY = {
  under: 'kalori anda bawah sasaran minimum dalam 3 hari lepas',
  lapse: 'tiada log makan 2 hari lepas',
  gain: 'berat anda naik minggu ini',
  plateau: 'berat anda hampir sama sejak 2 minggu',
  lowProtein: 'protein dalam log anda rendah dalam 3 hari lepas',
  lowVeg: 'sayur dalam log anda kurang dalam 3 hari lepas',
  sweet: 'ada air manis dalam log anda dalam 3 hari lepas',
  over: 'kalori anda lebih dari sasaran dalam 3 hari lepas',
  weekend: 'hujung minggu lepas kalori anda lebih dari sasaran',
  lowWater: 'air anda kurang dari sasaran dalam 3 hari lepas',
  newbie: 'ini minggu pertama anda guna DietPal'
};
// Checked in this order. A season tip comes after the safety/progress signals but before everyday nudges.
const TIP_ORDER = ['under', 'lapse', 'gain', 'plateau', 'season', 'lowProtein', 'lowVeg', 'sweet', 'over', 'weekend', 'lowWater', 'newbie'];

// Festive windows (tarikh cuti umum Malaysia; Ramadan/Raya/Haji/Deepavali tertakluk pengumuman). Kemas kini setiap tahun.
// `md` = berulang setiap tahun (MM-DD).
const TIP_SEASONS = [
  { id: 'deepavali', label: 'musim Deepavali', from: '2026-11-03', to: '2026-11-12' },
  { id: 'hujungtahun', label: 'cuti hujung tahun', md: ['12-12', '01-02'] },
  { id: 'cny', label: 'musim Tahun Baru Cina', from: '2027-01-30', to: '2027-02-20' },
  { id: 'ramadan', label: 'bulan Ramadan', from: '2027-02-08', to: '2027-03-09' },
  { id: 'raya', label: 'musim Hari Raya Aidilfitri', from: '2027-03-10', to: '2027-04-08' },
  { id: 'haji', label: 'Hari Raya Aidiladha', from: '2027-05-14', to: '2027-05-20' },
  { id: 'deepavali', label: 'musim Deepavali', from: '2027-10-23', to: '2027-11-01' }
];

const TIPS = [
  // ---------- Protein ----------
  { id: 'protein-murah', cat: 'protein', on: ['lowProtein'], tags: ['telur', 'ikan'],
    t: 'Protein murah, kenyang lama',
    s: 'Telur, tempe, tauhu dan ikan kembung — protein mesra poket yang buat perut kenyang lebih lama.',
    b: 'Protein lambat dihadam, jadi perut rasa kenyang lebih lama dan kurang craving waktu petang. Pilihan bajet: 2 biji telur, sekeping tempe, tauhu atau seekor ikan kembung. Cuba ada satu sumber protein setiap kali makan.',
    ask: 'Bagi idea lauk protein yang murah untuk seminggu' },
  { id: 'protein-tempe', cat: 'protein', on: ['lowProtein'],
    t: 'Tempe & tauhu pun protein',
    s: 'Tak semestinya ayam atau ikan — tempe, tauhu dan dal pun sumber protein yang baik.',
    b: 'Tempe, tauhu dan dal murah, senang dimasak dan tahan lama dalam peti. Tempe goreng kering atau tauhu sumbat boleh jadi lauk utama. Cuba masak cara bakar atau tumis dengan minyak sikit.',
    ask: 'Bagi resepi ringkas tempe atau tauhu yang rendah minyak' },
  { id: 'protein-sarapan', cat: 'protein', on: ['lowProtein', 'newbie'], tags: ['telur'],
    t: 'Sarapan berprotein',
    s: 'Tambah telur atau tempe waktu sarapan — kurang lapar sebelum makan tengah hari.',
    b: 'Sarapan karbo sahaja (roti, kuih, nasi lemak kosong) cepat buat lapar semula. Tambah protein seperti 1–2 biji telur rebus atau tempe, dan rasa kenyang bertahan sampai tengah hari.',
    ask: 'Bagi idea sarapan berprotein yang cepat disediakan' },
  { id: 'protein-tapak', cat: 'protein', on: ['lowProtein'],
    t: 'Sukat protein dengan tapak tangan',
    s: 'Satu hidangan protein lebih kurang sebesar tapak tangan anda — tak perlu timbang.',
    b: 'Ikut Pinggan Sihat Malaysia, protein ialah ¼ pinggan. Cara mudah: seketul ayam, ikan atau tauhu sebesar tapak tangan (tanpa jari). Sama untuk setiap waktu makan utama.',
    ask: 'Macam mana nak pastikan protein cukup setiap hari?' },

  // ---------- Sayur ----------
  { id: 'sayur-dulu', cat: 'sayur', on: ['lowVeg', 'over'],
    t: 'Makan sayur dulu',
    s: 'Mula dengan sayur atau ulam, baru nasi dan lauk — cepat rasa kenyang.',
    b: 'Sayur tinggi serat dan rendah kalori. Bila makan sayur dulu, perut mula penuh sebelum sampai ke nasi, jadi kurang tambah. Cuba separuh pinggan sayur setiap kali makan.',
    ask: 'Bagi idea sayur yang senang dimasak untuk makan malam' },
  { id: 'sayur-ulam', cat: 'sayur', on: ['lowVeg'],
    t: 'Ulam pun dikira sayur',
    s: 'Timun, ulam raja, pegaga, kacang botol — makan mentah pun dah kira sayur.',
    b: 'Tak sempat masak sayur? Ulam tak perlu dimasak dan kalorinya sangat rendah. Basuh dan simpan dalam bekas di peti, senang ambil waktu makan.',
    ask: 'Ulam apa yang sesuai untuk diet dan senang dapat?' },
  { id: 'sayur-beku', cat: 'sayur', on: ['lowVeg'],
    t: 'Sayur beku pun boleh',
    s: 'Simpan sayur campur beku dalam peti — senang masuk dalam nasi goreng, mee atau sup.',
    b: 'Sayur beku dibekukan segar, jadi khasiatnya masih ada. Sesuai untuk hari sibuk: masukkan segenggam ke dalam nasi goreng, mee atau sup untuk tambah serat tanpa banyak kerja.',
    ask: 'Bagi idea masakan cepat guna sayur beku' },
  { id: 'sayur-luar', cat: 'sayur', on: ['lowVeg'],
    t: 'Ambil sayur dulu di nasi campur',
    s: 'Di gerai nasi campur, ambil 2 jenis sayur dulu sebelum pilih lauk.',
    b: 'Bila sayur dah ambil separuh pinggan, ruang untuk nasi dan lauk goreng jadi kecil dengan sendirinya. Pilih sayur tumis atau rebus berbanding sayur masak lemak.',
    ask: 'Apa pilihan terbaik di gerai nasi campur?' },

  // ---------- Karbo ----------
  { id: 'karbo-senduk', cat: 'karbo', on: ['over'],
    t: 'Nasi 1 senduk dah cukup',
    s: 'Nasi tak perlu dipotong — 1 senduk (¼ pinggan) cukup untuk tenaga tanpa terlebih kalori.',
    b: 'Karbohidrat ialah sumber tenaga utama. Yang penting ialah saiznya: ¼ pinggan atau lebih kurang sebesar penumbuk. Kalau dah biasa makan banyak, kurangkan sikit-sikit dalam 2–3 minggu.',
    ask: 'Macam mana nak kurangkan nasi tanpa rasa lapar?' },
  { id: 'karbo-perang', cat: 'karbo',
    t: 'Cuba campur nasi perang',
    s: 'Mula dengan separuh nasi putih, separuh nasi perang — serat lebih, kenyang lebih lama.',
    b: 'Nasi perang ada lebih serat, jadi gula dalam darah naik lebih perlahan dan kenyang lebih lama. Kalau tak biasa dengan teksturnya, mula dengan campuran separuh-separuh.',
    ask: 'Apa beza nasi putih dan nasi perang untuk diet?' },
  { id: 'karbo-jangan-potong', cat: 'karbo', on: ['under', 'newbie'],
    t: 'Jangan potong karbo terus',
    s: 'Potong karbo mendadak boleh buat pening dan lemah. Kurangkan sikit-sikit dalam 2–3 minggu.',
    b: 'Bila karbo dipotong secara mendadak, ramai rasa pening, sakit kepala dan cepat penat. Diet yang boleh dikekalkan lebih penting dari diet yang cepat. Kurangkan saiz hidangan, bukan buang terus.',
    ask: 'Kenapa saya rasa pening bila kurangkan nasi?' },

  // ---------- Gula & minuman ----------
  { id: 'gula-kurang-manis', cat: 'gula', on: ['sweet'],
    t: 'Minta kurang manis',
    s: 'Teh tarik kurang manis atau kosong — cara paling mudah jimat kalori setiap hari.',
    b: 'Minuman manis cepat tambah kalori tapi tak buat kenyang. Bila order, sebut "kurang manis" atau "kosong". Lidah biasanya akan biasa dengan rasa kurang manis dalam 2–3 minggu.',
    ask: 'Minuman apa yang sesuai bila makan di kedai?' },
  { id: 'gula-air-dulu', cat: 'gula', on: ['sweet', 'lowWater'],
    t: 'Air kosong dulu, baru air manis',
    s: 'Bila haus, minum segelas air kosong dulu. Selalunya keinginan air manis berkurang.',
    b: 'Kadang-kadang kita order air manis sebab haus, bukan sebab teringin. Minum segelas air kosong dulu — kalau masih teringin, ambil saiz kecil atau kurang manis.',
    ask: 'Macam mana nak kurangkan minum air manis?' },
  { id: 'gula-jus', cat: 'gula', on: ['sweet'],
    t: 'Buah sebiji lebih baik dari jus',
    s: 'Buah sebiji lebih mengenyangkan dari segelas jus — seratnya masih ada.',
    b: 'Jus buah, walaupun tanpa gula tambahan, mengandungi gula buah tanpa seratnya. Makan buah sebiji buat kenyang lebih lama dan kalorinya lebih rendah dari segelas jus.',
    ask: 'Buah apa yang sesuai untuk snek diet?' },
  { id: 'gula-saiz', cat: 'gula', on: ['sweet'],
    t: 'Teringin? Pilih saiz kecil',
    s: 'Air manis saiz besar boleh ada kalori dua kali ganda saiz biasa. Saiz kecil pun dah puas.',
    b: 'Tak perlu larang diri terus — larangan selalu buat kita makin teringin. Ambil saiz kecil, kurang manis, dan nikmati perlahan-lahan.',
    ask: 'Berapa kalori air manis yang biasa saya minum?' },
  { id: 'gula-pencuci', cat: 'gula', on: ['over'],
    t: 'Pencuci mulut? Kongsi',
    s: 'Teringin kek atau kuih? Ambil separuh atau kongsi — puas hati tanpa terlebih.',
    b: 'Beberapa suapan pertama selalunya yang paling sedap. Kongsi dengan kawan atau ambil separuh — anda masih dapat rasa, tanpa kalori penuh.',
    ask: 'Kuih apa yang lebih rendah kalori?' },

  // ---------- Makan luar ----------
  { id: 'luar-mamak', cat: 'luar', on: ['over', 'weekend'],
    t: 'Order di mamak dengan bijak',
    s: 'Tosai atau roti canai kosong dengan dal, dan teh O kurang manis.',
    b: 'Di mamak, pilih tosai, capati atau roti canai kosong berbanding roti telur, murtabak atau roti bom. Minta kuah dal berbanding kari, dan pilih minuman kurang manis.',
    ask: 'Apa pilihan terbaik di kedai mamak?' },
  { id: 'luar-bakar', cat: 'luar', on: ['over'],
    t: 'Pilih bakar, kukus atau sup',
    s: 'Lauk bakar, kukus atau sup berbanding goreng — rasa tetap sedap, minyak kurang.',
    b: 'Cara masak beri beza besar pada kalori. Ayam bakar, ikan kukus atau sup biasanya jauh lebih rendah kalori dari versi goreng tepung. Minta sos atau kuah diasingkan.',
    ask: 'Lauk apa yang rendah kalori bila makan di luar?' },
  { id: 'luar-nasi-campur', cat: 'luar', on: ['over', 'weekend'],
    t: 'Strategi nasi campur',
    s: 'Separuh pinggan sayur, satu lauk protein, nasi 1 senduk. Kuah diasingkan.',
    b: 'Nasi campur boleh jadi sihat kalau ikut susunan Pinggan Sihat Malaysia. Kuah yang dituang atas nasi selalunya tambah kalori tanpa sedar — minta sikit atau asing.',
    ask: 'Macam mana nak pilih lauk nasi campur untuk diet?' },
  { id: 'luar-segera', cat: 'luar', on: ['weekend'],
    t: 'Makanan segera tanpa rasa bersalah',
    s: 'Pilih saiz biasa, tukar air manis ke air kosong, dan jangan upsize.',
    b: 'Sesekali makan makanan segera tak salah. Elak upsize, pilih burger biasa berbanding double, dan tukar air bergas ke air kosong. Itu sahaja dah jimat banyak kalori.',
    ask: 'Apa pilihan paling ringan di restoran makanan segera?' },
  { id: 'luar-kenduri', cat: 'luar', on: ['weekend'],
    t: 'Datang kenduri? Ambil sikit',
    s: 'Nasi minyak sedikit, banyakkan acar dan pilih lauk yang tak bergoreng.',
    b: 'Tak perlu tolak hidangan kenduri. Ambil nasi minyak sedikit, tambah acar atau sayur, dan pilih satu lauk. Minum air kosong berbanding sirap.',
    ask: 'Saya ke kenduri hujung minggu ni. Apa patut ambil?' },

  // ---------- Air ----------
  { id: 'air-bangun', cat: 'air', on: ['lowWater'],
    t: 'Segelas air bila bangun',
    s: 'Letak gelas air di tepi katil — minum terus bila bangun tidur.',
    b: 'Tabiat kecil yang dikaitkan dengan rutin sedia ada lebih senang diingat. Segelas air waktu bangun tidur dah jadi permulaan yang baik untuk sasaran air harian.',
    ask: 'Macam mana nak capai sasaran air setiap hari?' },
  { id: 'air-botol', cat: 'air', on: ['lowWater'],
    t: 'Bawa botol air',
    s: 'Botol air di meja kerja buat anda minum tanpa perlu ingat.',
    b: 'Bila air ada depan mata, kita minum lebih kerap. Pilih botol 500 ml atau 1 liter dan cuba habiskan sebelum waktu tertentu, contohnya sebelum makan tengah hari.',
    ask: 'Berapa banyak air saya patut minum sehari?' },
  { id: 'air-lapar', cat: 'air', on: ['lowWater'],
    t: 'Lapar atau dahaga?',
    s: 'Kadang-kadang rasa lapar sebenarnya dahaga. Minum segelas air, tunggu 10 minit.',
    b: 'Rasa dahaga dan lapar boleh rasa serupa. Bila tiba-tiba teringin snek di luar waktu makan, minum segelas air dulu. Kalau masih lapar selepas 10 minit, ambil snek yang sihat.',
    ask: 'Snek apa yang sesuai bila lapar antara waktu makan?' },
  { id: 'air-sebelum-makan', cat: 'air',
    t: 'Segelas air sebelum makan',
    s: 'Segelas air sebelum makan bantu rasa kenyang lebih cepat.',
    b: 'Minum segelas air kira-kira 15–30 minit sebelum makan boleh bantu anda rasa kenyang lebih awal, jadi kurang tambah nasi.',
    ask: 'Bila waktu terbaik untuk minum air?' },

  // ---------- Berat badan ----------
  { id: 'berat-plateau', cat: 'berat', on: ['plateau'],
    t: 'Berat tak turun 2 minggu? Normal',
    s: 'Plateau biasa berlaku. Semak saiz hidangan, tambah jalan kaki, dan teruskan — jangan potong makan.',
    b: 'Bila berat turun, badan perlukan kalori yang sedikit kurang dari sebelumnya, jadi progres boleh jadi perlahan. Semak semula saiz hidangan dan minuman manis, tambah aktiviti ringan, dan beri masa 2–3 minggu lagi.',
    ask: 'Berat saya tak turun 2 minggu. Apa patut saya buat?' },
  { id: 'berat-naik', cat: 'berat', on: ['gain'],
    t: 'Berat naik tiba-tiba?',
    s: 'Naik 1–2 kg dalam beberapa hari selalunya air dan garam, bukan lemak. Lihat trend minggu, bukan sehari.',
    b: 'Makanan masin, karbo lebih atau tidur tak cukup boleh buat badan simpan air. Teruskan rutin biasa, minum air secukupnya, dan timbang semula minggu depan pada hari dan masa yang sama.',
    ask: 'Kenapa berat saya naik walaupun saya ikut diet?' },
  { id: 'berat-trend', cat: 'berat', on: ['gain', 'newbie'],
    t: 'Tengok trend, bukan sehari',
    s: 'Berat naik turun setiap hari. Timbang pada hari & masa yang sama, nilai ikut graf mingguan.',
    b: 'Berat boleh berubah 1–2 kg dalam sehari bergantung pada air, garam dan makanan dalam perut. Timbang pagi, lepas ke tandas, sebelum makan — dan nilai progres ikut trend beberapa minggu.',
    ask: 'Berapa kerap saya patut timbang berat?' },
  { id: 'berat-pinggang', cat: 'berat', on: ['plateau'],
    t: 'Ukur pinggang juga',
    s: 'Kadang-kadang berat tak berubah tapi seluar makin longgar — itu pun progres.',
    b: 'Penimbang hanya tunjuk satu nombor. Ukur lilit pinggang sebulan sekali, atau perhatikan baju dan seluar. Perubahan saiz badan juga tanda anda di jalan yang betul.',
    ask: 'Selain berat, apa tanda diet saya berjaya?' },
  { id: 'berat-perlahan', cat: 'berat',
    t: 'Perlahan tapi kekal',
    s: 'Turun 0.25–0.75 kg seminggu lebih mudah dikekalkan berbanding diet ekstrem.',
    b: 'Diet ekstrem mungkin nampak cepat, tapi susah diteruskan dan berat selalu naik semula. Kadar perlahan beri masa untuk tabiat baru jadi kebiasaan.',
    ask: 'Berapa lama masa yang realistik untuk capai berat sasaran saya?' },

  // ---------- Tabiat ----------
  { id: 'tabiat-sambung', cat: 'tabiat', on: ['lapse'],
    t: 'Terlepas beberapa hari? Sambung saja',
    s: 'Tak perlu tunggu Isnin. Log satu makanan hari ini — itu dah kira mula semula.',
    b: 'Semua orang ada minggu yang sibuk atau terlepas. Yang penting bukan rekod sempurna, tapi kembali semula. Mula dengan satu langkah kecil: log makan seterusnya.',
    ask: 'Macam mana nak kembali bersemangat untuk diet?' },
  { id: 'tabiat-8020', cat: 'tabiat', on: ['over', 'weekend'],
    t: 'Ingat 80/20',
    s: 'Terlebih sehari tak rosakkan progres. Esok sambung macam biasa — jangan ganti dengan berlapar.',
    b: 'Satu hari terlebih kalori ialah sebahagian dari "20" dalam 80/20. Berlapar esoknya selalunya buat lebih lapar dan makan lebih. Teruskan dengan waktu makan biasa.',
    ask: 'Semalam saya terlebih makan. Apa patut saya buat hari ini?' },
  { id: 'tabiat-cukup-makan', cat: 'tabiat', on: ['under'],
    t: 'Jangan makan terlalu sikit',
    s: 'Makan bawah sasaran minimum selalu buat badan lemah dan cepat give up. Cukupkan 3 waktu makan.',
    b: 'Defisit kalori yang terlalu besar boleh buat pening, mudah marah dan akhirnya makan berlebihan. Pastikan ada 3 waktu makan dengan protein, sayur dan karbo. Kalau memang makan cukup tapi lupa log, tak apa — log bila sempat.',
    ask: 'Bagi idea menu sehari yang cukup kalori untuk sasaran saya' },
  { id: 'tabiat-perlahan', cat: 'tabiat',
    t: 'Makan perlahan',
    s: 'Badan ambil masa kira-kira 20 minit untuk rasa kenyang. Letak sudu sekejap antara suapan.',
    b: 'Bila makan cepat, kita habis sepinggan sebelum badan sempat rasa kenyang. Kunyah perlahan, berbual, atau letak sudu antara suapan.',
    ask: 'Tips untuk elak makan berlebihan' },
  { id: 'tabiat-tidur', cat: 'tabiat',
    t: 'Tidur cukup, kurang craving',
    s: 'Kurang tidur boleh buat lebih lapar dan teringin makanan manis esoknya. Cuba tidur 7–8 jam.',
    b: 'Tidur yang tak cukup mengganggu hormon yang kawal rasa lapar dan kenyang. Elak skrin sebelum tidur dan cuba tidur pada waktu yang sama setiap malam.',
    ask: 'Snek malam yang sesuai kalau lapar sebelum tidur?' },
  { id: 'tabiat-jalan', cat: 'tabiat', on: ['plateau'],
    t: 'Jalan kaki lepas makan',
    s: 'Jalan 10–15 minit lepas makan — senang, tak perlu ke gym.',
    b: 'Jalan kaki ringan lepas makan bantu tambah aktiviti harian tanpa rasa penat. Mula dengan 10 minit lepas makan malam, dan tambah bila dah biasa.',
    ask: 'Senaman ringan apa yang sesuai untuk pemula?' },
  { id: 'tabiat-snek', cat: 'tabiat',
    t: 'Rancang snek awal',
    s: 'Sediakan snek seperti buah atau jagung rebus — kurang tergoda dengan kerepek bila lapar petang.',
    b: 'Bila lapar dan tiada pilihan, kita ambil apa yang ada. Sediakan snek sihat lebih awal dan letak di tempat yang mudah dicapai.',
    ask: 'Bagi idea snek bawah 150 kcal' },
  { id: 'tabiat-log', cat: 'tabiat', on: ['newbie'],
    t: 'Log sebelum suap pertama',
    s: 'Log atau scan dulu sebelum makan — lebih sedar apa yang dimakan.',
    b: 'Bila log sebelum makan, anda nampak baki kalori dan boleh ubah saiz hidangan jika perlu. Kalau terlupa, log sejurus selepas makan — lebih tepat dari log di hujung hari.',
    ask: 'Macam mana nak jadikan log makan satu tabiat?' },
  { id: 'tabiat-pinggan', cat: 'tabiat',
    t: 'Guna pinggan lebih kecil',
    s: 'Pinggan kecil buat hidangan nampak penuh — mata pun puas.',
    b: 'Saiz pinggan mempengaruhi berapa banyak kita ambil. Pinggan yang lebih kecil buat hidangan yang sama nampak lebih banyak, jadi kurang rasa tak cukup.',
    ask: 'Macam mana nak kawal saiz hidangan di rumah?' },
  { id: 'tabiat-hujung-minggu', cat: 'tabiat', on: ['weekend'],
    t: 'Rancang hujung minggu',
    s: 'Tahu ada makan besar hujung minggu? Pilih yang ringan waktu lain hari itu — tapi jangan skip makan.',
    b: 'Hujung minggu selalu ada makan bersama keluarga atau kawan. Rancang awal: sarapan berprotein, tengah hari ringan, dan nikmati makan besar tanpa rasa bersalah.',
    ask: 'Saya ada makan besar hujung minggu ni. Macam mana nak rancang hari tu?' },

  // ---------- Musim perayaan ----------
  { id: 'musim-deepavali', cat: 'perayaan', season: 'deepavali',
    t: 'Deepavali: nikmati dengan bijak',
    s: 'Murukku dan kuih manis — ambil sikit dalam piring, jangan makan terus dari balang.',
    b: 'Bila makan terus dari balang, kita susah kira berapa banyak yang dah dimakan. Letak beberapa keping dalam piring, nikmati perlahan, dan pilih air kosong atau teh kurang manis bila beraya.',
    ask: 'Saya beraya Deepavali. Macam mana nak kawal makan?' },
  { id: 'musim-cny', cat: 'perayaan', season: 'cny',
    t: 'Tahun Baru Cina: limau & kuih',
    s: 'Limau mandarin pilihan snek yang baik. Kuih kapit dan tart nanas — ambil sikit dan kongsi.',
    b: 'Limau mandarin rendah kalori dan tinggi serat. Kuih raya seperti tart nanas dan kuih bangkit sedap tapi tinggi kalori, jadi ambil sebiji dua dan nikmati perlahan.',
    ask: 'Saya ada jamuan Tahun Baru Cina. Apa patut saya pilih?' },
  { id: 'musim-sahur', cat: 'perayaan', season: 'ramadan',
    t: 'Bagi yang berpuasa: jangan skip sahur',
    s: 'Sahur dengan karbo kompleks, protein dan air — tenaga lebih stabil sepanjang hari.',
    b: 'Sahur yang seimbang (contohnya nasi atau oat, telur atau ikan, sayur dan air kosong) bantu kurang lapar dan lemah waktu petang. Waktu berbuka, mula dengan air dan kurma, kemudian makan dengan perlahan.',
    note: { diabetes: 'Ada kencing manis? Bincang dengan doktor sebelum berpuasa, terutama tentang ubat dan tanda gula rendah.' },
    ask: 'Bagi idea menu sahur dan berbuka yang seimbang' },
  { id: 'musim-bazar', cat: 'perayaan', season: 'ramadan',
    t: 'Bazar Ramadan: beli ikut rancangan',
    s: 'Perut lapar buat kita beli lebih. Tentukan menu dulu sebelum ke bazar.',
    b: 'Senaraikan 1–2 juadah sahaja sebelum keluar. Pilih lauk bakar atau sup, dan elak beli banyak jenis air manis sekali gus.',
    ask: 'Juadah bazar Ramadan apa yang lebih rendah kalori?' },
  { id: 'musim-raya', cat: 'perayaan', season: 'raya',
    t: 'Rumah terbuka: ambil hidangan kecil',
    s: 'Banyak rumah dalam sehari? Ambil hidangan kecil di setiap rumah dan pilih air kosong.',
    b: 'Bila beraya dari rumah ke rumah, kalori cepat bertambah. Ambil sedikit di setiap rumah, pilih ketupat atau lemang dengan kuah sedikit, dan minum air kosong.',
    ask: 'Macam mana nak beraya tanpa terlebih makan?' },
  { id: 'musim-haji', cat: 'perayaan', season: 'haji', tags: ['daging'],
    t: 'Raya Haji: daging korban',
    s: 'Pilih potongan daging kurang lemak, masak bakar atau sup, dan seimbangkan dengan sayur.',
    b: 'Daging lembu dan kambing tinggi protein, tetapi bahagian berlemak tinggi kalori. Buang lemak yang nampak, masak cara sup atau bakar, dan makan bersama sayur.',
    ask: 'Bagi idea masakan daging korban yang lebih sihat' },
  { id: 'musim-cuti', cat: 'perayaan', season: 'hujungtahun',
    t: 'Cuti hujung tahun',
    s: 'Rutin berubah masa cuti — kekalkan satu tabiat sahaja: log makan atau jalan kaki setiap hari.',
    b: 'Masa cuti, jadual makan dan tidur selalu berubah. Tak perlu sempurna — pilih satu tabiat untuk dikekalkan, dan sambung rutin penuh bila cuti tamat.',
    ask: 'Macam mana nak jaga diet masa bercuti?' }
];

// ---------- Selection ----------
const TIP_REPEAT_DAYS = 30;   // a tip shown as "Tips hari ini" won't come back for this many days

function tipSeason(date) {   // date: 'YYYY-MM-DD' → season object or null
  const md = date.slice(5);
  return TIP_SEASONS.find(x => x.md ? (x.md[0] <= x.md[1] ? md >= x.md[0] && md <= x.md[1] : md >= x.md[0] || md <= x.md[1])
    : date >= x.from && date <= x.to) || null;
}
function tipById(id) { return TIPS.find(x => x.id === id) || null; }
function tipDayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
function tipHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Picks today's tip. Pure: everything it needs comes in `o`.
//   date · signals (Set of TIP_ORDER keys found in the log) · seen { id: 'YYYY-MM-DD' } · votes { id: 1 | -1 }
//   avoid (Set of food tags) · exclude (id) · lastWhy (yesterday's reason, not repeated two days running when there's another)
// → { id, why } — why is a signal key, 'season' or '' (general rotation).
function pickTip(o) {
  const seen = o.seen || {}, votes = o.votes || {}, avoid = o.avoid || new Set(), signals = o.signals || new Set();
  const season = tipSeason(o.date);
  const ok = x => x.id !== o.exclude && votes[x.id] !== -1 && !(x.tags || []).some(t => avoid.has(t)) &&
    (!x.season || (season && x.season === season.id)) &&
    (!seen[x.id] || tipDayDiff(seen[x.id], o.date) >= TIP_REPEAT_DAYS);
  const choose = (list, salt) => list.length ? list[tipHash(o.date + '|' + salt) % list.length] : null;
  const keys = TIP_ORDER.filter(k => k === 'season' ? !!season : signals.has(k));
  const order = [...keys.filter(k => k !== o.lastWhy), ...keys.filter(k => k === o.lastWhy)];
  for (const k of order) {
    const pool = TIPS.filter(x => ok(x) && (k === 'season' ? !!x.season : (x.on || []).includes(k)));
    const x = choose(pool, k); if (x) return { id: x.id, why: k };
  }
  // General rotation: never-seen first, then the ones seen longest ago.
  const pool = TIPS.filter(x => ok(x) && !x.season);
  const fresh = pool.filter(x => !seen[x.id]);
  const x = choose(fresh.length ? fresh : pool, 'all');
  if (x) return { id: x.id, why: '' };
  // Everything shown recently (or disliked): fall back to anything allowed, ignoring the repeat window.
  const any = TIPS.filter(x => x.id !== o.exclude && votes[x.id] !== -1 && !x.season && !(x.tags || []).some(t => avoid.has(t)));
  const y = choose(any, 'any');
  return y ? { id: y.id, why: '' } : null;
}
function tipWhyText(why, date) {
  if (why === 'season') { const s = tipSeason(date); return s ? 'Tip khas ' + s.label + '.' : ''; }
  return TIP_WHY[why] ? 'Anda nampak tip ni sebab ' + TIP_WHY[why] + '.' : '';
}

if (typeof module !== 'undefined') module.exports = { TIPS, TIP_CATS, TIP_WHY, TIP_ORDER, TIP_SEASONS, tipSeason, tipById, pickTip, tipWhyText, tipDayDiff };
