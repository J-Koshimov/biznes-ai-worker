export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    // Browserda ochib test qilish uchun
    if (request.method === "GET") {
      return new Response(JSON.stringify({
        ok: true,
        message: "BiznesAI Worker ishlayapti",
        has_key: !!env.GEMINI_API_KEY,
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
        return new Response(JSON.stringify({
          error: true,
          message: "Majburiy maydonlar to'ldirilmagan"
        }), {
          status: 400,
          headers: cors()
        });
      }

      const YEAR = new Date().getFullYear();
      const TODAY = new Date().toISOString().slice(0, 10);

      let usdRate = 12900;
      try {
        const r = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/");
        const data = await r.json();
        const usd = data.find(x => x.Ccy === "USD");
        if (usd) usdRate = parseFloat(usd.Rate);
      } catch (e) {
        console.log("CBU kursini olishda xatolik, fallback ishlatildi");
      }

      const prompt = `
Sen O'zbekiston tadbirkorlari uchun professional biznes maslahatchi AIsan.

SENING VAZIFANG:
Foydalanuvchi biznes g'oyasini yuboradi. Sen uni O'zbekiston bozori uchun real va professional tarzda tahlil qilasan.

KONTEKST:
- Yil: ${YEAR}
- Sana: ${TODAY}
- Dollar kursi: ${usdRate} so'm
- Mamlakat: O'zbekiston
- Tahlil uslubi: professional, realistik, tadbirkor uchun foydali
- Barcha moliyaviy raqamlar: million so'mda

FOYDALANUVCHI MA'LUMOTLARI:
- Biznes nomi: ${name}
- Soha: ${sector}
- G'oya tavsifi: ${desc}
- Boshlang'ich kapital: ${capital} mln so'm

TAHLIL QIL:
1. Umumiy baho (0-100)
2. Bozor talabi
3. Raqobat darajasi
4. Foyda imkoniyati
5. Risk darajasi
6. AI ning 3-4 gaplik chuqur xulosasi
7. G'oya uchun kerak bo'ladigan taxminiy jamoa
8. Kuchli tomonlar
9. Zaif tomonlar
10. Risklar
11. Imkoniyatlar
12. 5 qadamli yo'l xaritasi
13. Moliyaviy prognoz
14. Kredit kerakmi-yo'qmi
15. Davlat qo'llab-quvvatlash imkoniyatlari
16. Juda qisqa yakuniy xulosa

MUHIM:
- Faqat VALID JSON qaytar
- Hech qanday izoh yozma
- Hech qanday markdown yozma
- Hech qanday \`\`\`json yozma
- Financial maydonlarida raqamlar bo'lsin
- estimated_staff matn bo'lsin
- gov_support massiv bo'lsin

JSON SCHEMA:
{
  "score": 0,
  "verdict": "",
  "ai_analysis": "",
  "market_demand": 0,
  "competition": 0,
  "profitability": 0,
  "risk_level": 0,
  "estimated_staff": "",
  "strengths": [],
  "weaknesses": [],
  "risks": [],
  "opportunities": [],
  "recommendations": [],
  "financial": {
    "estimated_staff_count": 0,
    "salary_fund": 0,
    "rent": 0,
    "utilities": 0,
    "marketing": 0,
    "raw_materials": 0,
    "tax_monthly": 0,
    "other_expenses": 0,
    "monthly_expenses": 0,
    "monthly_revenue": 0,
    "monthly_profit": 0,
    "break_even_months": 0,
    "roi_percent": 0
  },
  "credit": {
    "needed": false,
    "amount": 0,
    "rate": 0,
    "term_months": 0,
    "monthly_payment": 0,
    "reason": ""
  },
  "gov_support": [],
  "summary": ""
}
`;

      const apiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 3500,
              responseMimeType: "application/json"
            }
          })
        }
      );

      const apiData = await apiRes.json();

      if (!apiRes.ok) {
        return new Response(JSON.stringify({
          error: true,
          message: apiData?.error?.message || "Gemini API xatolik qaytardi",
          details: apiData
        }), {
          status: 500,
          headers: cors()
        });
      }

      let text = apiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!text) {
        return new Response(JSON.stringify({
          error: true,
          message: "AI bo'sh javob qaytardi",
          details: apiData
        }), {
          status: 500,
          headers: cors()
        });
      }

      text = text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      let parsed;

      try {
        parsed = JSON.parse(text);
      } catch (e1) {
        try {
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) throw new Error("JSON topilmadi");
          parsed = JSON.parse(match[0]);
        } catch (e2) {
          return new Response(JSON.stringify({
            error: true,
            message: "AI javobini parse qilib bo'lmadi",
            raw: text
          }), {
            status: 500,
            headers: cors()
          });
        }
      }

      parsed.usd_rate = usdRate;
      parsed.data_date = TODAY;

      return new Response(JSON.stringify(parsed), {
        headers: cors()
      });

    } catch (err) {
      return new Response(JSON.stringify({
        error: true,
        message: err.message
      }), {
        status: 500,
        headers: cors()
      });
    }
  }
};

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
        }
