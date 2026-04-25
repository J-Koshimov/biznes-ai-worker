   export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (request.method === "GET") {
      return new Response(JSON.stringify({
        ok: true,
        message: "BiznesAI Worker ishlayapti",
        has_groq_key: !!env.GEMINI_API_KEY,
        date: new Date().toISOString().slice(0, 10)
      }, null, 2), {
        headers: cors()
      });
    }

    if (request.method !== "POST") {
      return new Response("POST only", { status: 405, headers: cors() });
    }

    try {
      const body = await request.json();
      const { name, sector, desc, capital } = body;

      if (!name || !sector || !desc || !capital) {
        return json({ error: true, message: "Majburiy maydonlar to'ldirilmagan" }, 400);
      }

      const YEAR = new Date().getFullYear();
      const TODAY = new Date().toISOString().slice(0, 10);

      let usdRate = 12900;
      try {
        const r = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/");
        const data = await r.json();
        const usd = data.find(x => x.Ccy === "USD");
        if (usd) usdRate = parseFloat(usd.Rate);
      } catch (e) {}

      const business = detectBusinessType(sector, desc);
      const financePack = calculateFinancials(business, Number(capital));
      const fallback = fallbackAnalysis(name, sector, desc, financePack, business);

      let ai = null;
      try {
        ai = await getGroqAnalysis(env, {
          name, sector, desc, capital, usdRate, YEAR, TODAY, business, financePack
        });
      } catch (e) {
        ai = null;
      }

      const merged = mergeAnalysis({
        name, sector, desc, capital: Number(capital),
        usdRate, TODAY, business, financePack,
        ai: ai || fallback, fallback
      });

      return json(merged);

    } catch (err) {
      return json({ error: true, message: err.message }, 500);
    }
  }
};

async function getGroqAnalysis(env, ctx) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY topilmadi");

  const prompt = `
Sen O'zbekiston tadbirkorlari uchun ishlaydigan professional biznes maslahatchi AIsan.

MUHIM QOIDALAR:
1. FAQAT O'ZBEK LOTIN yozuvida yoz. Kirill yoki boshqa til ishlatma.
2. Real, aniq, professional maslahat ber. Umumiy gaplar yozma.
3. Har bir maslahat O'zbekiston bozori, qonunlari va sharoitiga mos bo'lsin.
4. Moliyaviy raqamlarni biz berdik — sen qayta hisoblab chiqma.
5. Kuchli tomonlar, zaif tomonlar, risklar — barchasi ANIQ va REAL bo'lsin.
6. "Yaxshi g'oya", "Zo'r loyiha" kabi umumiy maqtov yozma. Real holat yoz.
7. Tavsiyalar amaliy bo'lsin — tadbirkor ertaga nima qilishi kerakligini tushunsin.
8. Kredit haqida: O'zbekistonda oddiy biznes krediti 22-28% ekanini hisobga ol. 10-15% kabi noreal oddiy kredit tavsiya qilma. Faqat maxsus dastur bo'lsa past foiz bo'lishi mumkin.
9. Davlat qo'llab-quvvatlashi haqida yozsang — O'zbekistonda real mavjud dastur va imtiyozlarni yoz.
10. Har bir javob FAQAT shu loyihaga tegishli bo'lsin — shablon javob berma.
11. Aniq joy nomlari (masalan: Chilonzor, Sergeli) yozma — foydalanuvchi o'zi biladi qayerda ishlashini.
12. O'zbekiston bozori kontekstida maslahat ber.

FOYDALANUVCHI MA'LUMOTLARI:
- Biznes nomi: ${ctx.name}
- Soha: ${ctx.sector}
- G'oya tavsifi: ${ctx.desc}
- Kapital: ${ctx.capital} mln so'm
- Dollar kursi: ${ctx.usdRate} so'm
- Sana: ${ctx.TODAY}

SYSTEM ANIQLAGAN BIZNES FORMATI:
- Format: ${ctx.financePack.format}
- Minimal kapital: ${ctx.financePack.minCapital} mln so'm
- Oylik tushum: ${ctx.financePack.financial.monthly_revenue} mln so'm
- Oylik xarajat: ${ctx.financePack.financial.monthly_expenses} mln so'm
- Oylik foyda: ${ctx.financePack.financial.monthly_profit} mln so'm
- Qaytarilish: ${ctx.financePack.financial.break_even_months} oy
- ROI: ${ctx.financePack.financial.roi_percent}%
- Kredit: ${ctx.financePack.credit.needed ? ctx.financePack.credit.amount + ' mln, ' + ctx.financePack.credit.rate + '%' : "kerak emas"}

VAZIFANG:
1. ai_analysis: 3-5 gapda CHUQUR xulosa yoz. Nega ishlaydi yoki ishlamaydi — real sabablarini yoz.
2. strengths: 3-4 ta ANIQ kuchli tomon yoz. Real bozor faktlari asosida.
3. weaknesses: 3-4 ta ANIQ zaif tomon yoz. Real muammolar asosida.
4. risks: 3-4 ta ANIQ risk yoz. Har biri real va ehtimoliy bo'lsin.
5. opportunities: 3-4 ta ANIQ imkoniyat yoz. O'zbekiston kontekstida.
6. recommendations: 5 ta AMALIY qadam yoz. Har biri "ertaga nima qilish kerak" darajasida.
7. gov_support: O'zbekistonda real mavjud davlat dasturlari va imtiyozlarni yoz.
8. summary: 1-2 gapda eng muhim xulosa.
9. verdict: ISTIQBOLLI yoki EHTIYOTKOR yoki XAVFLI

FAQAT toza JSON qaytar.
Markdown yozma. Izoh yozma. Kirill yozma. Faqat o'zbek lotin.

Schema:
{
  "score": 0,
  "verdict": "",
  "ai_analysis": "",
  "market_demand": 0,
  "competition": 0,
  "profitability": 0,
  "risk_level": 0,
  "strengths": [],
  "weaknesses": [],
  "risks": [],
  "opportunities": [],
  "recommendations": [],
  "gov_support": [],
  "summary": ""
}
`;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
        { role: "system", content: "Sen faqat valid JSON qaytaradigan, faqat o'zbek lotin yozuvida javob beradigan professional biznes tahlilchi AIsan. Kirill yoki boshqa til ishlatma." },
        { role: "user", content: prompt }
      ]
    })
  });

  const groqData = await groqRes.json();
  if (!groqRes.ok) throw new Error(groqData?.error?.message || "Groq API xatolik");

  let text = groqData?.choices?.[0]?.message?.content || "";
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(text);
  } catch (e1) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSON topilmadi");
    return JSON.parse(match[0]);
  }
}

