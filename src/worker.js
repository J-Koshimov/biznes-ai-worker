export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    if (request.method === "GET") {
      return json({
        ok: true,
        message: "BiznesAI Professional Worker ishlayapti",
        has_groq_key: !!env.GEMINI_API_KEY,
        date: bugun(),
        version: "3.1"
      });
    }

    if (request.method !== "POST") return json({ error: true, message: "Faqat POST so'rov qabul qilinadi" }, 405);

    try {
      const { name, sector, desc, capital } = await request.json();
      if (!name || !sector || !desc || !capital) return json({ error: true, message: "Barcha maydonlarni to'ldiring" }, 400);

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
      return json({ error: true, message: err.message }, 500);
    }
  }
};

function bugun() { return new Date().toISOString().slice(0, 10); }
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
  if (/qurilish|ta'mir|uy|bino|plitka|santexnik/.test(matn) || soha === "Qurilish")
    return tur("qurilish", 60, 55);

  return tur("umumiy", 58, 55);
}

function tur(nomi, talab, raqobat) {
  return { tur: nomi, talabAsosi: talab, raqobatAsosi: raqobat, davlatYordami: davlatYordami(nomi) };
}

function davlatYordami(tur) {
  const umumiy = [
    "Kichik biznes va xususiy tadbirkorlik subyektlari uchun soliq imtiyozlari mavjud",
    "Aniq imtiyoz va subsidiyalarni tegishli bank yoki hokimlikdan aniqlash tavsiya etiladi"
  ];
  const maxsus = {
    chorvachilik: ["Chorvachilik sohasida imtiyozli kredit dasturlari mavjud bo'lishi mumkin", "Veterinariya xizmatlari uchun davlat subsidiyalari hududlarda farq qiladi", "Aniq shartlarni viloyat qishloq xo'jaligi boshqarmasidan tekshirish kerak"],
    kafe: ["Yosh tadbirkorlar uchun imtiyozli kredit dasturlari mavjud", "Oziq-ovqat xavfsizligi sertifikati olish majburiy"],
    savdo: ["Savdo sohasida mikroqarz va aylanma mablag' kreditlari mavjud", "Online savdo uchun qo'shimcha soliq imtiyozlari tekshirilishi kerak"],
    xizmat: ["Xizmat ko'rsatish sohasida mikrokredit dasturlari mavjud", "Litsenziya talab qilinadigan xizmatlar uchun tegishli organlardan ma'lumot oling"],
    it: ["IT Park rezidentligi orqali soliqlar sezilarli kamayadi", "IT eksport xizmatlari uchun QQS imtiyozlari mavjud", "Startup fondlar va grant dasturlaridan foydalanish imkoniyati bor"],
    talim: ["Ta'lim sohasida litsenziya olish tartibi mavjud", "Ba'zi ta'lim yo'nalishlari uchun davlat grant dasturlari bo'lishi mumkin"],
    dehqonchilik: ["Qishloq xo'jaligi uchun subsidiya va imtiyozli kredit dasturlari mavjud", "Issiqxona va dehqonchilik uchun yer ajratish dasturlari hududlarda farq qiladi"],
    ishlab_chiqarish: ["Import o'rnini bosuvchi loyihalar uchun soliq imtiyozlari mavjud", "Uskunalar uchun lizing dasturlari mavjud bo'lishi mumkin", "Erkin iqtisodiy zonalarda qo'shimcha imtiyozlar bor"],
    turizm: ["Turizm infratuzilmasini rivojlantirish uchun davlat dasturlari mavjud", "Mehmonxona qurilishi uchun soliq imtiyozlari bo'lishi mumkin"],
    tibbiyot: ["Tibbiy faoliyat uchun litsenziya olish majburiy", "Xususiy tibbiyot uchun ba'zi soliq imtiyozlari mavjud bo'lishi mumkin"],
    transport: ["Transport vositalari uchun lizing dasturlari mavjud", "Yuk tashish uchun tegishli ruxsatnoma va litsenziyalar kerak"],
    qurilish: ["Qurilish sohasida litsenziya olish majburiy", "Uy-joy qurilishi uchun davlat buyurtmalari va tender dasturlari mavjud"]
  };
  return [...(maxsus[tur] || []), ...umumiy];
}

