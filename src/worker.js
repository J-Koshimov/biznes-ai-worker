export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    // Browserda ochib test qilish uchun
    if (request.method === "GET") {
      try {
        const apiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: 'Faqat JSON qaytar: {"ok":true,"message":"salom"}' }
                  ]
                }
              ]
            })
          }
        );

        const apiData = await apiRes.json();

        return new Response(JSON.stringify({
          worker_ok: true,
          has_key: !!env.GEMINI_API_KEY,
          gemini_status: apiRes.status,
          gemini_ok: apiRes.ok,
          gemini_response: apiData
        }, null, 2), {
          headers: cors()
        });

      } catch (err) {
        return new Response(JSON.stringify({
          worker_ok: false,
          error: err.message
        }, null, 2), {
          status: 500,
          headers: cors()
        });
      }
    }

    if (request.method !== "POST") {
      return new Response("POST only", { status: 405, headers: cors() });
    }

    return new Response(JSON.stringify({
      ok: true,
      message: "POST route ishlayapti"
    }), {
      headers: cors()
    });
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
