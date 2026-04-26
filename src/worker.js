export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    if (request.method === "GET") {
      return json({
        holat: "ishlayapti",
        xabar: "BiznesAI Professional Worker",
        groq_kalit: !!env.GEMINI_API_KEY,
        sana: bugun(),
        versiya: "3.0"
      });
    }

    if (request.method !== "POST") return json({ xato: true, xabar: "Faqat POST so'rov qabul qilinadi" }, 405);

    try {
      const { name, sector, desc, capital } = await request.json();
      if (!name || !sector || !desc || !capital) return json({ xato: true, xabar: "Barcha maydonlarni to'ldiring" }, 400);

      const mablag = Number(capital);
      const dollarKurs = await dollarOlish();
      const biznes = biznesTuri(sector, desc);
      const moliya = moliyaHisob(biznes.tur, mablag);
      const zaxira = zaxiraTahlil(name, sector, moliya, biznes);

      let aiJavob = null;
      try {
        aiJavob = await groqSorovi(env, { name, sector, desc, mablag, dollarKurs, moliya, biznes });
      } catch (e) {
        aiJavob = null;
      }

      return json(yakuniyNatija({
        name, sector, mablag, dollarKurs, biznes, moliya,
        ai: aiJavob || zaxira, zaxira
      }));

    } catch (err) {
      return json({ xato: true, xabar: err.message }, 500);
    }
  }
};

// ============================================
// YORDAMCHI FUNKSIYALAR
// ============================================
function bugun() { return new Date().toISOString().slice(0, 10); }
function yil() { return new Date().getFullYear(); }
function yax(n) { return Math.max(0, Math.round(n * 10) / 10); }
function butun(n) { return Math.max(0, Math.round(n)); }
function yuqori(n) { return Math.max(0, Math.ceil(n)); }
function chegarala(v, min, max) { return Math.max(min, Math.min(max, v)); }
function xavfsizRaqam(v, zaxira) { return typeof v === "number" && !isNaN(v) ? v : zaxira; }

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(malumot, holat = 200) {
  return new Response(JSON.stringify(malumot, null, 2), { status: holat, headers: cors() });
}

// ============================================
// MARKAZIY BANK DOLLAR KURSI
// ============================================
async function dollarOlish() {
  try {
    const javob = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/");
    const malumot = await javob.json();
    const dollar = malumot.find(x => x.Ccy === "USD");
    return dollar ? parseFloat(dollar.Rate) : 12900;
  } catch (e) {
    return 12900;
  }
}