function detectBusinessType(sector, desc) {
  const text = `${sector} ${desc}`.toLowerCase();

  if (/kafe|cafe|coffee|fast food|fastfood|lavash|burger|pizza|shaurma|shawarma|oshxona|non|bakery|qahva|restoran|restaurant|choyxona/.test(text))
    return { type: "cafe", demandBase: 68, competitionBase: 72, support: ["Yosh tadbirkorlar uchun imtiyozli kredit dasturlari (7-14%)", "Oziq-ovqat ishlab chiqaruvchilar uchun soliq imtiyozlari"] };

  if (/do'kon|dokon|magazin|shop|market|retail|savdo|kiyim|aksesuar|telefon|mini market|supermarket|butik/.test(text) || sector === "Savdo")
    return { type: "retail", demandBase: 64, competitionBase: 70, support: ["Savdo uchun mikroqarz dasturlari", "Mahalliy ishlab chiqaruvchilarni qo'llab-quvvatlash dasturi"] };

  if (/salon|barber|sartarosh|beauty|service|servis|remont|repair|konsultatsiya|consulting|cleaning|yuvish|studia|studio|avto yuvish|himchistka/.test(text) || sector === "Xizmatlar")
    return { type: "service", demandBase: 62, competitionBase: 55, support: ["Xizmat ko'rsatish sohasi uchun mikrokredit imkoniyatlari", "Kasb-hunar o'rgatish markazlari bilan hamkorlik"] };

  if (/app|platforma|ilova|sayt|website|crm|saas|telegram bot|ai|sun'iy intellekt|dastur|software|it|startup/.test(text) || sector === "IT / Texnologiyalar")
    return { type: "it", demandBase: 72, competitionBase: 52, support: ["IT Park rezidentligi — 1% yagona soliq (2028 yilgacha)", "Eksport xizmatlari uchun QQS imtiyozlari", "Startup fondlar va grant dasturlari"] };

  if (/kurs|ta'lim|o'quv markaz|education|training|ustoz|repetitor|coaching|mentoring/.test(text) || sector === "Ta'lim")
    return { type: "education", demandBase: 61, competitionBase: 58, support: ["Ta'lim sohasida litsenziya olish imtiyozlari", "Online ta'lim platformalari uchun grant dasturlari"] };

  if (/ferma|issiqxona|parranda|chorva|dehqon|agro|greenhouse|bog'|sabzavot|meva/.test(text) || sector === "Qishloq xo'jaligi")
    return { type: "agri", demandBase: 58, competitionBase: 42, support: ["Qishloq xo'jaligi uchun subsidiyalar va imtiyozli kreditlar", "Agro texnologiyalar uchun davlat dasturlari", "Eksport qo'llab-quvvatlash fondi"] };

  if (/sex|fabrika|ishlab chiqarish|tikuv|mebel|production|manufacturing|plastik|qog'oz|paket/.test(text) || sector === "Ishlab chiqarish")
    return { type: "manufacturing", demandBase: 57, competitionBase: 48, support: ["Import o'rnini bosuvchi loyihalar uchun soliq imtiyozlari", "Uskunalar uchun lizing dasturlari", "Erkin iqtisodiy zonalarda imtiyozlar"] };

  if (/mehmonxona|hotel|hostel|turizm|sayohat|travel|gid|guide/.test(text) || sector === "Turizm")
    return { type: "tourism", demandBase: 65, competitionBase: 50, support: ["Turizm infratuzilmasini rivojlantirish dasturi", "Mehmonxona qurilishi uchun soliq imtiyozlari"] };

  if (/klinika|stomatolog|apteka|laboratoriya|tibbiy|medical|farmatsevtika/.test(text) || sector === "Tibbiyot")
    return { type: "medical", demandBase: 70, competitionBase: 45, support: ["Tibbiyot sohasida litsenziya va sertifikatsiya yordam dasturlari", "Xususiy klinikalar uchun soliq imtiyozlari"] };

  if (/yuk tashish|logistika|kuryer|dostavka|taksi|avto|transport/.test(text) || sector === "Transport")
    return { type: "transport", demandBase: 63, competitionBase: 60, support: ["Transport vositalari uchun lizing dasturlari", "Logistika markazlari uchun yer ajratish dasturlari"] };

  return { type: "general", demandBase: 58, competitionBase: 55, support: ["Tadbirkorlik subyektlari uchun umumiy soliq imtiyozlari", "Mikrokredit va kichik biznes qo'llab-quvvatlash dasturlari"] };
}

function calculateFinancials(business, capital) {
  switch (business.type) {
    case "cafe": return calcCafe(capital);
    case "retail": return calcRetail(capital);
    case "service": return calcService(capital);
    case "it": return calcIT(capital);
    case "education": return calcEducation(capital);
    case "agri": return calcAgri(capital);
    case "manufacturing": return calcManufacturing(capital);
    case "tourism": return calcTourism(capital);
    case "medical": return calcMedical(capital);
    case "transport": return calcTransport(capital);
    default: return calcGeneral(capital);
  }
}

function calcCafe(capital) {
  let format, minCapital, staffCount, salaryFund, rent, utilities, marketing, other, taxRate, rawRate, staffText, revenueBase;

  if (capital < 60) {
    format = "mini coffee point / takeaway";
    minCapital = 35; revenueBase = 25 + capital * 0.25; staffCount = 2; salaryFund = 7;
    rent = 4 + capital * 0.03; utilities = 1; marketing = 1.5; other = 1.2; taxRate = 0.04; rawRate = 0.35;
    staffText = "2 kishi: 1 barista, 1 yordamchi";
  } else if (capital < 150) {
    format = "kichik kafe / fastfood nuqta";
    minCapital = 70; revenueBase = 40 + (capital - 60) * 0.35; staffCount = 4; salaryFund = 14;
    rent = 7 + (capital - 60) * 0.04; utilities = 1.5; marketing = 3; other = 2; taxRate = 0.045; rawRate = 0.36;
    staffText = "4 kishi: 1 oshpaz, 1 yordamchi, 2 sotuvchi";
  } else if (capital < 350) {
    format = "standart kafe";
    minCapital = 180; revenueBase = 80 + (capital - 150) * 0.25; staffCount = 7; salaryFund = 25;
    rent = 14 + (capital - 150) * 0.03; utilities = 3; marketing = 5; other = 4; taxRate = 0.05; rawRate = 0.37;
    staffText = "7 kishi: 2 oshpaz, 2 ofitsiant, 1 kassir, 1 admin, 1 yordamchi";
  } else {
    format = "to'liq kafe / restoran";
    minCapital = 350; revenueBase = 150 + (capital - 350) * 0.15; staffCount = 12; salaryFund = 45;
    rent = 22 + (capital - 350) * 0.02; utilities = 6; marketing = 9; other = 7; taxRate = 0.06; rawRate = 0.38;
    staffText = "12 kishi: oshxona jamoasi, zal xodimlari, admin va kassirlar";
  }

  const monthlyRevenue = round(revenueBase);
  const rawMaterials = round(monthlyRevenue * rawRate);
  const taxMonthly = round(monthlyRevenue * taxRate);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + rawMaterials + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);

  return packageFinance({ type: "cafe", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 24, term: 24, capital });
}

function calcRetail(capital) {
  let format, minCapital, staffCount, salaryFund, rent, utilities, marketing, other, grossMargin, staffText;

  if (capital < 70) {
    format = "kiosk / mini savdo nuqtasi"; minCapital = 40; staffCount = 1; salaryFund = 3; rent = 2.5;
    utilities = 0.5; marketing = 0.8; other = 0.7; grossMargin = 0.24;
    staffText = "1 kishi: egasi yoki 1 sotuvchi";
  } else if (capital < 180) {
    format = "kichik do'kon"; minCapital = 90; staffCount = 3; salaryFund = 10; rent = 6;
    utilities = 1; marketing = 2; other = 1.5; grossMargin = 0.22;
    staffText = "3 kishi: 2 sotuvchi, 1 admin";
  } else if (capital < 400) {
    format = "o'rta do'kon"; minCapital = 180; staffCount = 5; salaryFund = 18; rent = 12;
    utilities = 2; marketing = 4; other = 3; grossMargin = 0.20;
    staffText = "5 kishi: 3 sotuvchi, 1 admin, 1 omborchi";
  } else {
    format = "katta do'kon / mini market"; minCapital = 350; staffCount = 8; salaryFund = 30; rent = 20;
    utilities = 4; marketing = 7; other = 5; grossMargin = 0.18;
    staffText = "8 kishi: sotuvchilar, kassir, admin, omborchi";
  }

  const inventory = capital * 0.6;
  const monthlyRevenue = round(inventory * 2);
  const rawMaterials = round(monthlyRevenue * (1 - grossMargin));
  const taxMonthly = round(monthlyRevenue * 0.04);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + rawMaterials + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);

  return packageFinance({ type: "retail", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 25, term: 24, capital });
}

function calcService(capital) {
  let format, minCapital, staffCount, salaryFund, rent, utilities, marketing, other, revenueBase, materialRate, staffText;

  if (capital < 50) {
    format = "mikro xizmat nuqtasi"; minCapital = 25; revenueBase = 12 + capital * 0.3; staffCount = 2; salaryFund = 6;
    rent = 3; utilities = 0.7; marketing = 1.2; other = 1; materialRate = 0.08;
    staffText = "2 kishi: egasi + 1 yordamchi";
  } else if (capital < 150) {
    format = "kichik salon / servis"; minCapital = 60; revenueBase = 25 + (capital - 50) * 0.35; staffCount = 4; salaryFund = 14;
    rent = 7; utilities = 1.2; marketing = 2.5; other = 1.8; materialRate = 0.10;
    staffText = "4 kishi: 2 mutaxassis, 1 admin, 1 yordamchi";
  } else {
    format = "xizmat markazi"; minCapital = 140; revenueBase = 55 + (capital - 150) * 0.25; staffCount = 7; salaryFund = 28;
    rent = 12; utilities = 2.5; marketing = 4; other = 3; materialRate = 0.12;
    staffText = "7 kishi: mutaxassislar, admin, sotuv";
  }

  const monthlyRevenue = round(revenueBase);
  const rawMaterials = round(monthlyRevenue * materialRate);
  const taxMonthly = round(monthlyRevenue * 0.04);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + rawMaterials + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);

  return packageFinance({ type: "service", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 24, term: 24, capital });
}

function calcIT(capital) {
  let format, minCapital, staffCount, salaryFund, rent, utilities, marketing, other, revenueBase, staffText;

  if (capital < 80) {
    format = "mikro IT studio"; minCapital = 30; revenueBase = 20 + capital * 0.45; staffCount = 2; salaryFund = 14;
    rent = 2.5; utilities = 0.6; marketing = 1.5; other = 1.4;
    staffText = "2 kishi: developer + designer yoki sotuv";
  } else if (capital < 250) {
    format = "kichik IT kompaniya"; minCapital = 100; revenueBase = 60 + (capital - 80) * 0.35; staffCount = 5; salaryFund = 40;
    rent = 6; utilities = 1; marketing = 3; other = 2.5;
    staffText = "5 kishi: developerlar, designer, PM, sales";
  } else {
    format = "o'rta IT kompaniya / SaaS"; minCapital = 220; revenueBase = 120 + (capital - 250) * 0.25; staffCount = 8; salaryFund = 75;
    rent = 10; utilities = 1.5; marketing = 7; other = 5;
    staffText = "8 kishi: development, product, sales, support";
  }

  const monthlyRevenue = round(revenueBase);
  const rawMaterials = 0;
  const taxMonthly = round(monthlyRevenue * 0.01);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);

  return packageFinance({ type: "it", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 23, term: 24, capital });
}