function moliyaHisob(tur, mablag) {
  const hisoblar = {
    chorvachilik: chorvaHisob, kafe: kafeHisob, savdo: savdoHisob, xizmat: xizmatHisob,
    it: itHisob, talim: talimHisob, dehqonchilik: dehqonHisob, ishlab_chiqarish: ishchiqHisob,
    turizm: turizmHisob, tibbiyot: tibbiyotHisob, transport: transportHisob,
    qurilish: qurilishHisob, umumiy: umumiyHisob
  };
  return (hisoblar[tur] || umumiyHisob)(mablag);
}

function chorvaHisob(mablag) {
  let f, mc, sc, sf, rn, ut, mk, ot, rm, rv, tx, st;
  if (mablag < 80) {
    f="kichik chorvachilik boshlang'ich loyihasi"; mc=60; sc=2; sf=4; rn=1.5; ut=0.8; mk=0.5; ot=1.5;
    rm=5; rv=yax(8+mablag*0.06); tx=yax(rv*0.03); st="2 kishi: egasi va 1 yordamchi ishchi";
  } else if (mablag < 200) {
    f="o'rta chorvachilik loyihasi"; mc=120; sc=3; sf=8; rn=2.5; ut=1.2; mk=1; ot=2.5;
    rm=10; rv=yax(14+(mablag-80)*0.06); tx=yax(rv*0.03); st="3 kishi: boshqaruvchi va 2 ishchi";
  } else if (mablag < 500) {
    f="kengaytirilgan chorvachilik loyihasi"; mc=250; sc=5; sf=14; rn=4; ut=2; mk=1.5; ot=4;
    rm=18; rv=yax(25+(mablag-200)*0.04); tx=yax(rv*0.03); st="5 kishi: boshqaruvchi, veterinar yordamchisi, 3 ishchi";
  } else {
    f="yirik chorvachilik xo'jaligi"; mc=500; sc=8; sf=24; rn=6; ut=3; mk=2; ot=6;
    rm=30; rv=yax(45+(mablag-500)*0.03); tx=yax(rv*0.03); st="8 kishi: boshqaruv, veterinariya, ishchilar";
  }
  return paket("chorvachilik",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,24,36,mablag);
}

function kafeHisob(mablag) {
  let f, mc, sc, sf, rn, ut, mk, ot, rm, rv, tx, st;
  if (mablag < 60) {
    f="mini coffee point / takeaway nuqta"; mc=35; sc=2; sf=7; rn=yax(4+mablag*0.03); ut=1; mk=1.5; ot=1.2;
    rv=yax(18+mablag*0.18); rm=yax(rv*0.35); tx=yax(rv*0.04); st="2 kishi: 1 barista, 1 yordamchi";
  } else if (mablag < 150) {
    f="kichik kafe / fastfood nuqta"; mc=70; sc=4; sf=14; rn=yax(7+(mablag-60)*0.04); ut=1.5; mk=3; ot=2;
    rv=yax(30+(mablag-60)*0.25); rm=yax(rv*0.36); tx=yax(rv*0.045); st="4 kishi: 1 oshpaz, 1 yordamchi, 2 sotuvchi";
  } else if (mablag < 350) {
    f="standart kafe"; mc=180; sc=7; sf=25; rn=yax(14+(mablag-150)*0.03); ut=3; mk=5; ot=4;
    rv=yax(65+(mablag-150)*0.18); rm=yax(rv*0.37); tx=yax(rv*0.05); st="7 kishi: 2 oshpaz, 2 ofitsiant, 1 kassir, 1 admin, 1 yordamchi";
  } else {
    f="to'liq kafe / restoran"; mc=350; sc=12; sf=45; rn=yax(22+(mablag-350)*0.02); ut=6; mk=9; ot=7;
    rv=yax(120+(mablag-350)*0.1); rm=yax(rv*0.38); tx=yax(rv*0.06); st="12 kishi: oshxona jamoasi, zal xodimlari, admin va kassirlar";
  }
  return paket("kafe",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,24,24,mablag);
}