// ============================================
// BIZNES TURINI ANIQLASH
// ============================================
function biznesTuri(soha, tavsif) {
  const matn = `${soha} ${tavsif}`.toLowerCase();

  if (/chorva|chorvachilik|mol|sigir|qoramol|qo'y|echki|parranda|tovuq|broyler|bedana|qush/.test(matn))
    return tur("chorvachilik", 55, 40);

  if (/kafe|cafe|coffee|fast.?food|lavash|burger|pizza|shaurma|oshxona|non|bakery|qahva|restoran|choyxona|donar|kebab/.test(matn))
    return tur("kafe", 68, 72);

  if (/do'kon|dokon|magazin|shop|market|retail|savdo|kiyim|aksesuar|telefon|supermarket|butik|online.?savdo/.test(matn) || soha === "Savdo")
    return tur("savdo", 64, 70);

  if (/salon|barber|sartarosh|beauty|servis|remont|consulting|cleaning|yuvish|studia|avto.?yuvish|himchistka/.test(matn) || soha === "Xizmatlar")
    return tur("xizmat", 62, 55);

  if (/app|platforma|ilova|sayt|website|crm|saas|telegram.?bot|ai|dastur|software|it|startup/.test(matn) || soha === "IT / Texnologiyalar")
    return tur("it", 72, 52);

  if (/kurs|ta'lim|o'quv.?markaz|education|training|repetitor|coaching|mentoring/.test(matn) || soha === "Ta'lim")
    return tur("talim", 61, 58);

  if (/ferma|issiqxona|dehqon|agro|greenhouse|bog'|sabzavot|meva|poliz/.test(matn) || soha === "Qishloq xo'jaligi")
    return tur("dehqonchilik", 58, 42);

  if (/sex|fabrika|ishlab.?chiqarish|tikuv|mebel|production|manufacturing|plastik|paket/.test(matn) || soha === "Ishlab chiqarish")
    return tur("ishlab_chiqarish", 57, 48);

  if (/mehmonxona|hotel|hostel|turizm|sayohat|travel|gid/.test(matn) || soha === "Turizm")
    return tur("turizm", 65, 50);

  if (/klinika|stomatolog|apteka|laboratoriya|tibbiy|medical|farmatsevtika/.test(matn) || soha === "Tibbiyot")
    return tur("tibbiyot", 70, 45);

  if (/yuk|logistika|kuryer|dostavka|taksi|transport/.test(matn) || soha === "Transport")
    return tur("transport", 63, 60);

  if (/qurilish|ta'mir|remont|uy|bino|plitka|santexnik/.test(matn) || soha === "Qurilish")
    return tur("qurilish", 60, 55);

  return tur("umumiy", 58, 55);
}

function tur(nomi, talab, raqobat) {
  return { tur: nomi, talabAsosi: talab, raqobatAsosi: raqobat, davlatYordami: davlatYordami(nomi) };
}

// ============================================
// DAVLAT QO'LLAB-QUVVATLASHI (tasdiqlangan umumiy ma'lumot)
// ============================================
function davlatYordami(tur) {
  const umumiy = [
    "Kichik biznes va xususiy tadbirkorlik subyektlari uchun soliq imtiyozlari mavjud",
    "Aniq imtiyoz va subsidiyalarni tegishli bank yoki hokimlikdan aniqlash tavsiya etiladi"
  ];

  const maxsus = {
    chorvachilik: [
      "Chorvachilik sohasida imtiyozli kredit dasturlari mavjud bo'lishi mumkin",
      "Veterinariya xizmatlari uchun davlat subsidiyalari hududlarda farq qiladi",
      "Aniq shartlarni viloyat qishloq xo'jaligi boshqarmasidan tekshirish kerak"
    ],
    kafe: [
      "Yosh tadbirkorlar uchun imtiyozli kredit dasturlari mavjud",
      "Oziq-ovqat xavfsizligi sertifikati olish majburiy"
    ],
    savdo: [
      "Savdo sohasida mikroqarz va aylanma mablag' kreditlari mavjud",
      "Online savdo uchun qo'shimcha soliq imtiyozlari tekshirilishi kerak"
    ],
    xizmat: [
      "Xizmat ko'rsatish sohasida mikrokredit dasturlari mavjud",
      "Litsenziya talab qilinadigan xizmatlar uchun tegishli organlardan ma'lumot oling"
    ],
    it: [
      "IT Park rezidentligi orqali soliqlar sezilarli kamayadi",
      "IT eksport xizmatlari uchun QQS imtiyozlari mavjud",
      "Startup fondlar va grant dasturlaridan foydalanish imkoniyati bor"
    ],
    talim: [
      "Ta'lim sohasida litsenziya olish tartibi mavjud",
      "Ba'zi ta'lim yo'nalishlari uchun davlat grant dasturlari bo'lishi mumkin"
    ],
    dehqonchilik: [
      "Qishloq xo'jaligi uchun subsidiya va imtiyozli kredit dasturlari mavjud",
      "Issiqxona va dehqonchilik uchun yer ajratish dasturlari hududlarda farq qiladi"
    ],
    ishlab_chiqarish: [
      "Import o'rnini bosuvchi loyihalar uchun soliq imtiyozlari mavjud",
      "Uskunalar uchun lizing dasturlari mavjud bo'lishi mumkin",
      "Erkin iqtisodiy zonalarda qo'shimcha imtiyozlar bor"
    ],
    turizm: [
      "Turizm infratuzilmasini rivojlantirish uchun davlat dasturlari mavjud",
      "Mehmonxona qurilishi uchun soliq imtiyozlari bo'lishi mumkin"
    ],
    tibbiyot: [
      "Tibbiy faoliyat uchun litsenziya olish majburiy",
      "Xususiy tibbiyot uchun ba'zi soliq imtiyozlari mavjud bo'lishi mumkin"
    ],
    transport: [
      "Transport vositalari uchun lizing dasturlari mavjud",
      "Yuk tashish uchun tegishli ruxsatnoma va litsenziyalar kerak"
    ],
    qurilish: [
      "Qurilish sohasida litsenziya olish majburiy",
      "Uy-joy qurilishi uchun davlat buyurtmalari va tender dasturlari mavjud"
    ]
  };

  return [...(maxsus[tur] || []), ...umumiy];
}

// ============================================
// MOLIYAVIY HISOB-KITOB
// ============================================
function moliyaHisob(tur, mablag) {
  const hisoblar = {
    chorvachilik: chorvaHisob,
    kafe: kafeHisob,
    savdo: savdoHisob,
    xizmat: xizmatHisob,
    it: itHisob,
    talim: talimHisob,
    dehqonchilik: dehqonHisob,
    ishlab_chiqarish: ishchiqHisob,
    turizm: turizmHisob,
    tibbiyot: tibbiyotHisob,
    transport: transportHisob,
    qurilish: qurilishHisob,
    umumiy: umumiyHisob
  };

  return (hisoblar[tur] || umumiyHisob)(mablag);
}

// ===== CHORVACHILIK =====
function chorvaHisob(mablag) {
  let format, minMablag, xodimSon, maosh, ijara, kommunal, reklama, boshqa, xomashyo, tushum, soliq, xodimMatn;

  if (mablag < 80) {
    format = "kichik chorvachilik boshlang'ich loyihasi";
    minMablag = 60; xodimSon = 2; maosh = 4; ijara = 1.5; kommunal = 0.8; reklama = 0.5; boshqa = 1.5;
    xomashyo = 5; tushum = yax(8 + mablag * 0.06); soliq = yax(tushum * 0.03);
    xodimMatn = "2 kishi: egasi va 1 yordamchi ishchi";
  } else if (mablag < 200) {
    format = "o'rta chorvachilik loyihasi";
    minMablag = 120; xodimSon = 3; maosh = 8; ijara = 2.5; kommunal = 1.2; reklama = 1; boshqa = 2.5;
    xomashyo = 10; tushum = yax(14 + (mablag - 80) * 0.06); soliq = yax(tushum * 0.03);
    xodimMatn = "3 kishi: boshqaruvchi va 2 ishchi";
  } else if (mablag < 500) {
    format = "kengaytirilgan chorvachilik loyihasi";
    minMablag = 250; xodimSon = 5; maosh = 14; ijara = 4; kommunal = 2; reklama = 1.5; boshqa = 4;
    xomashyo = 18; tushum = yax(25 + (mablag - 200) * 0.04); soliq = yax(tushum * 0.03);
    xodimMatn = "5 kishi: boshqaruvchi, veterinar yordamchisi, 3 ishchi";
  } else {
    format = "yirik chorvachilik xo'jaligi";
    minMablag = 500; xodimSon = 8; maosh = 24; ijara = 6; kommunal = 3; reklama = 2; boshqa = 6;
    xomashyo = 30; tushum = yax(45 + (mablag - 500) * 0.03); soliq = yax(tushum * 0.03);
    xodimMatn = "8 kishi: boshqaruv, veterinariya, ishchilar";
  }

  return paket("chorvachilik", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 24, 36, mablag);
}

// ===== KAFE =====
function kafeHisob(mablag) {
  let format, minMablag, xodimSon, maosh, ijara, kommunal, reklama, boshqa, xomashyo, tushum, soliq, xodimMatn;

  if (mablag < 60) {
    format = "mini coffee point / takeaway nuqta";
    minMablag = 35; xodimSon = 2; maosh = 7; ijara = yax(4 + mablag * 0.03); kommunal = 1; reklama = 1.5; boshqa = 1.2;
    tushum = yax(18 + mablag * 0.18); xomashyo = yax(tushum * 0.35); soliq = yax(tushum * 0.04);
    xodimMatn = "2 kishi: 1 barista, 1 yordamchi";
  } else if (mablag < 150) {
    format = "kichik kafe / fastfood nuqta";
    minMablag = 70; xodimSon = 4; maosh = 14; ijara = yax(7 + (mablag - 60) * 0.04); kommunal = 1.5; reklama = 3; boshqa = 2;
    tushum = yax(30 + (mablag - 60) * 0.25); xomashyo = yax(tushum * 0.36); soliq = yax(tushum * 0.045);
    xodimMatn = "4 kishi: 1 oshpaz, 1 yordamchi, 2 sotuvchi";
  } else if (mablag < 350) {
    format = "standart kafe";
    minMablag = 180; xodimSon = 7; maosh = 25; ijara = yax(14 + (mablag - 150) * 0.03); kommunal = 3; reklama = 5; boshqa = 4;
    tushum = yax(65 + (mablag - 150) * 0.18); xomashyo = yax(tushum * 0.37); soliq = yax(tushum * 0.05);
    xodimMatn = "7 kishi: 2 oshpaz, 2 ofitsiant, 1 kassir, 1 admin, 1 yordamchi";
  } else {
    format = "to'liq kafe / restoran";
    minMablag = 350; xodimSon = 12; maosh = 45; ijara = yax(22 + (mablag - 350) * 0.02); kommunal = 6; reklama = 9; boshqa = 7;
    tushum = yax(120 + (mablag - 350) * 0.1); xomashyo = yax(tushum * 0.38); soliq = yax(tushum * 0.06);
    xodimMatn = "12 kishi: oshxona jamoasi, zal xodimlari, admin va kassirlar";
  }

  return paket("kafe", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 24, 24, mablag);
}

// ===== SAVDO =====
function savdoHisob(mablag) {
  let format, minMablag, xodimSon, maosh, ijara, kommunal, reklama, boshqa, sMarjasi, xodimMatn;

  if (mablag < 70) {
    format = "kiosk / mini savdo nuqtasi"; minMablag = 40; xodimSon = 1; maosh = 3; ijara = 2.5;
    kommunal = 0.5; reklama = 0.8; boshqa = 0.7; sMarjasi = 0.24;
    xodimMatn = "1 kishi: egasi yoki sotuvchi";
  } else if (mablag < 180) {
    format = "kichik do'kon"; minMablag = 90; xodimSon = 3; maosh = 10; ijara = 6;
    kommunal = 1; reklama = 2; boshqa = 1.5; sMarjasi = 0.22;
    xodimMatn = "3 kishi: 2 sotuvchi, 1 admin";
  } else if (mablag < 400) {
    format = "o'rta do'kon"; minMablag = 180; xodimSon = 5; maosh = 18; ijara = 12;
    kommunal = 2; reklama = 4; boshqa = 3; sMarjasi = 0.20;
    xodimMatn = "5 kishi: 3 sotuvchi, 1 admin, 1 omborchi";
  } else {
    format = "katta do'kon / mini market"; minMablag = 350; xodimSon = 8; maosh = 30; ijara = 20;
    kommunal = 4; reklama = 7; boshqa = 5; sMarjasi = 0.18;
    xodimMatn = "8 kishi: sotuvchilar, kassir, admin, omborchi";
  }

  const tovarZaxira = mablag * 0.6;
  const tushum = yax(tovarZaxira * 1.8);
  const xomashyo = yax(tushum * (1 - sMarjasi));
  const soliq = yax(tushum * 0.04);

  return paket("savdo", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 25, 24, mablag);
}

// ===== XIZMAT =====
function xizmatHisob(mablag) {
  let format, minMablag, xodimSon, maosh, ijara, kommunal, reklama, boshqa, tushum, materialFoiz, xodimMatn;

  if (mablag < 50) {
    format = "mikro xizmat nuqtasi"; minMablag = 25; xodimSon = 2; maosh = 6; ijara = 3; kommunal = 0.7; reklama = 1.2; boshqa = 1; materialFoiz = 0.08;
    tushum = yax(10 + mablag * 0.18); xodimMatn = "2 kishi: egasi + 1 yordamchi";
  } else if (mablag < 150) {
    format = "kichik salon / servis markazi"; minMablag = 60; xodimSon = 4; maosh = 14; ijara = 7; kommunal = 1.2; reklama = 2.5; boshqa = 1.8; materialFoiz = 0.10;
    tushum = yax(20 + (mablag - 50) * 0.2); xodimMatn = "4 kishi: 2 mutaxassis, 1 admin, 1 yordamchi";
  } else {
    format = "xizmat markazi"; minMablag = 140; xodimSon = 7; maosh = 28; ijara = 12; kommunal = 2.5; reklama = 4; boshqa = 3; materialFoiz = 0.12;
    tushum = yax(40 + (mablag - 150) * 0.15); xodimMatn = "7 kishi: mutaxassislar, admin, sotuv bo'limi";
  }

  const xomashyo = yax(tushum * materialFoiz);
  const soliq = yax(tushum * 0.04);
  return paket("xizmat", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 24, 24, mablag);
}

// ===== IT =====
function itHisob(mablag) {
  let format, minMablag, xodimSon, maosh, ijara, kommunal, reklama, boshqa, tushum, xodimMatn;

  if (mablag < 80) {
    format = "mikro IT studiya"; minMablag = 30; xodimSon = 2; maosh = 14; ijara = 2.5; kommunal = 0.6; reklama = 1.5; boshqa = 1.4;
    tushum = yax(16 + mablag * 0.3); xodimMatn = "2 kishi: dasturchi + dizayner yoki sotuv";
  } else if (mablag < 250) {
    format = "kichik IT kompaniya"; minMablag = 100; xodimSon = 5; maosh = 40; ijara = 6; kommunal = 1; reklama = 3; boshqa = 2.5;
    tushum = yax(45 + (mablag - 80) * 0.25); xodimMatn = "5 kishi: dasturchilar, dizayner, loyiha boshqaruvchisi, sotuv";
  } else {
    format = "o'rta IT kompaniya"; minMablag = 220; xodimSon = 8; maosh = 75; ijara = 10; kommunal = 1.5; reklama = 7; boshqa = 5;
    tushum = yax(90 + (mablag - 250) * 0.18); xodimMatn = "8 kishi: dasturlash, mahsulot, sotuv, qo'llab-quvvatlash jamoasi";
  }

  const xomashyo = 0;
  const soliq = yax(tushum * 0.01);
  return paket("it", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 23, 24, mablag);
}

// ===== TA'LIM =====
function talimHisob(mablag) {
  let format, minMablag, xodimSon, maosh, ijara, kommunal, reklama, boshqa, tushum, xodimMatn;

  if (mablag < 70) {
    format = "mini o'quv markaz"; minMablag = 35; xodimSon = 2; maosh = 8; ijara = 4; kommunal = 0.8; reklama = 1.5; boshqa = 1.2;
    tushum = yax(12 + mablag * 0.18); xodimMatn = "2 kishi: 1 o'qituvchi, 1 admin";
  } else {
    format = "o'rta o'quv markaz"; minMablag = 90; xodimSon = 5; maosh = 18; ijara = 8; kommunal = 1.5; reklama = 3; boshqa = 2;
    tushum = yax(25 + (mablag - 70) * 0.15); xodimMatn = "5 kishi: o'qituvchilar, admin, sotuv bo'limi";
  }

  const xomashyo = yax(tushum * 0.05);
  const soliq = yax(tushum * 0.04);
  return paket("talim", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 24, 24, mablag);
}

// ===== DEHQONCHILIK =====
function dehqonHisob(mablag) {
  const kichik = mablag < 150;
  const format = kichik ? "kichik dehqonchilik loyihasi" : "o'rta dehqonchilik loyihasi";
  const minMablag = kichik ? 80 : 180;
  const xodimSon = kichik ? 3 : 6; const maosh = kichik ? 9 : 18; const ijara = kichik ? 3 : 6;
  const kommunal = kichik ? 1 : 2; const reklama = kichik ? 1 : 2; const boshqa = kichik ? 2 : 4;
  const xomashyo = kichik ? 12 : 30;
  const tushum = yax(kichik ? 16 + mablag * 0.18 : 35 + mablag * 0.15);
  const soliq = yax(tushum * 0.03);
  const xodimMatn = kichik ? "3 kishi: dehqon, 2 yordamchi" : "6 kishi: ishlab chiqarish va yetkazish jamoasi";

  return paket("dehqonchilik", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 22, 36, mablag);
}

// ===== ISHLAB CHIQARISH =====
function ishchiqHisob(mablag) {
  const kichik = mablag < 300;
  const format = kichik ? "mini ishlab chiqarish sexi" : "o'rta ishlab chiqarish";
  const minMablag = kichik ? 180 : 350;
  const xodimSon = kichik ? 5 : 10; const maosh = kichik ? 18 : 40; const ijara = kichik ? 8 : 18;
  const kommunal = kichik ? 4 : 8; const reklama = kichik ? 2 : 5; const boshqa = kichik ? 4 : 8;
  const xomashyo = yax(kichik ? 18 + mablag * 0.12 : 35 + mablag * 0.15);
  const tushum = yax(kichik ? 28 + mablag * 0.18 : 70 + mablag * 0.15);
  const soliq = yax(tushum * 0.04);
  const xodimMatn = kichik ? "5 kishi: ustalar va yordamchilar" : "10 kishi: sex ishchilari, texnolog, admin";

  return paket("ishlab_chiqarish", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 26, 36, mablag);
}

// ===== TURIZM =====
function turizmHisob(mablag) {
  const kichik = mablag < 200;
  const format = kichik ? "kichik turizm xizmati" : "o'rta turizm kompaniyasi";
  const minMablag = kichik ? 50 : 200;
  const xodimSon = kichik ? 2 : 6; const maosh = kichik ? 8 : 22; const ijara = kichik ? 3 : 10;
  const kommunal = kichik ? 0.5 : 2; const reklama = kichik ? 2 : 6; const boshqa = kichik ? 1.5 : 4;
  const xomashyo = 0;
  const tushum = yax(kichik ? 12 + mablag * 0.18 : 38 + mablag * 0.14);
  const soliq = yax(tushum * 0.04);
  const xodimMatn = kichik ? "2 kishi: gid + boshqaruvchi" : "6 kishi: gidlar, boshqaruvchi, sotuv, admin";

  return paket("turizm", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 24, 24, mablag);
}

// ===== TIBBIYOT =====
function tibbiyotHisob(mablag) {
  const kichik = mablag < 300;
  const format = kichik ? "kichik tibbiy kabinet" : "klinika / tibbiy markaz";
  const minMablag = kichik ? 150 : 400;
  const xodimSon = kichik ? 3 : 8; const maosh = kichik ? 18 : 50; const ijara = kichik ? 8 : 20;
  const kommunal = kichik ? 2 : 5; const reklama = kichik ? 2 : 6; const boshqa = kichik ? 3 : 8;
  const xomashyo = yax(kichik ? 4 + mablag * 0.03 : 12 + mablag * 0.025);
  const tushum = yax(kichik ? 22 + mablag * 0.15 : 65 + mablag * 0.12);
  const soliq = yax(tushum * 0.04);
  const xodimMatn = kichik ? "3 kishi: shifokor, hamshira, admin" : "8 kishi: shifokorlar, hamshiralar, admin";

  return paket("tibbiyot", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 25, 36, mablag);
}

// ===== TRANSPORT =====
function transportHisob(mablag) {
  const kichik = mablag < 200;
  const format = kichik ? "kichik yuk tashish / kuryer xizmati" : "o'rta logistika kompaniyasi";
  const minMablag = kichik ? 80 : 250;
  const xodimSon = kichik ? 2 : 6; const maosh = kichik ? 8 : 24; const ijara = kichik ? 2 : 8;
  const kommunal = kichik ? 1 : 3; const reklama = kichik ? 1.5 : 4; const boshqa = kichik ? 4 : 12;
  const xomashyo = 0;
  const tushum = yax(kichik ? 14 + mablag * 0.15 : 45 + mablag * 0.12);
  const soliq = yax(tushum * 0.04);
  const xodimMatn = kichik ? "2 kishi: haydovchi + boshqaruvchi" : "6 kishi: haydovchilar, dispetcher, admin";

  return paket("transport", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 25, 36, mablag);
}

// ===== QURILISH =====
function qurilishHisob(mablag) {
  const kichik = mablag < 300;
  const format = kichik ? "kichik qurilish brigadasi" : "o'rta qurilish kompaniyasi";
  const minMablag = kichik ? 100 : 350;
  const xodimSon = kichik ? 4 : 10; const maosh = kichik ? 14 : 38; const ijara = kichik ? 3 : 10;
  const kommunal = kichik ? 1 : 3; const reklama = kichik ? 1.5 : 4; const boshqa = kichik ? 5 : 12;
  const xomashyo = yax(kichik ? 12 + mablag * 0.12 : 30 + mablag * 0.14);
  const tushum = yax(kichik ? 22 + mablag * 0.16 : 60 + mablag * 0.13);
  const soliq = yax(tushum * 0.04);
  const xodimMatn = kichik ? "4 kishi: ustalar va yordamchilar" : "10 kishi: ustalar, boshqaruvchi, admin";

  return paket("qurilish", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 26, 36, mablag);
}

// ===== UMUMIY =====
function umumiyHisob(mablag) {
  const kichik = mablag < 100; const orta = mablag < 300;
  const format = kichik ? "kichik biznes" : orta ? "o'rta biznes" : "kengaytirilgan loyiha";
  const minMablag = kichik ? 50 : 150;
  const xodimSon = kichik ? 2 : orta ? 5 : 8;
  const maosh = kichik ? 7 : orta ? 18 : 32;
  const ijara = kichik ? 4 : orta ? 10 : 18;
  const kommunal = kichik ? 1 : orta ? 2 : 4;
  const reklama = kichik ? 1.5 : orta ? 4 : 7;
  const boshqa = kichik ? 1.5 : orta ? 3 : 5;
  const xomashyo = kichik ? 8 : orta ? 20 : 38;
  const tushum = yax(kichik ? 15 + mablag * 0.18 : orta ? 35 + mablag * 0.15 : 70 + mablag * 0.12);
  const soliq = yax(tushum * 0.04);
  const xodimMatn = `${xodimSon} kishi: loyiha formatiga mos jamoa`;

  return paket("umumiy", format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, 25, 24, mablag);
}

// ============================================
// PAKETLASH (barcha sohalar uchun)
// ============================================
function paket(tur, format, minMablag, xodimSon, xodimMatn, maosh, ijara, kommunal, reklama, xomashyo, soliq, boshqa, tushum, foizStavka, muddat, mablag) {
  const xarajat = yax(maosh + ijara + kommunal + reklama + boshqa + xomashyo + soliq);
  const foyda = yax(tushum - xarajat);
  const qoplashMuddati = foyda > 0 ? yuqori(mablag / foyda) : 0;
  const yillikQaytish = foyda > 0 ? butun((foyda * 12 / mablag) * 100) : 0;
  const kreditKerak = mablag < minMablag;
  const kreditMiqdori = kreditKerak ? butun((minMablag - mablag) * 1.15 / 5) * 5 : 0;
  const oylikTolov = kreditKerak ? yax(annuitetHisob(kreditMiqdori, foizStavka, muddat)) : 0;

  return {
    tur, format, minMablag, xodimMatn,
    moliya: {
      xodimlar_soni: xodimSon,
      maosh_fondi: yax(maosh),
      ijara: yax(ijara),
      kommunal: yax(kommunal),
      reklama: yax(reklama),
      xomashyo: yax(xomashyo),
      soliq: yax(soliq),
      boshqa_xarajatlar: yax(boshqa),
      oylik_xarajat: yax(xarajat),
      oylik_tushum: yax(tushum),
      oylik_foyda: yax(foyda),
      qoplash_muddati: qoplashMuddati,
      yillik_qaytish: yillikQaytish
    },
    kredit: {
      kerak: kreditKerak,
      miqdor: kreditMiqdori,
      foiz_stavka: kreditKerak ? foizStavka : 0,
      muddat_oy: kreditKerak ? muddat : 0,
      oylik_tolov: oylikTolov,
      izoh: kreditKerak
        ? `Joriy mablag' ${format} uchun yetarli emas. Kamida ${minMablag} mln so'm kerak.`
        : `Joriy mablag' ${format} formatida boshlash uchun yetarli.`
    }
  };
}

function annuitetHisob(asosiy, yillikFoiz, oylarSoni) {
  const oylikFoiz = yillikFoiz / 100 / 12;
  if (oylikFoiz === 0) return asosiy / oylarSoni;
  return asosiy * (oylikFoiz / (1 - Math.pow(1 + oylikFoiz, -oylarSoni)));
}

// ============================================
// GROQ AI CHAQIRISH
// ============================================
async function groqSorovi(env, ctx) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY topilmadi");

  const savol = `
Sen O'zbekiston tadbirkorlari uchun ishlaydigan professional biznes maslahatchi AIsan.

QOIDALAR:
1. FAQAT O'ZBEK LOTIN yozuvida yoz. Kirill ishlatma.
2. Real, aniq, professional maslahat ber. Umumiy gap yozma.
3. O'zbekiston bozori va sharoitiga mos maslahat ber.
4. Moliyaviy raqamlarni qayta hisoblab chiqma — biz berdik.
5. "Yaxshi g'oya", "Zo'r loyiha" kabi maqtov yozma. Faqat real holat.
6. Tavsiyalar amaliy bo'lsin — tadbirkor ertaga nima qilishini bilsin.
7. Huquqiy hujjatlarning ANIQ raqami, sanasi, nomini YOZMA.
8. Davlat qo'llab-quvvatlashi haqida faqat UMUMIY yoz. Aniq qaror raqami yozma.
9. Kredit foizi: oddiy biznes krediti 22-28%. 10-15% faqat maxsus dasturda mumkin.
10. Aniq joy nomlari yozma.

TADBIRKOR:
- Biznes: ${ctx.name}
- Soha: ${ctx.sector}
- Tavsif: ${ctx.desc}
- Mablag': ${ctx.mablag} mln so'm
- Dollar: ${ctx.dollarKurs} so'm

TIZIM ANIQLAGAN FORMAT:
- Format: ${ctx.moliya.format}
- Minimal mablag': ${ctx.moliya.minMablag} mln
- Oylik tushum: ${ctx.moliya.moliya.oylik_tushum} mln
- Oylik xarajat: ${ctx.moliya.moliya.oylik_xarajat} mln
- Oylik foyda: ${ctx.moliya.moliya.oylik_foyda} mln
- O'zini qoplash: ${ctx.moliya.moliya.qoplash_muddati} oy
- Yillik qaytish: ${ctx.moliya.moliya.yillik_qaytish}%
- Kredit: ${ctx.moliya.kredit.kerak ? ctx.moliya.kredit.miqdor + ' mln, ' + ctx.moliya.kredit.foiz_stavka + '%' : "kerak emas"}

VAZIFA:
1. ai_tahlil: 3-5 gap CHUQUR xulosa. Nega ishlaydi/ishlamaydi — real sabab.
2. kuchli_tomonlar: 3-4 ta ANIQ kuchli tomon.
3. zaif_tomonlar: 3-4 ta ANIQ zaif tomon.
4. xavflar: 3-4 ta ANIQ xavf.
5. imkoniyatlar: 3-4 ta ANIQ imkoniyat.
6. tavsiyalar: 5 ta AMALIY qadam.
7. davlat_yordami: Faqat umumiy. Aniq qaror raqami yozma.
8. xulosa: 1-2 gap yakuniy xulosa.
9. baho: 0-100
10. yakuniy_baho: ISTIQBOLLI / EHTIYOTKOR / XAVFLI

FAQAT JSON. Markdown yozma. Kirill yozma.

{
  "baho": 0,
  "yakuniy_baho": "",
  "ai_tahlil": "",
  "bozor_talabi": 0,
  "raqobat": 0,
  "foyda_imkoniyati": 0,
  "xavf_darajasi": 0,
  "kuchli_tomonlar": [],
  "zaif_tomonlar": [],
  "xavflar": [],
  "imkoniyatlar": [],
  "tavsiyalar": [],
  "davlat_yordami": [],
  "xulosa": ""
}
`;

  const javob = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GEMINI_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Sen faqat valid JSON qaytaradigan, faqat o'zbek lotin yozuvida javob beradigan professional biznes tahlilchi AIsan." },
        { role: "user", content: savol }
      ]
    })
  });

  const malumot = await javob.json();
  if (!javob.ok) throw new Error(malumot?.error?.message || "Groq xatolik");

  let matn = malumot?.choices?.[0]?.message?.content || "";
  matn = matn.replace(/```json/gi, "").replace(/```/g, "").trim();

  try { return JSON.parse(matn); }
  catch (e) {
    const topildi = matn.match(/\{[\s\S]*\}/);
    if (!topildi) throw new Error("AI javobini o'qib bo'lmadi");
    return JSON.parse(topildi[0]);
  }
}