function calcEducation(capital) {
  let format, minCapital, staffCount, salaryFund, rent, utilities, marketing, other, revenueBase, staffText;

  if (capital < 70) {
    format = "mini o'quv markaz"; minCapital = 35; revenueBase = 15 + capital * 0.3; staffCount = 2; salaryFund = 8;
    rent = 4; utilities = 0.8; marketing = 1.5; other = 1.2;
    staffText = "2 kishi: 1 o'qituvchi, 1 admin";
  } else {
    format = "o'rta o'quv markaz"; minCapital = 90; revenueBase = 35 + (capital - 70) * 0.25; staffCount = 5; salaryFund = 18;
    rent = 8; utilities = 1.5; marketing = 3; other = 2;
    staffText = "5 kishi: o'qituvchilar, admin, sotuv";
  }

  const monthlyRevenue = round(revenueBase);
  const rawMaterials = round(monthlyRevenue * 0.05);
  const taxMonthly = round(monthlyRevenue * 0.04);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + rawMaterials + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);

  return packageFinance({ type: "education", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 24, term: 24, capital });
}

function calcAgri(capital) {
  const isSmall = capital < 150;
  const format = isSmall ? "kichik agro loyiha" : "o'rta agro loyiha";
  const minCapital = isSmall ? 80 : 180;
  const staffCount = isSmall ? 3 : 6;
  const salaryFund = isSmall ? 9 : 18;
  const rent = isSmall ? 3 : 6;
  const utilities = isSmall ? 1 : 2;
  const marketing = isSmall ? 1 : 2;
  const other = isSmall ? 2 : 4;
  const rawMaterials = isSmall ? 12 : 30;
  const monthlyRevenue = round(isSmall ? 20 + capital * 0.3 : 50 + capital * 0.25);
  const taxMonthly = round(monthlyRevenue * 0.03);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + rawMaterials + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);
  const staffText = isSmall ? "3 kishi: fermer, 2 yordamchi" : "6 kishi: ishlab chiqarish va yetkazish";

  return packageFinance({ type: "agri", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 22, term: 36, capital });
}