function savdoHisob(mablag) {
  let f, mc, sc, sf, rn, ut, mk, ot, gm, st;
  if (mablag < 70) {
    f="kiosk / mini savdo nuqtasi"; mc=40; sc=1; sf=3; rn=2.5; ut=0.5; mk=0.8; ot=0.7; gm=0.24; st="1 kishi: egasi yoki sotuvchi";
  } else if (mablag < 180) {
    f="kichik do'kon"; mc=90; sc=3; sf=10; rn=6; ut=1; mk=2; ot=1.5; gm=0.22; st="3 kishi: 2 sotuvchi, 1 admin";
  } else if (mablag < 400) {
    f="o'rta do'kon"; mc=180; sc=5; sf=18; rn=12; ut=2; mk=4; ot=3; gm=0.20; st="5 kishi: 3 sotuvchi, 1 admin, 1 omborchi";
  } else {
    f="katta do'kon / mini market"; mc=350; sc=8; sf=30; rn=20; ut=4; mk=7; ot=5; gm=0.18; st="8 kishi: sotuvchilar, kassir, admin, omborchi";
  }
  const inv=mablag*0.6; const rv=yax(inv*1.8); const rm=yax(rv*(1-gm)); const tx=yax(rv*0.04);
  return paket("savdo",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,25,24,mablag);
}

function xizmatHisob(mablag) {
  let f, mc, sc, sf, rn, ut, mk, ot, rv, mRate, st;
  if (mablag < 50) {
    f="mikro xizmat nuqtasi"; mc=25; sc=2; sf=6; rn=3; ut=0.7; mk=1.2; ot=1; mRate=0.08;
    rv=yax(10+mablag*0.18); st="2 kishi: egasi + 1 yordamchi";
  } else if (mablag < 150) {
    f="kichik salon / servis markazi"; mc=60; sc=4; sf=14; rn=7; ut=1.2; mk=2.5; ot=1.8; mRate=0.10;
    rv=yax(20+(mablag-50)*0.2); st="4 kishi: 2 mutaxassis, 1 admin, 1 yordamchi";
  } else {
    f="xizmat markazi"; mc=140; sc=7; sf=28; rn=12; ut=2.5; mk=4; ot=3; mRate=0.12;
    rv=yax(40+(mablag-150)*0.15); st="7 kishi: mutaxassislar, admin, sotuv bo'limi";
  }
  const rm=yax(rv*mRate); const tx=yax(rv*0.04);
  return paket("xizmat",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,24,24,mablag);
}

function itHisob(mablag) {
  let f, mc, sc, sf, rn, ut, mk, ot, rv, st;
  if (mablag < 80) {
    f="mikro IT studiya"; mc=30; sc=2; sf=14; rn=2.5; ut=0.6; mk=1.5; ot=1.4;
    rv=yax(16+mablag*0.3); st="2 kishi: dasturchi + dizayner yoki sotuv";
  } else if (mablag < 250) {
    f="kichik IT kompaniya"; mc=100; sc=5; sf=40; rn=6; ut=1; mk=3; ot=2.5;
    rv=yax(45+(mablag-80)*0.25); st="5 kishi: dasturchilar, dizayner, loyiha boshqaruvchisi, sotuv";
  } else {
    f="o'rta IT kompaniya"; mc=220; sc=8; sf=75; rn=10; ut=1.5; mk=7; ot=5;
    rv=yax(90+(mablag-250)*0.18); st="8 kishi: dasturlash, mahsulot, sotuv, qo'llab-quvvatlash jamoasi";
  }
  const rm=0; const tx=yax(rv*0.01);
  return paket("it",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,23,24,mablag);
}

function talimHisob(mablag) {
  let f, mc, sc, sf, rn, ut, mk, ot, rv, st;
  if (mablag < 70) {
    f="mini o'quv markaz"; mc=35; sc=2; sf=8; rn=4; ut=0.8; mk=1.5; ot=1.2;
    rv=yax(12+mablag*0.18); st="2 kishi: 1 o'qituvchi, 1 admin";
  } else {
    f="o'rta o'quv markaz"; mc=90; sc=5; sf=18; rn=8; ut=1.5; mk=3; ot=2;
    rv=yax(25+(mablag-70)*0.15); st="5 kishi: o'qituvchilar, admin, sotuv bo'limi";
  }
  const rm=yax(rv*0.05); const tx=yax(rv*0.04);
  return paket("talim",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,24,24,mablag);
}

