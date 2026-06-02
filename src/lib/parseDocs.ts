// Browser-side text extraction from PDF / DOCX / XLSX / images
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { extractPdfPageImages } from "@/lib/extract.functions";

// pdfjs is browser-only (uses DOMMatrix). Lazy-load to avoid SSR crashes.
type PdfJsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJsModule> | null = null;
async function getPdfJs(): Promise<PdfJsModule> {
  if (typeof window === "undefined") {
    throw new Error("PDF parsing só está disponível no navegador.");
  }
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      (mod as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl;
      return mod;
    })();
  }
  return pdfjsPromise;
}

type ExtractProgress = (msg: string) => void;
type ExtractTextOptions = {
  onProgress?: ExtractProgress;
  enableOcr?: boolean;
  enableAiImageFallback?: boolean;
};

export async function extractTextFromFile(
  file: File,
  progressOrOptions?: ExtractProgress | ExtractTextOptions,
): Promise<string> {
  const options = typeof progressOrOptions === "function"
    ? { onProgress: progressOrOptions }
    : progressOrOptions || {};
  const { onProgress, enableOcr = true, enableAiImageFallback = false } = options;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const buf = await file.arrayBuffer();
    // disableFontFace e disableAutoFetch reduzem memória em PDFs grandes
    const pdfjsLib = await getPdfJs();
    const pdf = await pdfjsLib.getDocument({
      data: buf,
      disableFontFace: true,
      disableAutoFetch: true,
      disableStream: false,
    }).promise;
    const total = pdf.numPages;
    const parts: string[] = [];
    for (let i = 1; i <= total; i++) {
      onProgress?.(`Lendo página ${i} de ${total}…`);
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      parts.push(
        tc.items.map((it) => ("str" in it ? (it as { str: string }).str : "")).join(" "),
      );
      // Libera memória da página
      page.cleanup();
    }

    const extracted = parts.join("\n").trim();
    if (extracted.length >= 20) {
      pdf.destroy();
      return extracted;
    }

    if (enableAiImageFallback) {
      const aiText = await extractPdfTextWithAiImages(pdf, total, onProgress);
      pdf.destroy();
      return aiText || extracted;
    }

    if (!enableOcr) {
      pdf.destroy();
      return extracted;
    }

    const ocrText = await extractPdfTextWithOcr(pdf, total, onProgress);
    pdf.destroy();
    return ocrText;
  }
  if (name.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    return r.value;
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    let out = "";
    wb.worksheets.forEach((ws) => {
      out += `\n=== Planilha: ${ws.name} ===\n`;
      ws.eachRow({ includeEmpty: false }, (row) => {
        const vals = (row.values as unknown[]).slice(1).map((v) => {
          if (v == null) return "";
          if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: string }).text);
          if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result ?? "");
          return String(v);
        });
        out += vals.join(" | ") + "\n";
      });
    });
    return out;
  }
  if (file.type.startsWith("image/")) {
    return `[imagem enviada: ${file.name}] - extração textual indisponível, preencha manualmente abaixo se necessário.`;
  }
  return await file.text();
}

async function extractPdfTextWithAiImages(
  pdf: import("pdfjs-dist").PDFDocumentProxy,
  total: number,
  onProgress?: (msg: string) => void,
) {
  if (typeof document === "undefined") return "";

  const batchSize = 2;
  const pages: string[] = [];
  for (let start = 1; start <= total; start += batchSize) {
    const end = Math.min(total, start + batchSize - 1);
    onProgress?.(`Lendo PDF escaneado com IA: páginas ${start}-${end} de ${total}…`);
    const rendered = [] as { pageNumber: number; imageBase64: string }[];

    for (let pageNumber = start; pageNumber <= end; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) continue;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      rendered.push({
        pageNumber,
        imageBase64: canvas.toDataURL("image/jpeg", 0.72).split(",")[1] || "",
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }

    if (rendered.length > 0) {
      const result = await extractPdfPageImages({ data: { pages: rendered } });
      if (result.ok && result.text) pages.push(result.text);
    }
  }

  return pages.join("\n").trim();
}

async function extractPdfTextWithOcr(
  pdf: import("pdfjs-dist").PDFDocumentProxy,
  total: number,
  onProgress?: (msg: string) => void,
) {
  if (typeof document === "undefined") return "";

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", undefined, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        onProgress?.(`OCR em andamento… ${Math.round((m.progress || 0) * 100)}%`);
      }
    },
  });

  const pages: string[] = [];
  try {
    for (let i = 1; i <= total; i++) {
      onProgress?.(`Aplicando OCR na página ${i} de ${total}…`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) continue;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const result = await worker.recognize(canvas);
      pages.push(result.data.text || "");
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await worker.terminate();
  }

  return pages.join("\n").trim();
}