function calcManufacturing(capital) {
  const isSmall = capital < 300;
  const format = isSmall ? "mini ishlab chiqarish sexi" : "o'rta ishlab chiqarish";
  const minCapital = isSmall ? 180 : 350;
  const staffCount = isSmall ? 5 : 10;
  const salaryFund = isSmall ? 18 : 40;
  const rent = isSmall ? 8 : 18;
  const utilities = isSmall ? 4 : 8;
  const marketing = isSmall ? 2 : 5;
  const other = isSmall ? 4 : 8;
  const rawMaterials = round(isSmall ? 20 + capital * 0.18 : 40 + capital * 0.22);
  const monthlyRevenue = round(isSmall ? 35 + capital * 0.28 : 90 + capital * 0.24);
  const taxMonthly = round(monthlyRevenue * 0.04);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + rawMaterials + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);
  const staffText = isSmall ? "5 kishi: ustalar va yordamchilar" : "10 kishi: sex, texnolog, admin";

  return packageFinance({ type: "manufacturing", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 26, term: 36, capital });
}

function calcTourism(capital) {
  const isSmall = capital < 200;
  const format = isSmall ? "kichik turizm xizmati / gid" : "o'rta turizm kompaniyasi";
  const minCapital = isSmall ? 50 : 200;
  const staffCount = isSmall ? 2 : 6;
  const salaryFund = isSmall ? 8 : 22;
  const rent = isSmall ? 3 : 10;
  const utilities = isSmall ? 0.5 : 2;
  const marketing = isSmall ? 2 : 6;
  const other = isSmall ? 1.5 : 4;
  const rawMaterials = 0;
  const monthlyRevenue = round(isSmall ? 15 + capital * 0.3 : 50 + capital * 0.2);
  const taxMonthly = round(monthlyRevenue * 0.04);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);
  const staffText = isSmall ? "2 kishi: gid / menejer + yordamchi" : "6 kishi: gidlar, menejer, sotuv, admin";

  return packageFinance({ type: "tourism", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 24, term: 24, capital });
}