function dehqonHisob(mablag) {
  const k=mablag<150;
  const f=k?"kichik dehqonchilik loyihasi":"o'rta dehqonchilik loyihasi"; const mc=k?80:180;
  const sc=k?3:6; const sf=k?9:18; const rn=k?3:6; const ut=k?1:2; const mk=k?1:2; const ot=k?2:4;
  const rm=k?12:30; const rv=yax(k?16+mablag*0.18:35+mablag*0.15); const tx=yax(rv*0.03);
  const st=k?"3 kishi: dehqon, 2 yordamchi":"6 kishi: ishlab chiqarish va yetkazish jamoasi";
  return paket("dehqonchilik",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,22,36,mablag);
}

function ishchiqHisob(mablag) {
  const k=mablag<300;
  const f=k?"mini ishlab chiqarish sexi":"o'rta ishlab chiqarish"; const mc=k?180:350;
  const sc=k?5:10; const sf=k?18:40; const rn=k?8:18; const ut=k?4:8; const mk=k?2:5; const ot=k?4:8;
  const rm=yax(k?18+mablag*0.12:35+mablag*0.15); const rv=yax(k?28+mablag*0.18:70+mablag*0.15);
  const tx=yax(rv*0.04); const st=k?"5 kishi: ustalar va yordamchilar":"10 kishi: sex ishchilari, texnolog, admin";
  return paket("ishlab_chiqarish",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,26,36,mablag);
}

function turizmHisob(mablag) {
  const k=mablag<200;
  const f=k?"kichik turizm xizmati":"o'rta turizm kompaniyasi"; const mc=k?50:200;
  const sc=k?2:6; const sf=k?8:22; const rn=k?3:10; const ut=k?0.5:2; const mk=k?2:6; const ot=k?1.5:4;
  const rm=0; const rv=yax(k?12+mablag*0.18:38+mablag*0.14); const tx=yax(rv*0.04);
  const st=k?"2 kishi: gid + boshqaruvchi":"6 kishi: gidlar, boshqaruvchi, sotuv, admin";
  return paket("turizm",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,24,24,mablag);
}

function tibbiyotHisob(mablag) {
  const k=mablag<300;
  const f=k?"kichik tibbiy kabinet":"klinika / tibbiy markaz"; const mc=k?150:400;
  const sc=k?3:8; const sf=k?18:50; const rn=k?8:20; const ut=k?2:5; const mk=k?2:6; const ot=k?3:8;
  const rm=yax(k?4+mablag*0.03:12+mablag*0.025); const rv=yax(k?22+mablag*0.15:65+mablag*0.12);
  const tx=yax(rv*0.04); const st=k?"3 kishi: shifokor, hamshira, admin":"8 kishi: shifokorlar, hamshiralar, admin";
  return paket("tibbiyot",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,25,36,mablag);
}

function transportHisob(mablag) {
  const k=mablag<200;
  const f=k?"kichik yuk tashish / kuryer xizmati":"o'rta logistika kompaniyasi"; const mc=k?80:250;
  const sc=k?2:6; const sf=k?8:24; const rn=k?2:8; const ut=k?1:3; const mk=k?1.5:4; const ot=k?4:12;
  const rm=0; const rv=yax(k?14+mablag*0.15:45+mablag*0.12); const tx=yax(rv*0.04);
  const st=k?"2 kishi: haydovchi + boshqaruvchi":"6 kishi: haydovchilar, dispetcher, admin";
  return paket("transport",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,25,36,mablag);
}

function qurilishHisob(mablag) {
  const k=mablag<300;
  const f=k?"kichik qurilish brigadasi":"o'rta qurilish kompaniyasi"; const mc=k?100:350;
  const sc=k?4:10; const sf=k?14:38; const rn=k?3:10; const ut=k?1:3; const mk=k?1.5:4; const ot=k?5:12;
  const rm=yax(k?12+mablag*0.12:30+mablag*0.14); const rv=yax(k?22+mablag*0.16:60+mablag*0.13);
  const tx=yax(rv*0.04); const st=k?"4 kishi: ustalar va yordamchilar":"10 kishi: ustalar, boshqaruvchi, admin";
  return paket("qurilish",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,26,36,mablag);
}

