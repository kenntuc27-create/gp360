import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BidItemInput {
  id: string;
  item_number: number;
  descricao: string;
  unidade: string | null;
  quantidade: number;
}

interface ExtractedItemPrice {
  bid_item_id: string;
  ref?: number;
  valor_unitario: number;
  unidade_fornecedor?: string;
  preco_embalagem_fornecedor?: number;
  fator_conversao?: number;
  marca: string;
  prazo: string;
  observacao: string;
  needs_review?: boolean;
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const safeNum = (v: unknown): number => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (/^[\d.\s\/*+\-()]+$/.test(s)) {
      try { const r = Function(`"use strict";return (${s})`)(); return typeof r === "number" && isFinite(r) ? r : 0; } catch { /* */ }
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  return 0;
};

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
): Promise<{ ok: true; data: { proposal_validity: string; general_observations: string; items: ExtractedItemPrice[] } } | { ok: false; status: number; error: string; retryAfter?: number }> {
  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!aiResp.ok) {
    const txt = await aiResp.text();
    let retryAfter: number | undefined;
    const m = txt.match(/try again in ([\d.]+)s/i);
    if (m) retryAfter = Math.ceil(parseFloat(m[1])) + 2;
    if (aiResp.status === 429 && !retryAfter) retryAfter = 15;
    console.error("AI error", aiResp.status, txt.slice(0, 300));
    return { ok: false, status: aiResp.status, error: txt, retryAfter };
  }
  const aiData = await aiResp.json();
  const finish = aiData?.choices?.[0]?.finish_reason;
  const content: string | undefined = aiData?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, status: 500, error: "IA não retornou conteúdo" };
  if (finish === "length") return { ok: false, status: 500, error: "Resposta truncada" };
  try {
    const parsed = JSON.parse(content);
    const items = Array.isArray(parsed.items) ? parsed.items.map((it: Record<string, unknown>) => ({
      bid_item_id: String(it.bid_item_id ?? it.ref ?? ""),
      ref: typeof it.ref === "number" ? it.ref : (typeof it.ref === "string" ? parseInt(it.ref, 10) : undefined),
      valor_unitario: safeNum(it.valor_unitario),
      unidade_fornecedor: String(it.unidade_fornecedor ?? ""),
      preco_embalagem_fornecedor: safeNum(it.preco_embalagem_fornecedor),
      fator_conversao: safeNum(it.fator_conversao) || 1,
      marca: String(it.marca ?? ""),
      prazo: String(it.prazo ?? ""),
      observacao: String(it.observacao ?? ""),
      needs_review: Boolean(it.needs_review),
    })) : [];
    return {
      ok: true,
      data: {
        proposal_validity: String(parsed.proposal_validity ?? ""),
        general_observations: String(parsed.general_observations ?? ""),
        items,
      },
    };
  } catch (e) {
    return { ok: false, status: 500, error: "JSON inválido: " + (e as Error).message };
  }
}

const systemPrompt = `Você extrai preços unitários de uma proposta de fornecedor. Responda APENAS com JSON válido (sem markdown, sem comentários, sem expressões — calcule e devolva números prontos).

FORMATO OBRIGATÓRIO:
{"proposal_validity":"","general_observations":"","items":[{"ref":1,"valor_unitario":0,"unidade_fornecedor":"","preco_embalagem_fornecedor":0,"fator_conversao":1,"marca":"","prazo":"","observacao":"","needs_review":false}]}

REGRAS:
1) "ref" = número de referência exato do item informado na lista (1, 2, 3...). NUNCA invente, NUNCA pule. Devolva UM objeto por ref pedido.
2) valor_unitario = SEMPRE o preço unitário EXATO informado pelo fornecedor no documento (coluna "UNITÁRIO", "VL UNIT", "PREÇO UNIT" etc.). NUNCA divida pela quantidade pedida, NUNCA divida pelo conteúdo da embalagem, NUNCA recalcule. Copie o número como está.
3) fator_conversao = 1 sempre (não converter).
4) preco_embalagem_fornecedor: se o fornecedor mostrar preço por embalagem (CX, FD, GL), registre aqui apenas como referência — mas valor_unitario continua sendo o unitário literal do documento.
5) Se item não aparece no documento: valor_unitario=0, needs_review=true, observacao="Não localizado".
6) Use ponto como decimal. Todos os campos numéricos devem ser números, não strings.
7) Combine itens pela DESCRIÇÃO/SIMILARIDADE (modelo, princípio ativo, embalagem). O fornecedor pode usar nomes ligeiramente diferentes.`;

