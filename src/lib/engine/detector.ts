import { z } from "zod";
import { PDFPageData, PDFTextItem } from "../pdfLocal";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.0-flash";

export const TableGridSchema = z.object({
  page: z.number(),
  has_grid: z.boolean(),
  columns: z.array(z.string()).optional(),
  column_x_offsets: z.array(z.number()).optional(),
  rows_count: z.number().optional(),
  bounding_box: z.any().optional(),
  confidence: z.number(),
});

export type TableGrid = z.infer<typeof TableGridSchema>;

/**
 * DETECTOR LOCAL DE COLUNAS (Baixo Custo)
 * Analisa a densidade de texto horizontal para identificar onde as colunas começam.
 */
export function detectTableColumnsLocally(page: PDFPageData): TableGrid {
  const xDensity: Record<number, number> = {};
  const xTolerance = 5; // Tolerância para agrupar X

  // Mapeia onde o texto começa
  page.items.forEach(item => {
    if (item.str.trim().length === 0) return;
    const x = Math.round(item.x / xTolerance) * xTolerance;
    xDensity[x] = (xDensity[x] || 0) + 1;
  });

  // Identifica picos de densidade (início de colunas)
  const sortedX = Object.keys(xDensity).map(Number).sort((a, b) => a - b);
  const columns: number[] = [];
  
  if (sortedX.length > 0) {
    columns.push(sortedX[0]);
    for (let i = 1; i < sortedX.length; i++) {
      if (sortedX[i] - sortedX[i-1] > 30) { // Gap de 30px sugere nova coluna
        columns.push(sortedX[i]);
      }
    }
  }

  return {
    page: page.pageNumber,
    has_grid: columns.length >= 3,
    column_x_offsets: columns,
    confidence: columns.length >= 3 ? 80 : 30,
    rows_count: Math.round(page.items.length / (columns.length || 1))
  };
}

/**
 * ETAPA 4 — DETECTOR INTELIGENTE DE TABELAS (Fallback AI)
 */
export async function detectTableGrids(
  apiKey: string,
  file: { base64?: string; fileUrl?: string; mimeType: string },
  pages: number[]
): Promise<TableGrid[]> {
  // Se possível, usar detecção local primeiro ou como apoio
  // Para manter o fluxo atual, mantemos a assinatura mas poderíamos otimizar
  
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return [];

  const systemPrompt = `Você é um detector especializado em estruturas tabulares de editais.
Sua tarefa é identificar GRIDS de tabelas de itens nestas páginas (${pages.join(", ")}).
Identifique:
- Se existe uma grade/grid (linhas e colunas)
- Quais são os prováveis cabeçalhos das colunas (ex: Item, Descrição, Qtd, Valor)
- Estimativa de quantas linhas de itens existem.

Não extraia o texto dos itens agora, apenas identifique a estrutura.
FOCO: Procure padrões repetitivos de itens de licitação.`;

  try {
    const url = `${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
    
    const body = {
      contents: [{
        role: "user",
        parts: [
          file.fileUrl ? { text: `Documento: ${file.fileUrl}` } : { inlineData: { mimeType: file.mimeType, data: file.base64 } },
          { text: `Detecte as tabelas de itens nas páginas ${pages.join(", ")}.` }
        ]
      }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              page: { type: "number" },
              has_grid: { type: "boolean" },
              columns: { type: "array", items: { type: "string" } },
              rows_count: { type: "number" },
              confidence: { type: "number" }
            },
            required: ["page", "has_grid", "confidence"]
          }
        }
      }
    };

    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return z.array(TableGridSchema).parse(JSON.parse(text));
    }
  } catch (e) {
    console.error("Table Detector failed:", e);
  }

  return [];
}
