import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { descricao, marca, modelo, company_tipo } = await req.json();
    if (!descricao) {
      return new Response(JSON.stringify({ error: "descricao required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const norm = normalize(`${descricao} ${marca || ""} ${modelo || ""}`);

    // 1) Cache hit
    const { data: cached } = await admin
      .from("catalog_items")
      .select("id, image_url")
      .eq("descricao_normalizada", norm)
      .maybeSingle();

    if (cached?.image_url) {
      return new Response(JSON.stringify({ image_url: cached.image_url, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Generate with Google Gemini direct (Imagen 3)
    const prompt = `Foto realista, profissional, fundo branco, de produto: ${descricao}. ${marca ? `Marca: ${marca}.` : ""} ${modelo ? `Modelo: ${modelo}.` : ""} Iluminação suave, estilo de catálogo de e-commerce, alta qualidade, centralizado, sem texto sobreposto.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    });

    // Retry on 429/503 with exponential backoff
    let aiResp: Response | null = null;
    const delays = [1500, 4000, 9000, 18000];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      aiResp = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (aiResp.status !== 429 && aiResp.status !== 503) break;
      if (attempt === delays.length) break;
      console.log(`Gemini ${aiResp.status}, retry in ${delays[attempt]}ms`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
    if (!aiResp) throw new Error("no response");

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("Gemini error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402 || aiResp.status === 403) {
        return new Response(JSON.stringify({ error: "payment_required", details: t }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "ai_error", details: t }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const parts = aiData?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: { inlineData?: { data?: string; mimeType?: string } }) => p?.inlineData?.data);
    const base64: string | undefined = imgPart?.inlineData?.data;
    const mimeType: string = imgPart?.inlineData?.mimeType || "image/png";
    if (!base64) {
      console.error("no image in response", JSON.stringify(aiData).slice(0, 500));
      return new Response(JSON.stringify({ error: "no_image" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Upload to bucket
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ext = mimeType.includes("jpeg") ? "jpg" : "png";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("catalog-images")
      .upload(fileName, bytes, { contentType: mimeType, upsert: false });
    if (upErr) {
      console.error("upload err", upErr);
      return new Response(JSON.stringify({ error: "upload_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = admin.storage.from("catalog-images").getPublicUrl(fileName);
    const image_url = pub.publicUrl;

    // 4) Cache in catalog_items
    if (cached?.id) {
      await admin.from("catalog_items").update({ image_url, image_source: "ai" }).eq("id", cached.id);
    } else {
      await admin.from("catalog_items").insert({
        descricao,
        descricao_normalizada: norm,
        marca: marca || "",
        modelo: modelo || "",
        image_url,
        image_source: "ai",
        company_tipo: company_tipo || null,
      });
    }

    return new Response(JSON.stringify({ image_url, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