function calcMedical(capital) {
  const isSmall = capital < 300;
  const format = isSmall ? "kichik tibbiy xizmat / kabinet" : "klinika / tibbiy markaz";
  const minCapital = isSmall ? 150 : 400;
  const staffCount = isSmall ? 3 : 8;
  const salaryFund = isSmall ? 18 : 50;
  const rent = isSmall ? 8 : 20;
  const utilities = isSmall ? 2 : 5;
  const marketing = isSmall ? 2 : 6;
  const other = isSmall ? 3 : 8;
  const rawMaterials = round(isSmall ? 5 + capital * 0.05 : 15 + capital * 0.04);
  const monthlyRevenue = round(isSmall ? 30 + capital * 0.25 : 80 + capital * 0.2);
  const taxMonthly = round(monthlyRevenue * 0.04);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + rawMaterials + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);
  const staffText = isSmall ? "3 kishi: shifokor, hamshira, admin" : "8 kishi: shifokorlar, hamshiralar, admin, sotuv";

  return packageFinance({ type: "medical", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 25, term: 36, capital });
}

function calcTransport(capital) {
  const isSmall = capital < 200;
  const format = isSmall ? "kichik yuk tashish / kuryer" : "o'rta logistika kompaniyasi";
  const minCapital = isSmall ? 80 : 250;
  const staffCount = isSmall ? 2 : 6;
  const salaryFund = isSmall ? 8 : 24;
  const rent = isSmall ? 2 : 8;
  const utilities = isSmall ? 1 : 3;
  const marketing = isSmall ? 1.5 : 4;
  const other = isSmall ? 5 : 15;
  const rawMaterials = 0;
  const monthlyRevenue = round(isSmall ? 18 + capital * 0.25 : 60 + capital * 0.2);
  const taxMonthly = round(monthlyRevenue * 0.04);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);
  const staffText = isSmall ? "2 kishi: haydovchi + menejer" : "6 kishi: haydovchilar, dispetcher, admin";

  return packageFinance({ type: "transport", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 25, term: 36, capital });
}

