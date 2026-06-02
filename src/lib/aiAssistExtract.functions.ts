// Server functions LEVES de assistência da IA para o pipeline híbrido.
// Recebem APENAS o trecho problemático (item, bloco ou cabeçalho), nunca o PDF inteiro.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.5-flash";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-2.5-flash";

const ItemSchema = z.object({
  item_number: z.number(),
  descricao: z.string().default(""),
  unidade: z.string().default("UN"),
  quantidade: z.number().default(1),
  valor_unitario: z.number().default(0),
  marca: z.string().default(""),
});

const HeaderSchema = z.object({
  orgao: z.string().default(""),
  uasg: z.string().default(""),
  processo: z.string().default(""),
  objeto: z.string().default(""),
  modalidade: z.string().default(""),
  data_abertura: z.string().default(""),
  data_inicio_propostas: z.string().default(""),
  data_encerramento_propostas: z.string().default(""),
  data_limite_entrega: z.string().default(""),
  prazo_entrega: z.string().default(""),
  local_entrega: z.string().default(""),
});

// ==================== Helpers ====================
async function callGeminiJson(apiKey: string, system: string, user: string, schemaProps: Record<string, unknown>, timeoutMs = 45000): Promise<unknown> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: { type: "object", properties: schemaProps, required: Object.keys(schemaProps) },
      },
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

async function callLovableJson(apiKey: string, system: string, user: string, timeoutMs = 45000): Promise<unknown> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: LOVABLE_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Lovable AI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const content = j?.choices?.[0]?.message?.content || "{}";
    return JSON.parse(content);
  } finally {
    clearTimeout(t);
  }
}

// ==================== Server fn 1: corrige itens (snippet ou tabela inteira) ====================
export const aiAssistItems = createServerFn({ method: "POST" })
  .inputValidator((d: {
    mode: "items" | "table";
    snippets?: { item_number: number; snippet: string }[];
    tableText?: string;
  }) => z.object({
    mode: z.enum(["items", "table"]),
    snippets: z.array(z.object({ item_number: z.number(), snippet: z.string().max(4000) })).max(50).optional(),
    tableText: z.string().max(80000).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const geminiKey = process.env.GEMINI_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!geminiKey && !lovableKey) {
      return { ok: false as const, error: "Sem chave de IA configurada", items: null };
    }

    const system = `Você é especialista em editais brasileiros. Receba trechos de tabelas e devolva JSON com a lista "items".
Cada item tem: item_number (int), descricao, unidade (UN/CX/KG/L/M/PCT/CAR/FRC/SV/etc), quantidade (number), valor_unitario (number, ponto decimal, 0 se ausente), marca (string, vazio se ausente).
Não invente itens. Use exatamente os números que aparecem.`;

    let userMsg = "";
    if (data.mode === "items" && data.snippets?.length) {
      userMsg = `Para cada trecho abaixo, devolva o item correspondente no JSON {"items":[...]}:\n\n` +
        data.snippets.map((s) => `--- Item ${s.item_number} ---\n${s.snippet}`).join("\n\n");
    } else if (data.mode === "table" && data.tableText) {
      userMsg = `Extraia TODOS os itens desta tabela no formato {"items":[...]}:\n\n${data.tableText}`;
    } else {
      return { ok: false as const, error: "Entrada inválida", items: null };
    }

    const schemaProps = {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item_number: { type: "number" },
            descricao: { type: "string" },
            unidade: { type: "string" },
            quantidade: { type: "number" },
            valor_unitario: { type: "number" },
            marca: { type: "string" },
          },
          required: ["item_number", "descricao", "unidade", "quantidade", "valor_unitario", "marca"],
        },
      },
    };

    try {
      let json: unknown;
      if (geminiKey) {
        json = await callGeminiJson(geminiKey, system, userMsg, schemaProps);
      } else {
        json = await callLovableJson(lovableKey!, system, userMsg);
      }
      const parsed = z.object({ items: z.array(ItemSchema).default([]) }).parse(json);
      return { ok: true as const, items: parsed.items, error: null };
    } catch (e) {
      console.error("aiAssistItems error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg.slice(0, 200), items: null };
    }
  });

// ==================== Server fn 2: completa cabeçalho ====================
export const aiAssistHeader = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string }) => z.object({ text: z.string().max(20000) }).parse(d))
  .handler(async ({ data }) => {
    const geminiKey = process.env.GEMINI_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!geminiKey && !lovableKey) return { ok: false as const, error: "Sem chave de IA", data: null };

    const system = `Extraia do trecho abaixo (cabeçalho de edital brasileiro) um JSON com TODOS os campos: orgao, uasg (só dígitos), processo, objeto, modalidade, data_abertura, data_inicio_propostas, data_encerramento_propostas, data_limite_entrega, prazo_entrega, local_entrega. Datas em DD/MM/AAAA (HH:mm quando houver). Vazio se ausente.`;

    const schemaProps = Object.fromEntries(
      Object.keys(HeaderSchema.shape).map((k) => [k, { type: "string" }])
    );

    try {
      let json: unknown;
      if (geminiKey) {
        json = await callGeminiJson(geminiKey, system, data.text, schemaProps, 30000);
      } else {
        json = await callLovableJson(lovableKey!, system, data.text, 30000);
      }
      const parsed = HeaderSchema.parse(json);
      return { ok: true as const, data: parsed, error: null };
    } catch (e) {
      console.error("aiAssistHeader error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg.slice(0, 200), data: null };
    }
  });
