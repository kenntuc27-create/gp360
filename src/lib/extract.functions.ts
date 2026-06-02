import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Pro model => better at multi-page tabular extraction across diverse edital layouts
const MODEL = "google/gemini-2.5-pro";

function arrayBufferToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const ItemSchema = z.object({
  item_number: z.number().default(1),
  lote: z.string().optional().default(""),
  descricao: z.string().default(""),
  unidade: z.string().default("UN"),
  quantidade: z.number().default(1),
  valor_unitario: z.number().default(0),
  valor_total: z.number().default(0),
  marca: z.string().optional().default(""),
  catmat: z.string().optional().default(""),
  me_epp: z.boolean().optional().default(false),
});

const ExtractedSchema = z.object({
  // Cabeçalho
  orgao: z.string().default(""),
  uasg: z.string().default(""),
  processo: z.string().default(""),
  objeto: z.string().default(""),
  modalidade: z.string().default(""),
  numero_pregao: z.string().default(""),
  portal_disputa: z.string().default(""),
  // Datas
  data_abertura: z.string().default(""),
  data_encerramento_propostas: z.string().default(""),
  data_limite_entrega: z.string().default(""),
  // Órgão pagador / endereço
  orgao_pagador: z.string().default(""),
  endereco_orgao: z.string().default(""),
  cidade_orgao: z.string().default(""),
  estado_orgao: z.string().default(""),
  // Prazos comerciais
  prazo_entrega: z.string().default(""),
  prazo_pagamento: z.string().default(""),
  local_entrega: z.string().default(""),
  // Contato
  contato_responsavel: z.string().default(""),
  telefone_contato: z.string().default(""),
  email_contato: z.string().default(""),
  // Financeiro
  valor_total_estimado: z.number().default(0),
  // Itens
  items: z.array(ItemSchema).default([]),
  extraction_method: z.string().optional(),
  extraction_score: z.number().optional(),
});

export type Extracted = z.infer<typeof ExtractedSchema>;

const EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "registrar_edital",
    description:
      "Registra os dados extraídos de um edital de licitação brasileiro (Pregão, Dispensa, Concorrência etc.). Preencher TODOS os campos disponíveis no documento.",
    parameters: {
      type: "object",
      properties: {
        orgao: { type: "string", description: "Nome completo do órgão comprador (ex.: Prefeitura Municipal de X, Secretaria de Saúde de Y)." },
        uasg: { type: "string", description: "Código UASG / UG (somente números)." },
        processo: { type: "string", description: "Número do processo administrativo (ex.: 123/2025)." },
        objeto: { type: "string", description: "Descrição completa do objeto da licitação." },
        modalidade: { type: "string", description: "Modalidade (Pregão Eletrônico, Dispensa, Concorrência, etc.)." },
        numero_pregao: { type: "string", description: "Número do pregão/edital (ex.: 045/2025)." },
        portal_disputa: { type: "string", description: "Portal da disputa (ComprasNet, BLL, BNC, Licitar Digital etc.)." },
        data_abertura: { type: "string", description: "Data e hora de abertura da sessão (ISO 8601 quando possível, ex.: 2025-06-12T09:00:00)." },
        data_encerramento_propostas: { type: "string", description: "Data/hora limite para envio das propostas." },
        data_limite_entrega: { type: "string", description: "Data limite para entrega do objeto, se houver." },
        orgao_pagador: { type: "string", description: "Órgão responsável pelo pagamento (pode coincidir com o comprador)." },
        endereco_orgao: { type: "string", description: "Endereço (rua, número, bairro, CEP) do órgão comprador." },
        cidade_orgao: { type: "string", description: "Cidade do órgão comprador." },
        estado_orgao: { type: "string", description: "UF do órgão comprador (sigla, ex.: PA)." },
        prazo_entrega: { type: "string", description: "Prazo de entrega (ex.: '15 dias após emissão da nota de empenho')." },
        prazo_pagamento: { type: "string", description: "Prazo de pagamento (ex.: '30 dias após o recebimento definitivo')." },
        local_entrega: { type: "string", description: "Local de entrega do objeto." },
        contato_responsavel: { type: "string", description: "Nome do pregoeiro ou responsável." },
        telefone_contato: { type: "string", description: "Telefone de contato." },
        email_contato: { type: "string", description: "E-mail de contato." },
        valor_total_estimado: { type: "number", description: "Valor total estimado da licitação em reais (apenas o número, sem símbolos)." },
        items: {
          type: "array",
          description:
            "Lista COMPLETA dos itens da licitação extraídos da planilha/anexo. Não agrupar nem resumir; cada linha vira um item.",
          items: {
            type: "object",
            properties: {
              item_number: { type: "number", description: "Número sequencial do item conforme aparece no edital." },
              lote: { type: "string", description: "Lote ou grupo (se aplicável)." },
              descricao: { type: "string", description: "Descrição COMPLETA do item, sem truncar, incluindo especificações técnicas." },
              unidade: { type: "string", description: "Unidade de medida (UN, CX, KG, L, FR, AMP, COMP, etc.)." },
              quantidade: { type: "number", description: "Quantidade solicitada (numérico)." },
              valor_unitario: { type: "number", description: "Valor unitário ESTIMADO/MÁXIMO em reais (numérico). Procurar nas colunas 'Valor Unitário', 'Preço Unitário Estimado', 'V. Unit.'." },
              valor_total: { type: "number", description: "Valor total do item (quantidade x unitário) em reais." },
              marca: { type: "string", description: "Marca de referência se especificada." },
              catmat: { type: "string", description: "Código CATMAT/CATSER se informado." },
              me_epp: { type: "boolean", description: "Indica se o item é exclusivo para ME/EPP." },
            },
            required: ["item_number", "descricao", "unidade", "quantidade", "valor_unitario"],
            additionalProperties: false,
          },
        },
      },
      required: ["orgao", "items"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Você é um especialista em análise de editais de licitação pública brasileira (Lei 14.133/21 e Lei 8.666/93).
Sua função é LER o PDF completo do edital (incluindo anexos, planilhas, termos de referência) e EXTRAIR DE FORMA ESTRUTURADA todos os dados solicitados.

REGRAS CRÍTICAS:
1. NÃO INVENTE dados. Se um campo não está claramente no documento, deixe vazio ("") ou 0.
2. EXTRAIA TODOS OS ITENS sem exceção. Se a planilha de itens tem 200 linhas, retorne 200 itens.
3. NÃO AGRUPE itens diferentes em uma única linha. Cada linha da planilha = 1 item.
4. Para VALOR UNITÁRIO: procure colunas como "Valor Unitário", "Preço Unitário Estimado", "V. Unit. Máximo", "Preço Máximo". Se houver "Valor Total" e "Quantidade", calcule o unitário = total/qtd.
5. Para datas, use formato ISO (AAAA-MM-DDTHH:MM:SS) sempre que possível.
6. Para valores monetários, retorne APENAS o número (sem R$, sem ponto de milhar; use ponto como separador decimal).
7. Descrição do item deve ser COMPLETA com toda a especificação técnica - não truncar.
8. SEMPRE chame a função 'registrar_edital'. Nunca responda em texto livre.`;

async function getPdfDataUrl(input: { base64?: string; fileUrl?: string; mimeType?: string }) {
  const mimeType = input.mimeType || "application/pdf";
  if (input.base64) return `data:${mimeType};base64,${input.base64}`;
  if (!input.fileUrl) throw new Error("Nenhum arquivo informado.");
  const res = await fetch(input.fileUrl);
  if (!res.ok) throw new Error(`Falha ao baixar PDF: ${res.status}`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength > 25 * 1024 * 1024) {
    throw new Error("Arquivo muito grande para processamento direto (máx 25MB).");
  }
  return `data:${mimeType};base64,${arrayBufferToBase64(ab)}`;
}

async function callAIExtraction(apiKey: string, pdfDataUrl: string): Promise<Extracted> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240000);

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analise este edital de licitação COMPLETO (todas as páginas, incluindo planilhas e anexos) e chame a função registrar_edital preenchendo TODOS os campos, com a lista COMPLETA de itens e seus valores unitários.",
              },
              { type: "image_url", image_url: { url: pdfDataUrl } },
            ],
          },
        ],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "function", function: { name: "registrar_edital" } },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em alguns instantes.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Erro da IA (${res.status}): ${txt.slice(0, 300)}`);
    }

    const json = await res.json();
    const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      const fallbackText = json?.choices?.[0]?.message?.content || "";
      throw new Error(`A IA não retornou os dados estruturados. ${fallbackText.slice(0, 200)}`);
    }

    const args = JSON.parse(toolCall.function.arguments);

    // Recompõe valor total se vier zerado
    if (!args.valor_total_estimado && Array.isArray(args.items)) {
      args.valor_total_estimado = args.items.reduce((sum: number, it: any) => {
        const total = Number(it.valor_total) || Number(it.valor_unitario) * Number(it.quantidade) || 0;
        return sum + total;
      }, 0);
    }

    return ExtractedSchema.parse({
      ...args,
      extraction_method: "ai_pdf_direct_pro",
      extraction_score: Array.isArray(args.items) && args.items.length > 0 ? 90 : 30,
    });
  } finally {
    clearTimeout(timeout);
  }
}