function calcGeneral(capital) {
  const isSmall = capital < 100;
  const isMedium = capital < 300;
  const format = isSmall ? "kichik biznes" : isMedium ? "o'rta biznes" : "kengaytirilgan loyiha";
  const minCapital = isSmall ? 50 : 150;
  const staffCount = isSmall ? 2 : isMedium ? 5 : 8;
  const salaryFund = isSmall ? 7 : isMedium ? 18 : 32;
  const rent = isSmall ? 4 : isMedium ? 10 : 18;
  const utilities = isSmall ? 1 : isMedium ? 2 : 4;
  const marketing = isSmall ? 1.5 : isMedium ? 4 : 7;
  const other = isSmall ? 1.5 : isMedium ? 3 : 5;
  const rawMaterials = isSmall ? 8 : isMedium ? 22 : 40;
  const monthlyRevenue = round(isSmall ? 20 + capital * 0.3 : isMedium ? 50 + capital * 0.25 : 100 + capital * 0.2);
  const taxMonthly = round(monthlyRevenue * 0.04);
  const monthlyExpenses = round(salaryFund + rent + utilities + marketing + other + rawMaterials + taxMonthly);
  const monthlyProfit = round(monthlyRevenue - monthlyExpenses);
  const staffText = `${staffCount} kishi: loyiha formatiga mos jamoa`;

  return packageFinance({ type: "general", format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate: 25, term: 24, capital });
}

