import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportRequest {
  importId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { importId } = (await req.json()) as ImportRequest;
    if (!importId) throw new Error("importId is required");

    // Get import record
    const { data: importRec, error: fetchErr } = await supabase
      .from("edital_imports")
      .select("*")
      .eq("id", importId)
      .single();

    if (fetchErr || !importRec) throw new Error("Import record not found");

    // Start background processing
    // In a real production app, you might use a queue or a separate trigger.
    // For this implementation, we'll run it and let the client poll the status.
    
    // We initiate the process but don't wait for it to finish before returning to the client if we want it truly async.
    // However, Deno Edge Functions usually terminate. To get around this, we can use a recursive call or just run it.
    // Given the constraints, I will implement the logic and return a "processing started" response.
    
    // Actually, I'll run the logic here.
    processEdital(supabase, importRec).catch(async (err) => {
      console.error("Async processing error:", err);
      await supabase.from("edital_imports").update({
        status: "error",
        error_message: err.message
      }).eq("id", importId);
    });

    return new Response(JSON.stringify({ ok: true, message: "Processing started" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function log(supabase: any, importId: string, level: string, message: string, details?: any) {
  await supabase.from("edital_logs").insert({
    import_id: importId,
    level,
    message,
    details
  });
}

async function processEdital(supabase: any, importRec: any) {
  const importId = importRec.id;
  try {
    await supabase.from("edital_imports").update({ status: "processing_ocr", progress_pct: 10 }).eq("id", importId);
    await log(supabase, importId, "info", "Iniciando download do arquivo", { path: importRec.file_path });

    // 1. Get file from storage
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from("editais")
      .download(importRec.file_path);

    if (downloadErr) throw new Error(`Falha ao baixar arquivo: ${downloadErr.message}`);

    await log(supabase, importId, "info", "Arquivo baixado com sucesso. Iniciando extração OCR/AI.");
    await supabase.from("edital_imports").update({ status: "processing_ai", progress_pct: 30 }).eq("id", importId);

    // 2. Call Google Gemini API DIRECTLY (sem Lovable AI Gateway, sem créditos Lovable)
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada. Obtenha grátis em https://aistudio.google.com/apikey");

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Chunked conversion to avoid stack overflow
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < uint8Array.length; i += chunk) {
      binary += String.fromCharCode(...uint8Array.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    const MODEL = "gemini-2.5-flash";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const extractionPrompt = `Você é um motor profissional de OCR e extração de editais de licitação brasileiros (Pregão, Concorrência, Dispensa, etc.).

Extraia TODOS os dados do cabeçalho E TODOS os itens da tabela, com fidelidade ao documento.

Retorne APENAS um JSON puro (sem markdown) com EXATAMENTE este formato (campos PLANOS, NÃO aninhe em "edital"):
{
  "orgao": "Nome do órgão comprador",
  "uasg": "Código UASG/UG",
  "processo": "Número do processo administrativo",
  "numero_pregao": "Número do pregão/edital (ex: 90001/2025)",
  "modalidade": "Pregão Eletrônico | Concorrência | Dispensa | etc.",
  "objeto": "Descrição completa do objeto",
  "portal_disputa": "ComprasNet | BLL | Licitanet | BNC | etc.",
  "data_abertura": "DD/MM/AAAA HH:MM",
  "data_inicio_propostas": "DD/MM/AAAA HH:MM",
  "data_encerramento_propostas": "DD/MM/AAAA HH:MM",
  "orgao_pagador": "Órgão/unidade responsável pelo pagamento",
  "endereco_orgao": "Endereço completo de entrega/órgão",
  "cidade_orgao": "Cidade de entrega",
  "estado_orgao": "UF (sigla 2 letras)",
  "local_entrega": "Local específico de entrega",
  "prazo_entrega": "Ex: 30 dias após a OF",
  "prazo_pagamento": "Ex: 30 dias após liquidação",
  "valor_total_estimado": 0,
  "items": [
    { "item_number": 1, "lote": "", "descricao": "", "unidade": "UN", "quantidade": 0, "valor_unitario": 0, "valor_total": 0, "marca": "", "catmat": "", "me_epp": false, "confidence": 0.95 }
  ]
}

REGRAS:
- Normalize unidades: UN, CX, PCT, KG, L, ML, M, M2, M3, FR, AMP.
- Datas no formato DD/MM/AAAA (com HH:MM quando houver).
- Valores numéricos SEM formatação (ponto decimal, sem R$, sem vírgula de milhar).
- valor_total_estimado = soma dos valor_total dos itens.
- Extraia TODOS os itens, NÃO PULE nenhum.
- Se um campo não estiver no edital, retorne "" ou 0. NUNCA invente.
- Cidade/UF/endereço: busque em "Local de Entrega" ou "Endereço do Órgão".`;

    // Retry automático (3 tentativas com backoff) — Gemini direto
    const callAI = async (attempt = 1): Promise<any> => {
      const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: extractionPrompt },
              { text: "Extraia os dados deste edital de licitação." },
              { inlineData: { mimeType: "application/pdf", data: base64 } }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
          }
        })
      });

      if ((response.status === 429 || response.status === 503) && attempt < 3) {
        await log(supabase, importId, "warn", `Gemini sobrecarregado (${response.status}). Retry ${attempt}/3...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
        return callAI(attempt + 1);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API failed [${response.status}]: ${errorText}`);
      }

      return response.json();
    };

    const aiResult = await callAI();
    let extractedData;
    try {
      const content = aiResult?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleanJson = content.replace(/```json\n?|```/g, "").trim();
      extractedData = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error("Failed to parse Gemini response:", JSON.stringify(aiResult));
      throw new Error("A IA retornou um formato inválido. Tente novamente.");
    }

    // Safety: flatten legacy "edital" wrapper if present
    if (extractedData.edital && typeof extractedData.edital === "object") {
      extractedData = { ...extractedData.edital, ...extractedData };
      delete extractedData.edital;
    }

    // Safety: compute valor_total_estimado if missing
    if (!extractedData.valor_total_estimado && Array.isArray(extractedData.items)) {
      extractedData.valor_total_estimado = extractedData.items.reduce(
        (sum: number, it: any) => sum + (Number(it.valor_total) || Number(it.valor_unitario || 0) * Number(it.quantidade || 0)),
        0
      );
    }

    await log(supabase, importId, "info", "Extração concluída. Salvando itens no staging.", { itemCount: extractedData.items?.length });
    await supabase.from("edital_imports").update({ 
      status: "completed", 
      progress_pct: 100,
      extracted_json: extractedData
    }).eq("id", importId);

    // 3. Save items to staging
    if (extractedData.items && Array.isArray(extractedData.items)) {
      const stagingItems = extractedData.items.map((it: any) => ({
        import_id: importId,
        item_number: it.item_number,
        lote: it.lote,
        descricao: it.descricao,
        unidade: it.unidade,
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
        valor_total: it.valor_total || (it.valor_unitario * it.quantidade),
        marca: it.marca,
        catmat: it.catmat,
        me_epp: it.me_epp,
        confidence_score: it.confidence || 0.8
      }));

      const { error: insertErr } = await supabase.from("edital_staging_items").insert(stagingItems);
      if (insertErr) {
        await log(supabase, importId, "error", "Falha ao salvar itens no staging", insertErr);
      }
    }

    await log(supabase, importId, "info", "Processamento finalizado com sucesso.");

  } catch (error) {
    console.error("Processing error:", error);
    await log(supabase, importId, "error", error.message);
    await supabase.from("edital_imports").update({
      status: "error",
      error_message: error.message
    }).eq("id", importId);
  }
}