export const extractEdital = createServerFn({ method: "POST" })
  .inputValidator((d: { text?: string; fileBase64?: string; fileUrl?: string; mimeType?: string; fileName?: string }) =>
    z
      .object({
        text: z.string().max(2_000_000).optional().default(""),
        fileBase64: z.string().max(80_000_000).optional(),
        fileUrl: z.string().url().optional(),
        mimeType: z.string().optional().default("application/pdf"),
        fileName: z.string().optional().default("edital.pdf"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "LOVABLE_API_KEY ausente", data: null };

    try {
      const pdfDataUrl = await getPdfDataUrl({
        base64: data.fileBase64,
        fileUrl: data.fileUrl,
        mimeType: data.mimeType,
      });
      const result = await callAIExtraction(apiKey, pdfDataUrl);
      return { ok: true as const, error: null, data: result };
    } catch (e) {
      console.error("Extraction failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg, data: null };
    }
  });

export const extractPdfPageImages = createServerFn({ method: "POST" })
  .inputValidator((d: { pages: { pageNumber: number; imageBase64: string }[] }) =>
    z
      .object({
        pages: z
          .array(
            z.object({
              pageNumber: z.number().int().min(1),
              imageBase64: z.string().min(100).max(6_000_000),
            }),
          )
          .min(1)
          .max(3),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "LOVABLE_API_KEY ausente", text: "" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const pageList = data.pages.map((p) => p.pageNumber).join(", ");
      const content: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [
        {
          type: "text",
          text: `Extraia TODO o texto legível destas páginas de edital (${pageList}), preservando tabelas e estruturas. Não resuma.`,
        },
        ...data.pages.map((page) => ({
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${page.imageBase64}` },
        })),
      ];

      const res = await fetch(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content }],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false as const, error: `AI ${res.status}: ${txt.slice(0, 200)}`, text: "" };
      }
      const json = await res.json();
      const text = String(json?.choices?.[0]?.message?.content || "").trim();
      return { ok: text.length > 0, error: text ? null : "Sem texto extraído.", text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg, text: "" };
    } finally {
      clearTimeout(timeout);
    }
  });