async function processInBackground(
  responseId: string,
  rawText: string,
  items: BidItemInput[],
  groqKey: string,
  serviceClient: ReturnType<typeof createClient>,
) {
  const text = rawText.length > 8000 ? rawText.slice(0, 8000) : rawText;
  const BATCH = 8;
  const DELAY_MS = 4000;

  await serviceClient.from("bid_supplier_responses").update({
    extraction_status: "processing",
    extraction_progress: 0,
    extraction_total: items.length,
    extraction_error: "",
  }).eq("id", responseId);

  // Limpa preços existentes (pode ser re-execução)
  await serviceClient.from("bid_supplier_item_prices").delete().eq("response_id", responseId);

  let proposal_validity = "";
  let general_observations = "";
  let processed = 0;
  const insertedIds = new Set<string>();

  for (let offset = 0; offset < items.length; offset += BATCH) {
    const slice = items.slice(offset, offset + BATCH);
    const refToId = new Map<number, string>();
    const sliceList = slice.map((i, idx) => {
      const ref = idx + 1;
      refToId.set(ref, i.id);
      return `ref ${ref} | ${i.descricao} | qtd:${i.quantidade} | UN_ESPERADA:${i.unidade || "UN"}`;
    }).join("\n");

    const batchPrompt = `ITENS PARA LOCALIZAR (ref | descrição | qtd | UN_ESPERADA):
${sliceList}

DOCUMENTO DA PROPOSTA:
"""
${text}
"""

Devolva JSON com EXATAMENTE ${slice.length} objetos no array "items", um para cada ref de 1 a ${slice.length}. Use o número da ref no campo "ref".`;

    // Retry agressivo: até 6 tentativas com backoff baseado no header
    let result = await callAI(systemPrompt, batchPrompt, groqKey);
    let attempt = 0;
    while (!result.ok && (result.status === 429 || result.status >= 500) && attempt < 6) {
      attempt++;
      const wait = result.retryAfter ? result.retryAfter * 1000 : 10000 * attempt;
      console.log(`Lote ${offset}: status ${result.status}, aguardando ${wait}ms (tentativa ${attempt}/6)`);
      await new Promise((r) => setTimeout(r, wait));
      result = await callAI(systemPrompt, batchPrompt, groqKey);
    }

    const toInsert: Array<Record<string, unknown>> = [];
    if (result.ok) {
      if (!proposal_validity && result.data.proposal_validity) proposal_validity = result.data.proposal_validity;
      if (!general_observations && result.data.general_observations) general_observations = result.data.general_observations;

      const seen = new Set<number>();
      for (const it of result.data.items) {
        const ref = Number((it as unknown as { ref?: unknown }).ref ?? it.bid_item_id);
        const realId = refToId.get(ref);
        if (realId && !insertedIds.has(realId)) {
          insertedIds.add(realId);
          seen.add(ref);
          toInsert.push({
            response_id: responseId,
            bid_item_id: realId,
            valor_unitario: it.valor_unitario,
            unidade_fornecedor: it.unidade_fornecedor || "",
            preco_embalagem_fornecedor: it.preco_embalagem_fornecedor || 0,
            fator_conversao: it.fator_conversao || 1,
            marca: it.marca,
            prazo: it.prazo,
            observacao: it.observacao,
            needs_review: it.needs_review || false,
          });
        }
      }
      // Itens do lote que IA não devolveu: marca como pendente
      for (const [ref, realId] of refToId.entries()) {
        if (!seen.has(ref) && !insertedIds.has(realId)) {
          insertedIds.add(realId);
          toInsert.push({
            response_id: responseId,
            bid_item_id: realId,
            valor_unitario: 0,
            unidade_fornecedor: "",
            preco_embalagem_fornecedor: 0,
            fator_conversao: 1,
            marca: "",
            prazo: "",
            observacao: "IA não retornou este item — revisar",
            needs_review: true,
          });
        }
      }
    } else {
      console.error(`Lote ${offset} falhou após retries:`, result.error.slice(0, 200));
      for (const i of slice) {
        if (!insertedIds.has(i.id)) {
          insertedIds.add(i.id);
          toInsert.push({
            response_id: responseId,
            bid_item_id: i.id,
            valor_unitario: 0,
            unidade_fornecedor: i.unidade || "",
            preco_embalagem_fornecedor: 0,
            fator_conversao: 1,
            marca: "",
            prazo: "",
            observacao: `Falha na IA: ${result.error.slice(0, 100)}`,
            needs_review: true,
          });
        }
      }
    }

    if (toInsert.length) {
      const { error: insErr } = await serviceClient.from("bid_supplier_item_prices").insert(toInsert);
      if (insErr) console.error("Insert error:", insErr.message);
    }
    processed += slice.length;
    await serviceClient.from("bid_supplier_responses").update({
      extraction_progress: processed,
    }).eq("id", responseId);

    if (offset + BATCH < items.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  await serviceClient.from("bid_supplier_responses").update({
    extraction_status: "completed",
    extraction_progress: items.length,
    proposal_validity,
    observations: general_observations,
  }).eq("id", responseId);

  console.log(`Extração concluída: response ${responseId}, ${insertedIds.size} itens.`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const { responseId, rawText, items } = await req.json() as {
      responseId: string;
      rawText: string;
      items: BidItemInput[];
    };

    if (!responseId || !rawText || !items?.length) {
      return json({ error: "responseId, rawText e items obrigatórios" }, 400);
    }

    const GROQ_API_KEY = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);

    // Cliente service-role para escrever em background sem depender do JWT do usuário
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verifica que a response existe e o usuário tem acesso
    const { data: resp, error: respErr } = await userClient
      .from("bid_supplier_responses").select("id").eq("id", responseId).maybeSingle();
    if (respErr || !resp) return json({ error: "Resposta não encontrada ou sem acesso" }, 404);

    // Dispara processamento em background — retorna 202 imediatamente
    EdgeRuntime.waitUntil(
      processInBackground(responseId, rawText, items, GROQ_API_KEY, serviceClient)
        .catch(async (e) => {
          console.error("Background error:", e);
          await serviceClient.from("bid_supplier_responses").update({
            extraction_status: "failed",
            extraction_error: (e as Error).message?.slice(0, 500) || "erro desconhecido",
          }).eq("id", responseId);
        }),
    );

    return json({ accepted: true, responseId, total: items.length }, 202);
  } catch (e) {
    console.error("extract-supplier-quote error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
