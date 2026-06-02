// Extração de PDF compatível com Cloudflare Workers (sem DOMMatrix)
// Usa unpdf que embute uma build serverless do pdf.js.

export interface PDFTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PDFPageData {
  pageNumber: number;
  items: PDFTextItem[];
}

async function loadPdf(data: ArrayBuffer) {
  const { getDocumentProxy } = await import("unpdf");
  return await getDocumentProxy(new Uint8Array(data));
}

/**
 * Extrai dados brutos do PDF com coordenadas (Baixo Custo)
 */
export async function getPdfRawData(fileData: ArrayBuffer): Promise<PDFPageData[]> {
  try {
    const pdf = await loadPdf(fileData);
    const pages: PDFPageData[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const items: PDFTextItem[] = (textContent.items as any[])
        .filter((it) => typeof it.str === "string")
        .map((item: any) => ({
          str: item.str,
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
          width: item.width || 0,
          height: Math.abs(item.transform?.[0] || item.transform?.[3] || 10),
        }));

      pages.push({ pageNumber: i, items });
    }

    return pages;
  } catch (err) {
    console.warn("getPdfRawData failed:", err);
    return [];
  }
}

/**
 * Extrai texto de um PDF de forma local preservando a estrutura de colunas (Baixo Custo)
 */
export async function extractTextLocally(fileData: ArrayBuffer): Promise<string> {
  try {
    const pages = await getPdfRawData(fileData);
    if (pages.length === 0) {
      // Fallback: tenta extração simples via unpdf.extractText
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(fileData));
        const { text } = await extractText(pdf, { mergePages: false });
        if (Array.isArray(text)) {
          return text.map((t, i) => `--- PÁGINA ${i + 1} ---\n${t}\n`).join("\n");
        }
        return String(text || "");
      } catch (e) {
        console.warn("unpdf extractText fallback failed:", e);
        return "";
      }
    }

    let fullText = "";
    for (const page of pages) {
      const lines: Record<number, PDFTextItem[]> = {};
      const yTolerance = 2;

      page.items.forEach((item) => {
        const y = Math.round(item.y / yTolerance) * yTolerance;
        if (!lines[y]) lines[y] = [];
        lines[y].push(item);
      });

      const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a);
      let pageText = "";

      for (const y of sortedY) {
        const lineItems = lines[y].sort((a, b) => a.x - b.x);
        let lineStr = "";
        let lastX = -1;

        for (const item of lineItems) {
          if (lastX !== -1) {
            const gap = item.x - lastX;
            if (gap > 10) lineStr += "    ";
            else if (gap > 2) lineStr += " ";
          }
          lineStr += item.str;
          lastX = item.x + item.width;
        }

        if (lineStr.trim()) pageText += lineStr + "\n";
      }

      fullText += `--- PÁGINA ${page.pageNumber} ---\n${pageText}\n\n`;
    }

    return fullText;
  } catch (error) {
    console.error("Local PDF extraction failed:", error);
    return "";
  }
}