function packageFinance({ type, format, minCapital, staffCount, staffText, salaryFund, rent, utilities, marketing, rawMaterials, taxMonthly, other, monthlyExpenses, monthlyRevenue, monthlyProfit, rate, term, capital }) {
  const breakEvenMonths = monthlyProfit > 0 ? roundUp(capital / monthlyProfit) : 0;
  const roiPercent = monthlyProfit > 0 ? round((monthlyProfit * 12 / capital) * 100) : 0;
  const needCredit = capital < minCapital;
  const creditAmount = needCredit ? roundTo5((minCapital - capital) * 1.15) : 0;
  const monthlyPayment = needCredit ? round(annuityPayment(creditAmount, rate, term)) : 0;

  return {
    type, format, minCapital, estimatedStaffText: staffText,
    financial: {
      estimated_staff_count: staffCount, salary_fund: round(salaryFund), rent: round(rent),
      utilities: round(utilities), marketing: round(marketing), raw_materials: round(rawMaterials),
      tax_monthly: round(taxMonthly), other_expenses: round(other), monthly_expenses: round(monthlyExpenses),
      monthly_revenue: round(monthlyRevenue), monthly_profit: round(monthlyProfit),
      break_even_months: breakEvenMonths, roi_percent: roiPercent
    },
    credit: {
      needed: needCredit, amount: creditAmount, rate: needCredit ? rate : 0,
      term_months: needCredit ? term : 0, monthly_payment: needCredit ? monthlyPayment : 0,
      reason: needCredit
        ? `Joriy kapital ${format} uchun yetarli emas. Kamida ${minCapital} mln so'm kerak.`
        : `Joriy kapital ${format} formatida boshlash uchun yetarli.`
    }
  };
}

function annuityPayment(principal, annualRate, months) {
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return principal * (r / (1 - Math.pow(1 + r, -months)));
}

