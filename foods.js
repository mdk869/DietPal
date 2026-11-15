// DietPal — Malaysian food presets (anggaran kalori). plate: serat | protein | karbo | lain
// sweet: minuman bergula (teguran Coach & tip "kurang manis").
// mix: anggaran komposisi pinggan hidangan campur (bilangan hidangan setiap kumpulan) — untuk ring pinggan & teguran Coach.
// py: bilangan SAJIAN Piramid Makanan Malaysia 2020 dalam satu sukatan (karbo, sayur, buah, ikan, daging = ayam/telur/daging,
//   kekacang, susu). 1 sajian ikut Panduan Diet Malaysia: nasi 2 senduk / 1 cawan, roti 2 keping, sayur ½ cawan masak atau
//   1 cawan ulam, buah 1 biji / 1 hiris, ikan 1 ekor kembung, ayam 1 ketul, telur 2 biji, tempe 2 keping, tauhu 1 keping,
//   dal 1 cawan, susu 1 gelas, yogurt 1 cawan.
// cook: goreng | lemak (santan, minyak sapi, mayonis) | sihat (bakar, kukus, rebus, sup, mentah). whole: bijirin penuh / ubi.
// salty: tinggi garam / kicap / sos.
// Loaded by the app (<script src="foods.js">) and by api/coach.js (require), so both use the same list.
const FOODS = [
  // Karbohidrat
  { id:'nasi1', name:'Nasi putih', unit:'1 senduk', kcal:130, cat:'Karbo', plate:'karbo', py:{ karbo:0.5 } },
  { id:'nasip', name:'Nasi putih', unit:'1 pinggan penuh', kcal:260, cat:'Karbo', plate:'karbo', py:{ karbo:1 } },
  { id:'nasib', name:'Nasi perang', unit:'1 senduk', kcal:120, cat:'Karbo', plate:'karbo', py:{ karbo:0.5 }, whole:true },
  { id:'rotig', name:'Roti gandum', unit:'2 keping', kcal:140, cat:'Karbo', plate:'karbo', py:{ karbo:1 }, whole:true },
  { id:'oat',   name:'Oat + susu rendah lemak', unit:'1 mangkuk', kcal:200, cat:'Karbo', plate:'karbo', py:{ karbo:1, susu:0.5 }, whole:true },
  { id:'ubi',   name:'Ubi keledek rebus', unit:'1 biji sederhana', kcal:110, cat:'Karbo', plate:'karbo', py:{ karbo:1 }, cook:'sihat', whole:true },
  { id:'capati',name:'Capati', unit:'1 keping', kcal:120, cat:'Karbo', plate:'karbo', py:{ karbo:1 }, whole:true },
  // Protein
  { id:'agrill',name:'Ayam grill (tanpa kulit)', unit:'1 ketul', kcal:220, cat:'Protein', plate:'protein', py:{ daging:1 }, cook:'sihat' },
  { id:'agoreng',name:'Ayam goreng', unit:'1 ketul', kcal:290, cat:'Protein', plate:'protein', py:{ daging:1 }, cook:'goreng' },
  { id:'ikanb', name:'Ikan bakar / kukus', unit:'1 ekor kembung', kcal:170, cat:'Protein', plate:'protein', py:{ ikan:1 }, cook:'sihat' },
  { id:'ikang', name:'Ikan goreng', unit:'1 ekor kembung', kcal:230, cat:'Protein', plate:'protein', py:{ ikan:1 }, cook:'goreng' },
  { id:'telurr',name:'Telur rebus', unit:'1 biji', kcal:70, cat:'Protein', plate:'protein', py:{ daging:0.5 }, cook:'sihat' },
  { id:'telurg',name:'Telur mata', unit:'1 biji', kcal:100, cat:'Protein', plate:'protein', py:{ daging:0.5 }, cook:'goreng' },
  { id:'tempe', name:'Tempe goreng', unit:'3 keping', kcal:150, cat:'Protein', plate:'protein', py:{ kekacang:1.5 }, cook:'goreng' },
  { id:'tauhu', name:'Tauhu', unit:'1 keping', kcal:90, cat:'Protein', plate:'protein', py:{ kekacang:1 } },
  { id:'dagingm',name:'Daging masak kicap', unit:'1 senduk', kcal:200, cat:'Protein', plate:'protein', py:{ daging:1 }, salty:true },
  // Sayur / serat
  { id:'ulam',  name:'Ulam-ulaman + sambal sikit', unit:'1 piring', kcal:40, cat:'Sayur', plate:'serat', py:{ sayur:1 }, cook:'sihat' },
  { id:'sayurc',name:'Sayur campur goreng', unit:'1 senduk', kcal:80, cat:'Sayur', plate:'serat', py:{ sayur:1 } },
  { id:'sayurr',name:'Sayur rebus / sup sayur', unit:'1 mangkuk', kcal:50, cat:'Sayur', plate:'serat', py:{ sayur:1 }, cook:'sihat' },
  { id:'kangkung',name:'Kangkung belacan', unit:'1 senduk', kcal:90, cat:'Sayur', plate:'serat', py:{ sayur:1 }, salty:true },
  { id:'salad', name:'Salad / timun & tomato', unit:'1 mangkuk', kcal:30, cat:'Sayur', plate:'serat', py:{ sayur:1 }, cook:'sihat' },
  { id:'dal',   name:'Kuah dal / sayur lodeh', unit:'1 senduk', kcal:70, cat:'Sayur', plate:'serat', py:{ sayur:0.5, kekacang:0.25 } },
  // Hidangan penuh
  { id:'nlemak',name:'Nasi lemak biasa (bungkus)', unit:'1 bungkus', kcal:400, cat:'Hidangan', plate:'lain', mix:{ karbo:1, protein:0.5 }, py:{ karbo:1, daging:0.25, kekacang:0.25 }, cook:'lemak' },
  { id:'ncampur',name:'Nasi campur (1 lauk + sayur)', unit:'1 pinggan', kcal:550, cat:'Hidangan', plate:'lain', mix:{ karbo:1, protein:1, serat:1 }, py:{ karbo:1.5, daging:1, sayur:1 } },
  { id:'nayam', name:'Nasi ayam', unit:'1 pinggan', kcal:600, cat:'Hidangan', plate:'lain', mix:{ karbo:1.5, protein:1 }, py:{ karbo:1.5, daging:1 }, cook:'lemak', salty:true },
  { id:'mgoreng',name:'Mee goreng mamak', unit:'1 pinggan', kcal:550, cat:'Hidangan', plate:'lain', mix:{ karbo:1.5, protein:0.5, serat:0.5 }, py:{ karbo:1.5, daging:0.25, sayur:0.5 }, cook:'goreng', salty:true },
  { id:'ktgoreng',name:'Kuey teow goreng', unit:'1 pinggan', kcal:650, cat:'Hidangan', plate:'lain', mix:{ karbo:1.5, protein:0.5 }, py:{ karbo:1.5, daging:0.25 }, cook:'goreng', salty:true },
  { id:'msup',  name:'Mee sup / mee hoon sup', unit:'1 mangkuk', kcal:350, cat:'Hidangan', plate:'lain', mix:{ karbo:1, protein:0.5, serat:0.5 }, py:{ karbo:1, daging:0.5, sayur:0.5 }, cook:'sihat', salty:true },
  { id:'rcanai',name:'Roti canai kosong', unit:'1 keping', kcal:300, cat:'Hidangan', plate:'lain', mix:{ karbo:1 }, py:{ karbo:1 }, cook:'goreng' },
  { id:'rtelur',name:'Roti telur', unit:'1 keping', kcal:380, cat:'Hidangan', plate:'lain', mix:{ karbo:1, protein:0.5 }, py:{ karbo:1, daging:0.5 }, cook:'goreng' },
  { id:'tosai', name:'Tosai kosong', unit:'1 keping', kcal:170, cat:'Hidangan', plate:'lain', mix:{ karbo:1 }, py:{ karbo:1 } },
  // Minuman
  { id:'kopio', name:'Kopi O / teh O kosong', unit:'1 cawan', kcal:5, cat:'Minuman', plate:'lain' },
  { id:'tehtarik',name:'Teh tarik', unit:'1 cawan', kcal:150, cat:'Minuman', plate:'lain', sweet:true },
  { id:'kopisusu',name:'Kopi / teh susu kurang manis', unit:'1 cawan', kcal:90, cat:'Minuman', plate:'lain' },
  { id:'milo',  name:'Milo ais', unit:'1 gelas', kcal:190, cat:'Minuman', plate:'lain', sweet:true },
  { id:'sirap', name:'Air sirap / sirap bandung', unit:'1 gelas', kcal:180, cat:'Minuman', plate:'lain', sweet:true },
  { id:'p100z', name:'Minuman isotonik tanpa gula', unit:'1 tin / botol kecil', kcal:0, cat:'Minuman', plate:'lain', water:325 },
  { id:'airkosong', name:'Air kosong', unit:'1 gelas', kcal:0, cat:'Minuman', plate:'lain', water:250 },
  { id:'susu',  name:'Susu rendah lemak', unit:'1 gelas', kcal:110, cat:'Minuman', plate:'protein', py:{ susu:1 } },
  // Snek
  { id:'pisang',name:'Pisang', unit:'1 biji', kcal:100, cat:'Snek', plate:'serat', py:{ buah:1 } },
  { id:'epal',  name:'Epal / oren', unit:'1 biji', kcal:80, cat:'Snek', plate:'serat', py:{ buah:1 } },
  { id:'buah',  name:'Buah-buahan', unit:'1 hidangan', kcal:80, cat:'Snek', plate:'serat', py:{ buah:1 } },
  { id:'betik', name:'Betik / tembikai', unit:'1 piring', kcal:60, cat:'Snek', plate:'serat', py:{ buah:1 } },
  { id:'kraker',name:'Biskut kosong / kraker', unit:'2 keping', kcal:70, cat:'Snek', plate:'karbo', py:{ karbo:0.33 } },
  { id:'kurma', name:'Kurma', unit:'3 biji', kcal:70, cat:'Snek', plate:'lain', py:{ buah:1 } },
  { id:'kacang',name:'Kacang badam / tanah', unit:'1 genggam', kcal:160, cat:'Snek', plate:'lain', py:{ kekacang:1 } },
  { id:'karipap',name:'Karipap / kuih goreng', unit:'1 biji', kcal:130, cat:'Snek', plate:'lain', py:{ karbo:0.5 }, cook:'goreng' },
  { id:'yogurt',name:'Yogurt plain', unit:'1 cawan', kcal:100, cat:'Snek', plate:'protein', py:{ susu:1 } },
  { id:'jagung', name:'Jagung rebus', unit:'1 tongkol', kcal:120, cat:'Snek', plate:'karbo', py:{ karbo:1 }, cook:'sihat', whole:true },
  // Lauk & hidangan tambahan (digunakan oleh cadangan menu)
  { id:'tunatin', name:'Tuna dalam air', unit:'½ tin', kcal:90, cat:'Protein', plate:'protein', py:{ ikan:1 } },
  { id:'ayamsup', name:'Sup ayam', unit:'1 mangkuk', kcal:180, cat:'Protein', plate:'protein', py:{ daging:1, sayur:0.5 }, cook:'sihat' },
  { id:'ayammerah', name:'Ayam masak merah', unit:'1 ketul', kcal:280, cat:'Protein', plate:'protein', py:{ daging:1 }, cook:'goreng' },
  { id:'asampedas', name:'Ikan asam pedas', unit:'1 ketul', kcal:180, cat:'Protein', plate:'protein', py:{ ikan:1 }, cook:'sihat' },
  { id:'telurdadar', name:'Telur dadar', unit:'1 biji', kcal:120, cat:'Protein', plate:'protein', py:{ daging:0.5 }, cook:'goreng' },
  { id:'tandoori', name:'Ayam tandoori', unit:'1 ketul', kcal:230, cat:'Protein', plate:'protein', py:{ daging:1 }, cook:'sihat' },
  { id:'sate', name:'Sate ayam', unit:'5 cucuk', kcal:200, cat:'Protein', plate:'protein', py:{ daging:1 }, cook:'sihat' },
  { id:'rendang', name:'Rendang daging', unit:'1 senduk', kcal:230, cat:'Protein', plate:'protein', py:{ daging:1 }, cook:'lemak' },
  { id:'yongtau', name:'Yong tau foo sup', unit:'6 keping', kcal:280, cat:'Hidangan', plate:'protein', py:{ ikan:0.5, kekacang:0.5, sayur:0.5 }, cook:'sihat', salty:true },
  { id:'nasiminyak', name:'Nasi minyak', unit:'1 senduk', kcal:180, cat:'Karbo', plate:'karbo', py:{ karbo:0.5 }, cook:'lemak' },
  { id:'nasigoreng', name:'Nasi goreng kampung', unit:'1 senduk besar', kcal:200, cat:'Karbo', plate:'karbo', py:{ karbo:0.75 }, cook:'goreng', salty:true },
  { id:'bihun', name:'Bihun goreng', unit:'1 senduk', kcal:180, cat:'Karbo', plate:'karbo', py:{ karbo:0.5 }, cook:'goreng', salty:true },
  { id:'mashed', name:'Kentang lenyek', unit:'1 cawan kecil', kcal:110, cat:'Karbo', plate:'karbo', py:{ karbo:0.5 } },
  { id:'acar', name:'Acar timun & nanas', unit:'1 senduk', kcal:50, cat:'Sayur', plate:'serat', py:{ sayur:0.5 } },
  { id:'coleslaw', name:'Coleslaw', unit:'1 cawan kecil', kcal:120, cat:'Sayur', plate:'serat', py:{ sayur:0.5 }, cook:'lemak' },
  { id:'kuahkacang', name:'Kuah kacang', unit:'2 sudu', kcal:90, cat:'Hidangan', plate:'lain', py:{ kekacang:0.25 }, cook:'lemak' },
  { id:'kuahkari', name:'Kuah kari campur', unit:'2 sudu', kcal:60, cat:'Hidangan', plate:'lain', cook:'lemak', salty:true },
  { id:'rotibakar', name:'Roti bakar kaya', unit:'2 keping', kcal:280, cat:'Hidangan', plate:'lain', mix:{ karbo:1 }, py:{ karbo:1 } },
  { id:'burger', name:'Burger ayam grill', unit:'1 biji', kcal:400, cat:'Hidangan', plate:'lain', mix:{ karbo:1, protein:1 }, py:{ karbo:1, daging:1, sayur:0.25 }, cook:'sihat', salty:true },
  { id:'chickenchop', name:'Chicken chop grill (sos asing)', unit:'1 pinggan', kcal:520, cat:'Hidangan', plate:'lain', mix:{ karbo:0.5, protein:1, serat:0.5 }, py:{ karbo:0.5, daging:1, sayur:0.5 }, cook:'sihat' }
];
// Sugary drink / dessert? Presets use their `sweet` flag; own foods and AI menus are matched by name.
const SWEET_RE = /(^|[^a-z])(teh tarik|teh ais|kopi ais|teh c|milo|neslo|horlicks|sirap|bandung|air manis|jus|juice|soda|cola|coke|boba|bubble tea|air tin|air berkarbonat|cendol|ais kacang|ABC)(?=$|[^a-z])/i;
const NOT_SWEET_RE = /(^|[^a-z])(kosong|tanpa gula|kurang manis|zero|no sugar|less sugar|sugar free)(?=$|[^a-z])/i;
function isSweetMeal(m) {
  const f = m && m.foodId ? FOODS.find(x => x.id === m.foodId) : null;
  if (f) return !!f.sweet;
  const n = String((m && m.name) || '');
  return SWEET_RE.test(n) && !NOT_SWEET_RE.test(n);
}
if (typeof module !== 'undefined') module.exports = { FOODS, isSweetMeal };