// ============================================
// ZAXIRA TAHLIL (AI ishlamasa)
// ============================================
function zaxiraTahlil(name, sector, moliya, biznes) {
  const foyda = moliya.moliya.oylik_foyda;
  const qoplash = moliya.moliya.qoplash_muddati;
  const tushum = moliya.moliya.oylik_tushum;

  return {
    baho: foyda > 0 ? (qoplash <= 12 ? 68 : 55) : 35,
    yakuniy_baho: foyda > 0 ? (qoplash <= 12 ? "ISTIQBOLLI" : "EHTIYOTKOR") : "XAVFLI",
    ai_tahlil: `${name} loyihasi ${sector} sohasida ${moliya.format} formatida baholandi. ${foyda > 0 ? 'Hozirgi formatda oylik foyda ijobiy ko\'rinadi, lekin dastlabki oylarda barqaror mijoz oqimini shakllantirish muhim.' : 'Joriy mablag\' va formatda oylik foyda salbiy. Format yoki mablag\'ni qayta ko\'rib chiqish kerak.'}`,
    bozor_talabi: biznes.talabAsosi,
    raqobat: biznes.raqobatAsosi,
    foyda_imkoniyati: foyda > 0 ? chegarala(40 + butun((foyda / Math.max(1, tushum)) * 100), 30, 80) : 25,
    xavf_darajasi: foyda > 0 ? (moliya.kredit.kerak ? 58 : 42) : 78,
    kuchli_tomonlar: [
      "Kichik formatdan boshlab xavfni kamaytirish mumkin",
      "Bosqichma-bosqich o'sish strategiyasi qo'llanilishi mumkin",
      "O'zbekiston ichki bozorida shu soha uchun talab mavjud"
    ],
    zaif_tomonlar: [
      "Dastlabki oylarda barqaror daromad kafolatlanmaydi",
      "Xarajatlarni noto'g'ri boshqarish foydani keskin kamaytiradi",
      "Bozorga kirish bosqichida raqobat bilan kurashish qiyin bo'lishi mumkin"
    ],
    xavflar: [
      "Ijara va xomashyo narxlari kutilganidan yuqori bo'lishi mumkin",
      "Aylanma mablag' yetishmasligi kundalik faoliyatga ta'sir qiladi",
      "Mavsumiy o'zgarishlar tushum barqarorligiga ta'sir qilishi mumkin"
    ],
    imkoniyatlar: [
      "Ijtimoiy tarmoqlar orqali arzon va samarali marketing qilish mumkin",
      "Sodiq mijozlar dasturi orqali qayta sotuvni oshirish mumkin",
      "Mahalliy yetkazib beruvchilar bilan hamkorlik xarajatni kamaytiradi"
    ],
    tavsiyalar: [
      `1-qadam: ${moliya.format} formatida aniq biznes modelni tanlang va xarajatlar ro'yxatini tuzing`,
      "2-qadam: Maqsadli auditoriyani aniqlang va ularning ehtiyojlarini o'rganing",
      "3-qadam: Minimal xarajat bilan ish boshlang va dastlabki natijalarni kuzating",
      "4-qadam: Ijtimoiy tarmoqlar va og'zaki reklama orqali mijoz jalb qiling",
      "5-qadam: Dastlabki 3-6 oy ichida natijani tahlil qilib keyin kengaytirish haqida qaror qiling"
    ],
    davlat_yordami: biznes.davlatYordami,
    xulosa: foyda > 0
      ? `${moliya.format} sifatida boshlash mumkin, lekin dastlabki oylarda xarajatlarni qat'iy nazorat qilish muhim.`
      : `Joriy formatda loyiha xavfli — format yoki mablag'ni qayta ko'rib chiqish kerak.`
  };
}

