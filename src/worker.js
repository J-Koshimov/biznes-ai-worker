export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (request.method === "GET") {
      return new Response(JSON.stringify({
        ok: true,
        message: "BiznesAI Worker ishlayapti (Groq)",
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
      } catch (e) {}

      const prompt = `
Sen O'zbekiston tadbirkorlari uchun professional biznes maslahatchi AIsan.

KONTEKST:
- Yil: ${YEAR}
- Sana: ${TODAY}
- Dollar kursi: ${usdRate} so'm
- Mamlakat: O'zbekiston
- Barcha moliyaviy raqamlar: million so'mda

FOYDALANUVCHI MA'LUMOTLARI:
- Biznes nomi: ${name}
- Soha: ${sector}
- G'oya tavsifi: ${desc}
- Boshlang'ich kapital: ${capital} mln so'm

VAZIFA:
1. Umumiy baho ber
2. Bozor talabi, raqobat, foyda, riskni bahola
3. Kerakli jamoani taxmin qil
4. Moliyaviy prognoz tuz
5. Kuchli tomonlar, zaif tomonlar, risklar, imkoniyatlarni yoz
6. 5 qadamli tavsiyalar ber
7. Kredit kerak bo'lsa tavsiya qil
8. Davlat qo'llab-quvvatlash imkoniyatlarini yoz
9. Juda qisqa summary yoz

FAQAT toza JSON qaytar.
Hech qanday markdown yozma.
Hech qanday izoh yozma.

Schema:
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
            {
              role: "system",
              content: "Sen faqat valid JSON qaytaradigan biznes tahlilchi AIsan."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      const groqData = await groqRes.json();

      if (!groqRes.ok) {
        return new Response(JSON.stringify({
          error: true,
          message: groqData?.error?.message || "Groq API xatolik qaytardi",
          details: groqData
        }), {
          status: 500,
          headers: cors()
        });
      }

      let text = groqData?.choices?.[0]?.message?.content || "";

      if (!text) {
        return new Response(JSON.stringify({
          error: true,
          message: "AI bo'sh javob qaytardi",
          details: groqData
        }), {
          status: 500,
          headers: cors()
        });
      }

      text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

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