function umumiyHisob(mablag) {
  const k=mablag<100; const o=mablag<300;
  const f=k?"kichik biznes":o?"o'rta biznes":"kengaytirilgan loyiha"; const mc=k?50:150;
  const sc=k?2:o?5:8; const sf=k?7:o?18:32; const rn=k?4:o?10:18;
  const ut=k?1:o?2:4; const mk=k?1.5:o?4:7; const ot=k?1.5:o?3:5;
  const rm=k?8:o?20:38; const rv=yax(k?15+mablag*0.18:o?35+mablag*0.15:70+mablag*0.12);
  const tx=yax(rv*0.04); const st=`${sc} kishi: loyiha formatiga mos jamoa`;
  return paket("umumiy",f,mc,sc,st,sf,rn,ut,mk,rm,tx,ot,rv,25,24,mablag);
}

function paket(tur, format, minMablag, xodimSon, xodimMatn, sf, rn, ut, mk, rm, tx, ot, rv, foiz, muddat, mablag) {
  const xarajat=yax(sf+rn+ut+mk+ot+rm+tx);
  const foyda=yax(rv-xarajat);
  const qoplash=foyda>0?yuqori(mablag/foyda):0;
  const qaytish=foyda>0?butun((foyda*12/mablag)*100):0;
  const kerak=mablag<minMablag;
  const kreditMiqdor=kerak?butun((minMablag-mablag)*1.15/5)*5:0;
  const oylikTolov=kerak?yax(annuitetHisob(kreditMiqdor,foiz,muddat)):0;

  return {
    tur, format, minMablag, xodimMatn,
    moliya: {
      xodimlar_soni:xodimSon, maosh_fondi:yax(sf), ijara:yax(rn), kommunal:yax(ut),
      reklama:yax(mk), xomashyo:yax(rm), soliq:yax(tx), boshqa_xarajatlar:yax(ot),
      oylik_xarajat:yax(xarajat), oylik_tushum:yax(rv), oylik_foyda:yax(foyda),
      qoplash_muddati:qoplash, yillik_qaytish:qaytish
    },
    kredit: {
      kerak, miqdor:kreditMiqdor, foiz_stavka:kerak?foiz:0,
      muddat_oy:kerak?muddat:0, oylik_tolov:oylikTolov,
      izoh: kerak
        ? `Joriy mablag' ${format} uchun yetarli emas. Kamida ${minMablag} mln so'm kerak.`
        : `Joriy mablag' ${format} formatida boshlash uchun yetarli.`
    }
  };
}

function annuitetHisob(asosiy, yillikFoiz, oylar) {
  const oylik=yillikFoiz/100/12;
  if(oylik===0) return asosiy/oylar;
  return asosiy*(oylik/(1-Math.pow(1+oylik,-oylar)));
}