// ============================================
// YAKUNIY NATIJA (AI + FORMULALAR)
// ============================================
function yakuniyNatija({ name, sector, mablag, dollarKurs, biznes, moliya, ai, zaxira }) {
  const m = moliya.moliya;
  const marjasi = m.oylik_tushum > 0 ? (m.oylik_foyda / m.oylik_tushum) * 100 : 0;

  const hayotiyBaho = hayotiylikBahosi(moliya, mablag);
  const aiBaho = xavfsizRaqam(ai.baho, zaxira.baho);
  const yakunBaho = chegarala(butun(aiBaho * 0.5 + hayotiyBaho * 0.5), 15, 95);

  const yakunTalab = chegarala(butun(xavfsizRaqam(ai.bozor_talabi, biznes.talabAsosi) * 0.7 + biznes.talabAsosi * 0.3), 15, 95);
  const yakunRaqobat = chegarala(butun(xavfsizRaqam(ai.raqobat, biznes.raqobatAsosi) * 0.7 + biznes.raqobatAsosi * 0.3), 15, 95);
  const foydaKorsatkich = chegarala(butun(15 + marjasi * 2), 10, 90);
  const yakunFoyda = chegarala(butun(xavfsizRaqam(ai.foyda_imkoniyati, 50) * 0.5 + foydaKorsatkich * 0.5), 10, 95);

  let yakunXavf = xavfsizRaqam(ai.xavf_darajasi, 50);
  if (moliya.kredit.kerak) yakunXavf += 12;
  if (m.oylik_foyda <= 0) yakunXavf += 25;
  if (m.qoplash_muddati > 18) yakunXavf += 10;
  yakunXavf = chegarala(butun(yakunXavf), 15, 95);

  let yakuniyBahoMatn = "EHTIYOTKOR";
  if (m.oylik_foyda <= 0 || mablag < moliya.minMablag * 0.5) yakuniyBahoMatn = "XAVFLI";
  else if (yakunBaho >= 72 && m.qoplash_muddati > 0 && m.qoplash_muddati <= 14) yakuniyBahoMatn = "ISTIQBOLLI";

  return {
    nomi: name,
    soha: sector,
    umumiy_baho: yakunBaho,
    yakuniy_baho: yakuniyBahoMatn,
    ai_tahlil: ai.ai_tahlil || zaxira.ai_tahlil,
    bozor_talabi: yakunTalab,
    raqobat: yakunRaqobat,
    foyda_imkoniyati: yakunFoyda,
    xavf_darajasi: yakunXavf,
    taxminiy_jamoa: moliya.xodimMatn,
    kuchli_tomonlar: birlashtir(ai.kuchli_tomonlar, zaxira.kuchli_tomonlar, 3),
    zaif_tomonlar: birlashtir(ai.zaif_tomonlar, zaxira.zaif_tomonlar, 3),
    xavflar: birlashtir(ai.xavflar, zaxira.xavflar, 3),
    imkoniyatlar: birlashtir(ai.imkoniyatlar, zaxira.imkoniyatlar, 3),
    tavsiyalar: birlashtir(ai.tavsiyalar, zaxira.tavsiyalar, 5),
    moliya: m,
    kredit: moliya.kredit,
    davlat_yordami: birlashtir(ai.davlat_yordami, moliya.kredit.kerak ? biznes.davlatYordami : biznes.davlatYordami.slice(0, 2), 2),
    xulosa: ai.xulosa || zaxira.xulosa,
    format: moliya.format,
    tavsiya_etilgan_min_mablag: moliya.minMablag,
    dollar_kursi: dollarKurs,
    sana: bugun()
  };
}

function hayotiylikBahosi(moliya, mablag) {
  const m = moliya.moliya;
  if (m.oylik_foyda <= 0) return 20;
  let baho = 50;
  const marjasi = m.oylik_tushum > 0 ? (m.oylik_foyda / m.oylik_tushum) * 100 : 0;
  if (mablag >= moliya.minMablag) baho += 12; else baho -= 12;
  if (m.qoplash_muddati <= 8) baho += 15;
  else if (m.qoplash_muddati <= 14) baho += 8;
  else if (m.qoplash_muddati <= 24) baho += 2;
  else baho -= 10;
  if (marjasi >= 20) baho += 10;
  else if (marjasi >= 10) baho += 5;
  else if (marjasi < 5) baho -= 8;
  return chegarala(butun(baho), 20, 90);
}

function birlashtir(asosiy, zaxira, minimal) {
  const a = Array.isArray(asosiy) ? asosiy.filter(Boolean) : [];
  const z = Array.isArray(zaxira) ? zaxira.filter(Boolean) : [];
  const natija = [...a];
  for (const element of z) { if (natija.length >= minimal) break; if (!natija.includes(element)) natija.push(element); }
  return natija.slice(0, Math.max(minimal, natija.length));
}
