import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ItemIn = z.object({
  id: z.string(),
  item_number: z.number().optional().default(0),
  descricao: z.string().default(""),
  unidade: z.string().default("UN"),
  quantidade: z.number().default(1),
});
const ItemOut = z.object({
  id: z.string(),
  descricao_padronizada: z.string().default(""),
  unidade_padronizada: z.string().default(""),
  categoria: z.string().default(""),
  duplicado_de_id: z.string().nullable().optional().default(null),
});

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const TOOL = {
  type: "function" as const,
  function: {
    name: "organizar_itens",
    description: "Padroniza descrições, sugere categoria e marca duplicados.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              descricao_padronizada: { type: "string", description: "Descrição clara, sem abreviações ambíguas, mantendo especificações técnicas." },
              unidade_padronizada: { type: "string", description: "Sigla padrão: UN, CX, KG, L, M, PCT, FRC, RES, etc." },
              categoria: { type: "string", description: "Categoria curta (ex.: Papelaria, Higiene, Limpeza, Informática, Mobiliário, Medicamento, Material de construção)." },
              duplicado_de_id: { type: ["string", "null"], description: "ID de outro item desta lista que descreve o MESMO produto. null se não for duplicado." },
            },
            required: ["id", "descricao_padronizada", "unidade_padronizada", "categoria"],
          },
        },
      },
      required: ["items"],
    },
  },
};

export const organizarItensIA = createServerFn({ method: "POST" })
  .inputValidator((d: { items: unknown[] }) => z.object({ items: z.array(ItemIn).min(1).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "LOVABLE_API_KEY ausente", items: [] };

    const system = `Você organiza listas de itens de cotação/licitação em PT-BR.
Regras:
- Padronize descrições: corrija ortografia, expanda abreviações ambíguas, mantenha medidas/marcas/especificações.
- Sugira uma CATEGORIA curta para cada item (ex.: Papelaria, Higiene, Limpeza, Informática, Mobiliário, Material de construção, Medicamento, Alimento, EPI).
- Padronize unidades para siglas: UN, CX, KG, L, M, PCT, FRC, RES, PAR, DZ.
- Detecte duplicados reais (mesmo produto, mesma especificação) e indique duplicado_de_id apontando para o item canônico (o de menor item_number).
- NÃO invente itens. NÃO remova nada — só sinalize.`;

    const user = `Itens:\n${JSON.stringify(data.items, null, 2)}`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch(AI_URL, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "organizar_itens" } },
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        if (res.status === 429) return { ok: false as const, error: "Limite de uso atingido. Tente novamente em instantes.", items: [] };
        if (res.status === 402) return { ok: false as const, error: "Créditos esgotados na IA. Adicione fundos no workspace.", items: [] };
        return { ok: false as const, error: `IA ${res.status}: ${txt.slice(0, 160)}`, items: [] };
      }
      const json = await res.json();
      const call = json?.choices?.[0]?.message?.tool_calls?.[0];
      if (!call) return { ok: false as const, error: "IA não retornou estrutura.", items: [] };
      const parsed = z.object({ items: z.array(ItemOut).default([]) }).parse(JSON.parse(call.function.arguments));
      return { ok: true as const, error: null, items: parsed.items };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg.includes("Abort") ? "A IA demorou demais." : msg, items: [] };
    } finally {
      clearTimeout(t);
    }
  });