async function groqSorovi(env, ctx) {
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY topilmadi");

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
8. Davlat qo'llab-quvvatlashi haqida faqat UMUMIY yoz.
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
- O'zini qoplash muddati: ${ctx.moliya.moliya.qoplash_muddati} oy
- Yillik qaytish: ${ctx.moliya.moliya.yillik_qaytish}%
- Kredit: ${ctx.moliya.kredit.kerak ? ctx.moliya.kredit.miqdor + ' mln, ' + ctx.moliya.kredit.foiz_stavka + '%' : "kerak emas"}

VAZIFA:
1. ai_tahlil: 3-5 gap CHUQUR xulosa.
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
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.GEMINI_API_KEY}` },
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

function zaxiraTahlil(name, sector, moliya, biznes) {
  const foyda=moliya.moliya.oylik_foyda;
  const qoplash=moliya.moliya.qoplash_muddati;
  const tushum=moliya.moliya.oylik_tushum;

  return {
    baho: foyda>0?(qoplash<=12?68:55):35,
    yakuniy_baho: foyda>0?(qoplash<=12?"ISTIQBOLLI":"EHTIYOTKOR"):"XAVFLI",
    ai_tahlil: `${name} loyihasi ${sector} sohasida ${moliya.format} formatida baholandi. ${foyda>0?'Hozirgi formatda oylik foyda ijobiy ko\'rinadi, lekin dastlabki oylarda barqaror mijoz oqimini shakllantirish muhim.':'Joriy mablag\' va formatda oylik foyda salbiy. Format yoki mablag\'ni qayta ko\'rib chiqish kerak.'}`,
    bozor_talabi: biznes.talabAsosi,
    raqobat: biznes.raqobatAsosi,
    foyda_imkoniyati: foyda>0?chegarala(40+butun((foyda/Math.max(1,tushum))*100),30,80):25,
    xavf_darajasi: foyda>0?(moliya.kredit.kerak?58:42):78,
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
    xulosa: foyda>0
      ? `${moliya.format} sifatida boshlash mumkin, lekin dastlabki oylarda xarajatlarni qat'iy nazorat qilish muhim.`
      : `Joriy formatda loyiha xavfli — format yoki mablag'ni qayta ko'rib chiqish kerak.`
  };
}

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

  const kuchliTomonlar = birlashtir(ai.kuchli_tomonlar, zaxira.kuchli_tomonlar, 3);
  const zaifTomonlar = birlashtir(ai.zaif_tomonlar, zaxira.zaif_tomonlar, 3);
  const xavflar = birlashtir(ai.xavflar, zaxira.xavflar, 3);
  const imkoniyatlar = birlashtir(ai.imkoniyatlar, zaxira.imkoniyatlar, 3);
  const tavsiyalar = birlashtir(ai.tavsiyalar, zaxira.tavsiyalar, 5);
  const davlatYordami = birlashtir(ai.davlat_yordami, moliya.kredit.kerak ? biznes.davlatYordami : biznes.davlatYordami.slice(0, 2), 2);

  return {
    // Frontend uchun eski nomlar (moslik)
    name: name,
    sector: sector,
    score: yakunBaho,
    verdict: yakuniyBahoMatn,
    ai_analysis: ai.ai_tahlil || zaxira.ai_tahlil,
    market_demand: yakunTalab,
    competition: yakunRaqobat,
    profitability: yakunFoyda,
    risk_level: yakunXavf,
    estimated_staff: moliya.xodimMatn,
    strengths: kuchliTomonlar,
    weaknesses: zaifTomonlar,
    risks: xavflar,
    opportunities: imkoniyatlar,
    recommendations: tavsiyalar,
    financial: {
      estimated_staff_count: m.xodimlar_soni,
      salary_fund: m.maosh_fondi,
      rent: m.ijara,
      utilities: m.kommunal,
      marketing: m.reklama,
      raw_materials: m.xomashyo,
      tax_monthly: m.soliq,
      other_expenses: m.boshqa_xarajatlar,
      monthly_expenses: m.oylik_xarajat,
      monthly_revenue: m.oylik_tushum,
      monthly_profit: m.oylik_foyda,
      break_even_months: m.qoplash_muddati,
      roi_percent: m.yillik_qaytish
    },
    credit: {
      needed: moliya.kredit.kerak,
      amount: moliya.kredit.miqdor,
      rate: moliya.kredit.foiz_stavka,
      term_months: moliya.kredit.muddat_oy,
      monthly_payment: moliya.kredit.oylik_tolov,
      reason: moliya.kredit.izoh
    },
    gov_support: davlatYordami,
    summary: ai.xulosa || zaxira.xulosa,
    format: moliya.format,
    recommended_min_capital: moliya.minMablag,
    usd_rate: dollarKurs,
    data_date: bugun(),

    // O'zbekcha nomlar (kelajak uchun)
    nomi: name,
    soha: sector,
    umumiy_baho: yakunBaho,
    yakuniy_baho: yakuniyBahoMatn,
    ai_tahlil: ai.ai_tahlil || zaxira.ai_tahlil,
    bozor_talabi: yakunTalab,
    raqobat_darajasi: yakunRaqobat,
    foyda_imkoniyati: yakunFoyda,
    xavf_darajasi: yakunXavf,
    taxminiy_jamoa: moliya.xodimMatn,
    kuchli_tomonlar: kuchliTomonlar,
    zaif_tomonlar: zaifTomonlar,
    xavflar: xavflar,
    imkoniyatlar: imkoniyatlar,
    tavsiyalar: tavsiyalar,
    moliya: m,
    kredit_malumot: moliya.kredit,
    davlat_yordami: davlatYordami,
    xulosa: ai.xulosa || zaxira.xulosa,
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
