export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (request.method !== "POST") {
      return new Response("POST only", { status: 405 });
    }

    try {
      const body = await request.json();
      const { name, sector, desc, capital } = body;

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
Sen O'zbekiston tadbirkorlari uchun professional biznes maslahatchi AI.

Yil: ${YEAR}
Sana: ${TODAY}
Dollar kursi: ${usdRate} so'm

Biznes nomi: ${name}
Soha: ${sector}
Tavsif: ${desc}
Boshlang'ich kapital: ${capital} mln so'm

Vazifa:
- bozor talabi
- raqobat
- foyda imkoniyati
- risk darajasi
- AI xulosa
- kuchli tomonlar
- zaif tomonlar
- risklar
- imkoniyatlar
- 5 qadamli tavsiyalar
- moliyaviy prognoz
- kredit kerak yoki yo'q

Faqat JSON qaytar:
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.5,
              maxOutputTokens: 3500
            }
          })
        }
      );

      const apiData = await apiRes.json();
      let text = apiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return new Response(JSON.stringify({
          error: true,
          message: "AI javobini parse qilib bo'lmadi",
          raw: text
        }), { headers: cors() });
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
