import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callAI(system: string, user: string, tool: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
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
        tools: [tool],
        tool_choice: { type: "function", function: { name: tool.function.name } },
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso atingido. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos esgotados. Adicione fundos no workspace.");
      throw new Error(`IA ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("IA não retornou estrutura.");
    return JSON.parse(call.function.arguments);
  } finally {
    clearTimeout(t);
  }
}

// =============== ETAPA 3: SUGERIR FORNECEDORES ===============
const SuggestSuppliersIn = z.object({
  itens: z.array(z.object({
    id: z.string(),
    descricao: z.string(),
    categoria: z.string().optional().default(""),
  })).min(1).max(500),
  fornecedores: z.array(z.object({
    id: z.string(),
    razao_social: z.string(),
    segmento: z.string().optional().default(""),
    tipo: z.string().optional().default(""),
    cidade: z.string().optional().default(""),
  })).min(1),
});

const TOOL_SUPPLIERS = {
  type: "function" as const,
  function: {
    name: "sugerir_fornecedores",
    description: "Sugere os melhores fornecedores para cotar com base nas categorias dos itens.",
    parameters: {
      type: "object",
      properties: {
        sugestoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fornecedor_id: { type: "string" },
              score: { type: "number", description: "0 a 100. Quanto faz sentido cotar com este fornecedor." },
              motivo: { type: "string", description: "Curto, em PT-BR. Ex.: 'Atende categoria Limpeza e Higiene'." },
              categorias_atendidas: { type: "array", items: { type: "string" } },
            },
            required: ["fornecedor_id", "score", "motivo"],
          },
        },
      },
      required: ["sugestoes"],
    },
  },
};

export const sugerirFornecedoresIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SuggestSuppliersIn.parse(d))
  .handler(async ({ data }) => {
    try {
      const system = `Você é um analista de compras. Cruze as CATEGORIAS dos itens da cotação com o SEGMENTO/TIPO dos fornecedores cadastrados.
Retorne APENAS fornecedores realmente compatíveis (score >= 50). Quanto maior o score, mais aderente.
Considere palavras-chave (ex.: "Higiene", "Limpeza", "Papelaria", "Informática", "EPI", "Material de construção", "Medicamento").`;
      const user = `Itens (${data.itens.length}):\n${JSON.stringify(data.itens, null, 2)}\n\nFornecedores (${data.fornecedores.length}):\n${JSON.stringify(data.fornecedores, null, 2)}`;
      const out = await callAI(system, user, TOOL_SUPPLIERS);
      const parsed = z.object({
        sugestoes: z.array(z.object({
          fornecedor_id: z.string(),
          score: z.number(),
          motivo: z.string(),
          categorias_atendidas: z.array(z.string()).optional().default([]),
        })),
      }).parse(out);
      return { ok: true as const, error: null, sugestoes: parsed.sugestoes };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, sugestoes: [] };
    }
  });

// =============== ETAPA 6: PRECIFICAÇÃO ASSISTIDA ===============
const PricingIn = z.object({
  itens: z.array(z.object({
    id: z.string(),
    descricao: z.string(),
    categoria: z.string().optional().default(""),
    quantidade: z.number().default(1),
    custo_unitario: z.number().default(0),
    margem_atual: z.number().default(30),
    num_concorrentes: z.number().default(0),
    menor_preco_concorrente: z.number().default(0),
  })).min(1).max(500),
  contexto: z.object({
    orgao: z.string().optional().default(""),
    modalidade: z.string().optional().default(""),
  }).optional().default({}),
});

const TOOL_PRICING = {
  type: "function" as const,
  function: {
    name: "sugerir_margens",
    description: "Sugere margem percentual ideal por item para maximizar chance de ganhar a licitação mantendo lucro.",
    parameters: {
      type: "object",
      properties: {
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              margem_sugerida: { type: "number", description: "Margem % sugerida (0 a 200)." },
              motivo: { type: "string", description: "Justificativa curta." },
              risco: { type: "string", enum: ["baixo", "medio", "alto"] },
            },
            required: ["id", "margem_sugerida", "motivo", "risco"],
          },
        },
      },
      required: ["itens"],
    },
  },
};

export const sugerirMargensIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PricingIn.parse(d))
  .handler(async ({ data }) => {
    try {
      const system = `Você é um especialista em precificação de licitações públicas no Brasil.
Para cada item, sugira a MARGEM % que equilibra:
- Competitividade (chance de ganhar contra concorrentes)
- Lucro mínimo viável (>= 10%)
- Risco da categoria (commodities = margem baixa; itens técnicos/exclusivos = margem maior)

Regras:
- Se há concorrência forte (>=3 fornecedores) E commodity: margem 12-20%.
- Se baixa concorrência ou item especializado: margem 25-45%.
- Se há "menor_preco_concorrente" preenchido, sugira margem que mantenha o preço final igual ou abaixo.
- Nunca sugerir margem < 8%.`;
      const user = `Contexto: ${JSON.stringify(data.contexto)}\nItens:\n${JSON.stringify(data.itens, null, 2)}`;
      const out = await callAI(system, user, TOOL_PRICING);
      const parsed = z.object({
        itens: z.array(z.object({
          id: z.string(),
          margem_sugerida: z.number(),
          motivo: z.string(),
          risco: z.enum(["baixo", "medio", "alto"]),
        })),
      }).parse(out);
      return { ok: true as const, error: null, itens: parsed.itens };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, itens: [] };
    }
  });

// =============== ETAPA 7: ANÁLISE DE RISCO ===============
const RiskIn = z.object({
  bid: z.object({
    orgao: z.string().optional().default(""),
    objeto: z.string().optional().default(""),
    modalidade: z.string().optional().default(""),
  }),
  resumo: z.object({
    total_itens: z.number(),
    custo_total: z.number(),
    preco_total: z.number(),
    lucro_estimado: z.number(),
    margem_media: z.number(),
    fornecedores_cotados: z.number(),
    itens_sem_cotacao: z.number(),
  }),
  itens_alerta: z.array(z.object({
    item_number: z.number(),
    descricao: z.string(),
    margem: z.number(),
    custo: z.number(),
    final: z.number(),
  })).max(50).optional().default([]),
});

const TOOL_RISK = {
  type: "function" as const,
  function: {
    name: "analisar_risco",
    description: "Avalia competitividade e risco da proposta de licitação.",
    parameters: {
      type: "object",
      properties: {
        chance_vitoria: { type: "number", description: "0 a 100." },
        nivel_risco: { type: "string", enum: ["baixo", "medio", "alto"] },
        resumo: { type: "string", description: "Análise geral em 2-3 frases." },
        pontos_fortes: { type: "array", items: { type: "string" } },
        pontos_atencao: { type: "array", items: { type: "string" } },
        recomendacoes: { type: "array", items: { type: "string" }, description: "Ações concretas para melhorar a proposta." },
      },
      required: ["chance_vitoria", "nivel_risco", "resumo", "pontos_fortes", "pontos_atencao", "recomendacoes"],
    },
  },
};

export const analisarRiscoIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RiskIn.parse(d))
  .handler(async ({ data }) => {
    try {
      const system = `Você é um consultor sênior em licitações públicas no Brasil. Analise a proposta e avalie:
- Chance de vitória (0-100)
- Nível de risco geral
- Pontos fortes e fracos
- Recomendações concretas (ex.: "reduzir margem do item 5 para 15%", "buscar mais 2 fornecedores na categoria X")

Seja direto, prático e em PT-BR.`;
      const user = JSON.stringify(data, null, 2);
      const out = await callAI(system, user, TOOL_RISK);
      const parsed = z.object({
        chance_vitoria: z.number(),
        nivel_risco: z.enum(["baixo", "medio", "alto"]),
        resumo: z.string(),
        pontos_fortes: z.array(z.string()),
        pontos_atencao: z.array(z.string()),
        recomendacoes: z.array(z.string()),
      }).parse(out);
      return { ok: true as const, error: null, ...parsed };
    } catch (e) {
      return {
        ok: false as const, error: (e as Error).message,
        chance_vitoria: 0, nivel_risco: "alto" as const,
        resumo: "", pontos_fortes: [], pontos_atencao: [], recomendacoes: [],
      };
    }
  });