function round(n) { return Math.max(0, Math.round(n)); }
function roundUp(n) { return Math.max(0, Math.ceil(n)); }
function roundTo5(n) { return Math.max(0, Math.ceil(n / 5) * 5); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function fallbackAnalysis(name, sector, desc, financePack, business) {
  const profit = financePack.financial.monthly_profit;
  const be = financePack.financial.break_even_months;

  return {
    score: profit > 0 ? (be <= 12 ? 72 : 60) : 38,
    verdict: profit > 0 ? (be <= 12 ? "ISTIQBOLLI" : "EHTIYOTKOR") : "XAVFLI",
    ai_analysis: `${name} loyihasi ${sector} sohasida ${financePack.format} formatida baholandi. Joriy ${financePack.financial.monthly_profit > 0 ? 'holatda oylik foyda ijobiy' : 'holatda oylik foyda salbiy'}. ${financePack.credit.needed ? 'Qo\'shimcha moliyalashtirish kerak bo\'ladi.' : 'Boshlang\'ich kapital yetarli ko\'rinadi.'}`,
    market_demand: business.demandBase,
    competition: business.competitionBase,
    profitability: profit > 0 ? clamp(45 + Math.round((profit / Math.max(1, financePack.financial.monthly_revenue)) * 100), 35, 85) : 30,
    risk_level: profit > 0 ? (financePack.credit.needed ? 55 : 40) : 75,
    strengths: [
      "Kichik formatdan boshlab riskni kamaytirish mumkin",
      "Kapitaldan kelib chiqib bosqichma-bosqich o'sish mumkin",
      "O'zbekiston ichki bozorida talab barqaror"
    ],
    weaknesses: [
      "Boshlang'ich kapital cheklangan bo'lishi mumkin",
      "Dastlabki oylarda mijoz bazasini shakllantirish vaqt talab qiladi",
      "Xarajatlarni noto'g'ri boshqarish foydani keskin kamaytiradi"
    ],
    risks: [
      "Raqobatchilar narxni pasaytirsa, marja qisqaradi",
      "Ijara narxi kutilganidan yuqori bo'lishi mumkin",
      "Aylanma mablag' yetishmasligi kundalik faoliyatga ta'sir qiladi"
    ],
    opportunities: [
      "Online kanallar orqali qo'shimcha savdo va marketing qilish mumkin",
      "Sodiq mijozlar dasturi orqali qayta sotuvni oshirish mumkin",
      "Mahalliy yetkazib beruvchilar bilan hamkorlik xarajatni kamaytiradi"
    ],
    recommendations: [
      `1-qadam: ${financePack.format} formatida aniq biznes modelni tanlang`,
      "2-qadam: Joylashuv va maqsadli auditoriyani oldindan tekshiring",
      "3-qadam: Minimal xarajat bilan ish boshlang va dastlabki natijalarni o'lchang",
      "4-qadam: Ijtimoiy tarmoqlar orqali arzon va samarali reklama qiling",
      "5-qadam: Dastlabki 3-6 oy ichida natijani tahlil qilib keyin kengaytiring"
    ],
    gov_support: business.support || [],
    summary: profit > 0
      ? `${financePack.format} sifatida boshlansa loyiha real ko'rinadi.`
      : `Joriy formatda loyiha xavfli — format yoki kapitalni qayta ko'rib chiqish kerak.`
  };
}

function mergeAnalysis({ name, sector, desc, capital, usdRate, TODAY, business, financePack, ai, fallback }) {
  const f = financePack.financial;
  const profitMargin = f.monthly_revenue > 0 ? (f.monthly_profit / f.monthly_revenue) * 100 : 0;

  const viabilityScore = calcViabilityScore(financePack, capital);
  const aiScore = safeNum(ai.score, fallback.score || 55);
  const finalScore = clamp(Math.round(aiScore * 0.55 + viabilityScore * 0.45), 20, 95);

  const finalMarket = clamp(Math.round(safeNum(ai.market_demand, fallback.market_demand || business.demandBase) * 0.75 + business.demandBase * 0.25), 20, 95);
  const finalCompetition = clamp(Math.round(safeNum(ai.competition, fallback.competition || business.competitionBase) * 0.75 + business.competitionBase * 0.25), 20, 95);

  const profitMetric = clamp(Math.round(20 + profitMargin * 2.5), 15, 95);
  const finalProfitability = clamp(Math.round(safeNum(ai.profitability, fallback.profitability || 50) * 0.55 + profitMetric * 0.45), 10, 95);

  let finalRisk = safeNum(ai.risk_level, fallback.risk_level || 50);
  if (financePack.credit.needed) finalRisk += 10;
  if (f.monthly_profit <= 0) finalRisk += 20;
  if (f.break_even_months > 18) finalRisk += 10;
  finalRisk = clamp(Math.round(finalRisk), 15, 95);

  let verdict = "EHTIYOTKOR";
  if (f.monthly_profit <= 0 || capital < financePack.minCapital * 0.6) verdict = "XAVFLI";
  else if (finalScore >= 75 && f.break_even_months > 0 && f.break_even_months <= 14) verdict = "ISTIQBOLLI";

  return {
    name, sector, score: finalScore, verdict,
    ai_analysis: ai.ai_analysis || fallback.ai_analysis,
    market_demand: finalMarket, competition: finalCompetition,
    profitability: finalProfitability, risk_level: finalRisk,
    estimated_staff: financePack.estimatedStaffText,
    strengths: normalizeArray(ai.strengths, fallback.strengths, 3),
    weaknesses: normalizeArray(ai.weaknesses, fallback.weaknesses, 3),
    risks: normalizeArray(ai.risks, fallback.risks, 3),
    opportunities: normalizeArray(ai.opportunities, fallback.opportunities, 3),
    recommendations: normalizeArray(ai.recommendations, fallback.recommendations, 5),
    financial: f, credit: financePack.credit,
    gov_support: normalizeArray(ai.gov_support, fallback.gov_support, 2),
    summary: ai.summary || fallback.summary,
    format: financePack.format,
    recommended_min_capital: financePack.minCapital,
    usd_rate: usdRate, data_date: TODAY
  };
}

function calcViabilityScore(financePack, capital) {
  const f = financePack.financial;
  if (f.monthly_profit <= 0) return 25;
  let score = 55;
  const margin = f.monthly_revenue > 0 ? (f.monthly_profit / f.monthly_revenue) * 100 : 0;
  if (capital >= financePack.minCapital) score += 10; else score -= 10;
  if (f.break_even_months <= 8) score += 15;
  else if (f.break_even_months <= 14) score += 8;
  else if (f.break_even_months <= 20) score += 2;
  else score -= 10;
  if (margin >= 20) score += 10;
  else if (margin >= 12) score += 5;
  else if (margin < 8) score -= 8;
  return clamp(Math.round(score), 25, 90);
}

function safeNum(v, fallback) { return typeof v === "number" && !isNaN(v) ? v : fallback; }

function normalizeArray(primary, fallback, minItems) {
  const p = Array.isArray(primary) ? primary.filter(Boolean) : [];
  const f = Array.isArray(fallback) ? fallback.filter(Boolean) : [];
  const out = [...p];
  for (const item of f) { if (out.length >= minItems) break; if (!out.includes(item)) out.push(item); }
  return out.slice(0, Math.max(minItems, out.length || minItems));
}

function cors() {
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}
