import { DocumentMap, DocumentMapSchema } from "./types";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.0-flash";

/**
 * ETAPA 3 — CLASSIFICADOR ESTRUTURAL
 * Mapeia o documento identificando regiões críticas antes da extração.
 */
export async function mapDocumentStructure(
  apiKey: string,
  file: { base64?: string; fileUrl?: string; mimeType: string; fileName: string }
): Promise<DocumentMap> {
  const geminiKey = process.env.GEMINI_API_KEY;
  
  const systemPrompt = `Você é um arquiteto de sistemas especialista em documentos de licitação brasileiros.
Sua tarefa é MAPEAR a estrutura do edital ANTES da extração detalhada.
Identifique onde estão as regiões críticas:
- Cabeçalho (capa, dados do órgão, modalidade)
- Itens (tabelas de produtos/serviços, termo de referência)
- Financeiro (valores globais, orçamentos estimados, somatórios)
- Jurídico (cláusulas, sanções)
- Anexos
- Assinaturas

Também verifique se o documento parece escaneado, se precisa de rotação e se possui tabelas claras.
Retorne um JSON seguindo o esquema DocumentMap.`;

  if (geminiKey) {
    try {
      const url = `${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
      const userContent = "Analise este documento e mapeie as seções principais, detectando páginas escaneadas e estruturas de tabelas.";
      
      const body = {
        contents: [{
          role: "user",
          parts: [
            file.fileUrl ? { text: `Documento disponível em: ${file.fileUrl}` } : { inlineData: { mimeType: file.mimeType, data: file.base64 } },
            { text: userContent }
          ]
        }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              regions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["header", "items", "financial", "attachments", "legal", "signatures", "other"] },
                    pages: { type: "array", items: { type: "number" } },
                    confidence: { type: "number" },
                    description: { type: "string" }
                  },
                  required: ["type", "pages", "confidence"]
                }
              },
              total_pages: { type: "number" },
              is_scanned: { type: "boolean" },
              has_tables: { type: "boolean" },
              rotation_needed: { type: "number" }
            },
            required: ["regions", "total_pages", "is_scanned", "has_tables", "rotation_needed"]
          }
        }
      };

      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return DocumentMapSchema.parse(JSON.parse(text));
      }
    } catch (e) {
      console.error("Mapper AI failed:", e);
    }
  }

  // Fallback se a IA falhar
  return {
    total_pages: 1,
    is_scanned: false,
    has_tables: true,
    rotation_needed: 0,
    regions: [
      { type: "header", pages: [1], confidence: 50 },
      { type: "items", pages: [1], confidence: 50 }
    ]
  };
}
