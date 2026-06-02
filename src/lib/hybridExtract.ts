// Pipeline híbrido de extração (browser-side).
// 1) Extrai texto+coordenadas do PDF com pdfjs-dist
// 2) Reconstrói tabelas por linhas
// 3) Aplica regex/heurísticas para montar itens
// 4) Calcula score de confiança e flag por item
//
// IA é acionada APENAS quando necessário (item, bloco ou documento) via
// `aiAssistItems` — server function leve, em src/lib/aiAssistExtract.functions.ts
import { aiAssistItems, aiAssistHeader } from "@/lib/aiAssistExtract.functions";

// ==================== Tipos ====================
export type ExtractionMethod = "regex" | "ia_item" | "ia_bloco" | "ia_documento" | "manual";

export interface HybridItem {
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  marca: string;
  status: "ok" | "pendente" | "invalido";
  extraction_method: ExtractionMethod;
  extraction_score: number;
  extraction_reason: string;
}

export interface HybridHeader {
  orgao: string;
  uasg: string;
  processo: string;
  objeto: string;
  modalidade: string;
  data_abertura: string;
  data_inicio_propostas: string;
  data_encerramento_propostas: string;
  data_limite_entrega: string;
  prazo_entrega: string;
  local_entrega: string;
}

export interface HybridResult {
  header: HybridHeader;
  items: HybridItem[];
  globalScore: number;          // 0..100
  method: "hibrido" | "ia_fallback";
  rawText: string;
  log: string[];
}

// ==================== PDF → linhas com coordenadas ====================
type PdfJsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJsModule> | null = null;
async function getPdfJs(): Promise<PdfJsModule> {
  if (typeof window === "undefined") throw new Error("PDF parsing só no navegador.");
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

interface PdfLine { y: number; text: string; }
interface ProductAnchor {
  idx: number;
  item_number: number;
  code: string;
  unidade: string;
  quantidade: number;
  inlineDesc: string;
  consumesNextItemLine?: boolean;
}

async function pdfToLines(file: File, onProgress?: (msg: string) => void): Promise<PdfLine[]> {
  const buf = await file.arrayBuffer();
  const pdfjsLib = await getPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: buf, disableFontFace: true, disableAutoFetch: true }).promise;
  const total = pdf.numPages;
  const allLines: PdfLine[] = [];
  let yOffset = 0;
  for (let p = 1; p <= total; p++) {
    onProgress?.(`Lendo página ${p} de ${total}…`);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // Agrupa por Y (linha). pdfjs usa transform[5] como y.
    const buckets = new Map<number, { y: number; xs: { x: number; s: string }[] }>();
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const item = it as { str: string; transform: number[] };
      const s = item.str;
      if (!s.trim()) continue;
      // arredonda y p/ 1pt para tolerar pequenas diferenças
      const yRaw = Math.round(item.transform[5]);
      const x = item.transform[4];
      // tolerância de 2pt: bucket por y//2
      const yKey = Math.round(yRaw / 2) * 2;
      const b = buckets.get(yKey) || { y: yKey, xs: [] };
      b.xs.push({ x, s });
      buckets.set(yKey, b);
    }
    const sorted = Array.from(buckets.values()).sort((a, b) => b.y - a.y); // top→bottom
    for (const b of sorted) {
      b.xs.sort((a, c) => a.x - c.x);
      const text = b.xs.map((p) => p.s).join(" ").replace(/\s+/g, " ").trim();
      if (text) allLines.push({ y: yOffset + b.y, text });
    }
    yOffset += 100000; // separa páginas
    page.cleanup();
  }
  pdf.destroy();
  return allLines;
}

// ==================== Regex / heurísticas ====================
const UNITS = ["UND","UNID","UN","CX","KG","LT","L","M2","M3","M","PCT","PAR","CAR","FRC","SV","SAC","FR","KIT","RL","ML","GL","G","DZ"];
const UNITS_RE = new RegExp(`\\b(${UNITS.join("|")})\\b`, "i");

function parseNumberBR(s: string): number {
  if (!s) return 0;
  // 1.234,56 -> 1234.56  | 1,234.56 -> 1234.56 | 1234,56 -> 1234.56
  const t = s.trim().replace(/[R$\s]/g, "");
  // formato BR: vírgula é decimal e ponto é milhar
  if (/,\d{1,2}$/.test(t)) {
    return parseFloat(t.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return parseFloat(t.replace(/,/g, "")) || 0;
}

const NUM_RE = "[\\d\\.\\,]+";
// item: começa com "1", "1.", "001" etc. Aceita nº até 5 dígitos.
const LEAD_NUM_RE = /^(\d{1,5})[\.\)\-]?\s+/;

interface ParsedRow {
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
}

// Padrões de texto jurídico/preâmbulo que NÃO são itens de tabela
const LEGAL_RE = /\b(Lei|art(?:igo)?\.?|Decreto|Portaria|inciso|par[áa]grafo|n[ºo°]\s*\d|de\s+20\d{2}|conforme|nos\s+termos)\b/i;
const PRODUCT_ROW_RE = new RegExp(`^(\\d{1,4})\\s+(\\d{3,10})(?:\\s+(.+?))?\\s+\\b(${UNITS.join("|")})\\b\\s+(${NUM_RE})(?:\\s+${NUM_RE})?\\s*$`, "i");
const CODE_UNIT_QTY_RE = new RegExp(`^(\\d{3,10})(?:\\s+(.+?))?\\s+\\b(${UNITS.join("|")})\\b\\s+(${NUM_RE})(?:\\s+${NUM_RE})?\\s*$`, "i");
const ITEM_ONLY_RE = /^\d{1,4}$/;
const SECTION_HEADING_RE = /^\d+(?:\.\d+)*\s*(?:[-–.]\s*)?(?:JUSTIFICATIVA|OBRIGA[ÇC][ÕO]ES|PRAZO|LOCAL|FORMA|CRIT[ÉE]RIO|CONDI[ÇC][ÕO]ES|PAGAMENTO|SAN[ÇC][ÕO]ES|DA\s+CONTRATA[ÇC][ÃA]O|DO\s+OBJETO)\b/i;

function isTableNoise(text: string): boolean {
  const t = text.trim();
  return !t ||
    /^N$|^°$|^N\s*°$/i.test(t) ||
    /^(COD\s+MV|ITEM|LOTE\s|DESCRI[ÇC][ÃA]O|ESPECIFICA[ÇC][ÃA]O)/i.test(t) ||
    /^(GOVERNO|FUNDA[ÇC][ÃA]O|GERENCIA|TERMO\s+DE\s+REFERENCIA|TR\s+FSCMP|Processo:|Acessado\s+por:|P[áa]gina:)/i.test(t);
}

function isDescriptionTerminal(text: string): boolean {
  return /(?:SA[ÚU]DE\s*\/\s*ANVISA|ANVISA\.?|REGISTRO\s+NO\s+MINIST[ÉE]RIO)/i.test(text);
}

function tryParseItemLine(line: string): ParsedRow | null {
  const m = line.match(LEAD_NUM_RE);
  if (!m) return null;
  const item_number = parseInt(m[1], 10);
  if (item_number <= 0 || item_number > 9999) return null;
  let rest = line.slice(m[0].length).trim();
  if (rest.length < 5) return null;
  // Rejeita linhas de texto jurídico (ex: "75 da Lei nº 14.133, de 2021")
  if (LEGAL_RE.test(rest)) return null;

  // tenta extrair valor unitário (último número monetário razoável)
  let valor_unitario = 0;
  const moneyMatches = [...rest.matchAll(new RegExp(NUM_RE, "g"))];
  // procura unidade
  const uMatch = rest.match(UNITS_RE);
  let unidade = uMatch ? uMatch[1].toUpperCase() : "UN";

  // estratégia: depois da unidade vem qtd e valores
  let quantidade = 0;
  if (uMatch) {
    const after = rest.slice((uMatch.index || 0) + uMatch[0].length).trim();
    const nums = [...after.matchAll(new RegExp(NUM_RE, "g"))].map((x) => parseNumberBR(x[0]));
    if (nums.length >= 1) quantidade = nums[0];
    if (nums.length >= 2) valor_unitario = nums[nums.length - 1];
    // descrição = tudo antes da unidade
    rest = rest.slice(0, uMatch.index).trim();
  } else if (moneyMatches.length >= 2) {
    // Sem unidade explícita: assume últimos dois números = qtd, valor
    quantidade = parseNumberBR(moneyMatches[moneyMatches.length - 2][0]);
    valor_unitario = parseNumberBR(moneyMatches[moneyMatches.length - 1][0]);
    const lastIdx = moneyMatches[moneyMatches.length - 2].index || rest.length;
    rest = rest.slice(0, lastIdx).trim();
  } else {
    return null;
  }

  // limpa descrição: remove restos numéricos no fim
  const descricao = rest.replace(/[\s\-\.]+$/, "").trim();
  if (descricao.length < 3) return null;
  // Rejeita descrição muito curta (ex: "da Lei nº")
  if (descricao.length < 10 && LEGAL_RE.test(descricao)) return null;
  // quantidade fracionária estranha (14,133 / 8,666) é quase sempre nº de lei
  if (quantidade > 0 && quantidade < 1000 && !Number.isInteger(quantidade)) {
    const frac = quantidade - Math.floor(quantidade);
    if (frac !== 0.5 && frac !== 0.25 && frac !== 0.75) return null;
  }
  // valor que parece ano (1990–2099) → zera
  if (valor_unitario >= 1900 && valor_unitario <= 2099 && Number.isInteger(valor_unitario)) {
    valor_unitario = 0;
  }

  return { item_number, descricao, unidade, quantidade, valor_unitario };
}

function detectProductAnchors(lines: PdfLine[]): ProductAnchor[] {
  const anchors: ProductAnchor[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.trim();
    if (SECTION_HEADING_RE.test(text)) break;
    let m = text.match(PRODUCT_ROW_RE);
    if (m) {
      anchors.push({
        idx: i,
        item_number: parseInt(m[1], 10),
        code: m[2],
        inlineDesc: (m[3] || "").trim(),
        unidade: m[4].toUpperCase(),
        quantidade: parseNumberBR(m[5]),
      });
      continue;
    }

    m = text.match(CODE_UNIT_QTY_RE);
    const prev = lines[i - 1]?.text.trim() || "";
    const next = lines[i + 1]?.text.trim() || "";
    if (m && ITEM_ONLY_RE.test(prev)) {
      anchors.push({
        idx: i,
        item_number: parseInt(prev, 10),
        code: m[1],
        inlineDesc: (m[2] || "").trim(),
        unidade: m[3].toUpperCase(),
        quantidade: parseNumberBR(m[4]),
      });
      continue;
    }

    if (m && ITEM_ONLY_RE.test(next)) {
      anchors.push({
        idx: i,
        item_number: parseInt(next, 10),
        code: m[1],
        inlineDesc: (m[2] || "").trim(),
        unidade: m[3].toUpperCase(),
        quantidade: parseNumberBR(m[4]),
        consumesNextItemLine: true,
      });
    }
  }

  const byNumber = new Map<number, ProductAnchor>();
  for (const a of anchors) {
    if (a.item_number <= 0 || a.item_number > 9999 || a.quantidade <= 0) continue;
    const prev = byNumber.get(a.item_number);
    if (!prev || a.idx < prev.idx) byNumber.set(a.item_number, a);
  }
  return Array.from(byNumber.values()).sort((a, b) => a.idx - b.idx);
}

function buildDescriptionForAnchor(lines: PdfLine[], anchors: ProductAnchor[], pos: number): string {
  const a = anchors[pos];
  const prevAnchorEnd = pos > 0
    ? anchors[pos - 1].idx + (anchors[pos - 1].consumesNextItemLine ? 2 : 1)
    : Math.max(0, a.idx - 12);
  const nextAnchorIdx = anchors[pos + 1]?.idx ?? lines.length;
  const parts: string[] = [];

  const collectBefore = (from: number, to: number) => {
    const before: string[] = [];
    for (let i = to; i >= from; i--) {
      const t = lines[i]?.text.trim() || "";
      if (!t || isTableNoise(t) || PRODUCT_ROW_RE.test(t) || CODE_UNIT_QTY_RE.test(t) || ITEM_ONLY_RE.test(t)) continue;
      if (SECTION_HEADING_RE.test(t)) break;
      before.unshift(t);
      if (/^(SONDA|CATETER|SERINGA|AGULHA|EQUIPO|EXTENSOR|DRENO|BOLSA|LUVA|COMPRESSA|MATERIAL)\b/i.test(t)) break;
      if (before.length >= 8) break;
    }
    parts.push(...before);
  };

  collectBefore(prevAnchorEnd, a.idx - 1);
  if (a.inlineDesc) parts.push(a.inlineDesc);

  for (let i = a.idx + 1; i < nextAnchorIdx; i++) {
    if (a.consumesNextItemLine && i === a.idx + 1) continue;
    const t = lines[i].text.trim();
    if (!t || isTableNoise(t) || PRODUCT_ROW_RE.test(t) || CODE_UNIT_QTY_RE.test(t) || ITEM_ONLY_RE.test(t)) continue;
    if (SECTION_HEADING_RE.test(t)) break;
    parts.push(t);
    if (isDescriptionTerminal(t)) break;
  }

  return parts.join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim()
    .slice(0, 1600);
}

function parseAnchoredProductRows(lines: PdfLine[]): ParsedRow[] {
  const anchors = detectProductAnchors(lines);
  if (anchors.length < 2) return [];
  return anchors.map((a, pos) => ({
    item_number: a.item_number,
    descricao: [a.code, buildDescriptionForAnchor(lines, anchors, pos)].filter(Boolean).join(" ").trim(),
    unidade: a.unidade,
    quantidade: a.quantidade,
    valor_unitario: 0,
  })).filter((it) => it.descricao.length >= 10);
}

function findTableRegion(lines: PdfLine[]): { startIdx: number; endIdx: number } {
  const anchors = detectProductAnchors(lines);
  if (anchors.length >= 2) {
    let startIdx = Math.max(0, anchors[0].idx - 12);
    for (let i = anchors[0].idx; i >= 0; i--) {
      if (/(COD\s+MV|ESPECIFICA[ÇC][ÃA]O\s+DO\s+MATERIAL|DESCRI[ÇC][ÃA]O.*(UND|UNID|QUANT)|LOTE\s+[ÚU]NICO)/i.test(lines[i].text)) {
        startIdx = i;
      }
    }
    let endIdx = Math.min(lines.length, anchors[anchors.length - 1].idx + 18);
    for (let i = anchors[anchors.length - 1].idx + 1; i < lines.length; i++) {
      if (SECTION_HEADING_RE.test(lines[i].text)) { endIdx = i; break; }
    }
    return { startIdx, endIdx };
  }

  // cabeçalho típico
  const headerIdx = lines.findIndex((l) =>
    /(item|lote)\b.*descri[çc][ãa]o.*(unid|und|qtd|quant)/i.test(l.text) ||
    /(COD\s+MV|ESPECIFICA[ÇC][ÃA]O\s+DO\s+MATERIAL).*(UND|QUANT)/i.test(l.text) ||
    /rela[çc][ãa]o\s+de\s+itens/i.test(l.text)
  );
  if (headerIdx < 0) return { startIdx: 0, endIdx: lines.length };
  // termina onde não houver mais linhas começando com número por 5+ linhas
  let lastItem = headerIdx;
  let gap = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (SECTION_HEADING_RE.test(lines[i].text)) break;
    if (LEAD_NUM_RE.test(lines[i].text)) { lastItem = i; gap = 0; }
    else { gap++; if (gap > 8 && i - lastItem > 8) break; }
  }
  return { startIdx: headerIdx, endIdx: Math.min(lines.length, lastItem + 3) };
}

function scoreItem(it: ParsedRow): { score: number; status: "ok" | "pendente" | "invalido"; reason: string } {
  let s = 0;
  const reasons: string[] = [];
  if (it.descricao.length >= 10) s += 35; else { s += 10; reasons.push("descrição curta"); }
  if (it.quantidade > 0) s += 30; else reasons.push("quantidade ausente");
  if (it.unidade && it.unidade !== "UN") s += 15; else s += 5;
  if (it.valor_unitario > 0) s += 20; // opcional, não é falha grave
  if (it.item_number > 0) s += 0; // já garantido
  const score = Math.min(100, s);
  let status: "ok" | "pendente" | "invalido" = "ok";
  if (it.quantidade <= 0 || it.descricao.length < 5) status = "pendente";
  if (it.descricao.length < 3) status = "invalido";
  return { score, status, reason: reasons.join("; ") };
}

// ==================== Header por regex ====================
function extractHeaderRegex(text: string): HybridHeader {
  const grab = (re: RegExp) => (text.match(re)?.[1] || "").trim();
  return {
    orgao: grab(/(?:[ÓO]rg[ãa]o|Unidade Compradora|Comprador)[:\s]+([^\n]{5,160})/i),
    uasg: grab(/UASG[:\s]+(\d{4,8})/i) || grab(/UG[:\s]+(\d{4,8})/i),
    processo: grab(/Processo(?:\s+Administrativo)?[:\s]+([\w\.\-\/]+)/i),
    objeto: grab(/Objeto[:\s]+([^\n]{10,400})/i),
    modalidade: grab(/(?:Modalidade|Forma)[:\s]+([^\n]{3,80})/i) || (text.match(/\b(Preg[ãa]o\s+Eletr[ôo]nico|Dispensa|Concorr[êe]ncia|Tomada\s+de\s+Pre[çc]os)\b/i)?.[1] || ""),
    data_abertura: grab(/(?:Data de Abertura|Abertura)[:\s]+(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i),
    data_inicio_propostas: grab(/(?:In[íi]cio\s+(?:de|para)?\s*propostas?|Recebimento\s+de\s+propostas)[:\s]+(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i),
    data_encerramento_propostas: grab(/(?:Encerramento|Fim)\s+(?:de|para)?\s*propostas?[:\s]+(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i),
    data_limite_entrega: grab(/(?:Data\s+limite\s+de\s+entrega|Prazo\s+de\s+entrega)[:\s]+([^\n]{3,120})/i),
    prazo_entrega: grab(/(?:Prazo\s+de\s+entrega)[:\s]+([^\n]{3,120})/i),
    local_entrega: grab(/(?:Local\s+de\s+entrega|Endere[çc]o\s+de\s+entrega)[:\s]+([^\n]{5,200})/i),
  };
}

// ==================== Pipeline principal ====================
export async function runHybridExtraction(
  file: File,
  opts: { onProgress?: (msg: string) => void; onLog?: (msg: string) => void } = {}
): Promise<HybridResult> {
  const { onProgress, onLog } = opts;
  const log: string[] = [];
  const trace = (m: string) => { log.push(m); onLog?.(m); };

  // ===== Etapa 1 — extração bruta =====
  onProgress?.("Lendo PDF (estrutura)…");
  const lines = await pdfToLines(file, onProgress);
  const rawText = lines.map((l) => l.text).join("\n");
  trace(`pdfjs: ${lines.length} linhas extraídas`);

  // ===== Etapa 2 — regex local =====
  onProgress?.("Estruturando itens por regra…");
  const { startIdx, endIdx } = findTableRegion(lines);
  trace(`tabela detectada entre linhas ${startIdx}-${endIdx}`);
  const tableLines = lines.slice(startIdx, endIdx);

  const items: HybridItem[] = [];
  const seen = new Set<number>();
  const anchoredRows = parseAnchoredProductRows(tableLines);
  if (anchoredRows.length >= 2) {
    trace(`âncoras produto: ${anchoredRows.length} itens detectados por código/unidade/quantidade`);
    for (const parsed of anchoredRows) {
      if (seen.has(parsed.item_number)) continue;
      seen.add(parsed.item_number);
      const { score, status, reason } = scoreItem(parsed);
      items.push({
        ...parsed,
        marca: "",
        status,
        extraction_method: "regex",
        extraction_score: Math.max(score, 75),
        extraction_reason: reason,
      });
    }
  }
  // Pré-passo: agrupa linhas em "rows" — cada item começa quando encontramos
  // LEAD_NUM_RE; linhas seguintes sem LEAD_NUM_RE são continuação da descrição.
  type Row = { headLine: string; continuations: string[] };
  const rows: Row[] = [];
  let current: Row | null = null;
  for (const ln of anchoredRows.length >= 2 ? [] : tableLines) {
    const m = ln.text.match(LEAD_NUM_RE);
    const isLegal = LEGAL_RE.test(ln.text);
    if (m && !isLegal) {
      // valida que o número faz sentido como item (1..9999)
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 9999) {
        if (current) rows.push(current);
        current = { headLine: ln.text, continuations: [] };
        continue;
      }
    }
    if (current && ln.text.length > 2 && !isLegal) {
      // ignora linhas que parecem cabeçalho/total/rodapé
      if (!/^(total|subtotal|p[áa]gina|valor\s+global)/i.test(ln.text)) {
        current.continuations.push(ln.text);
      }
    }
  }
  if (current) rows.push(current);

  for (const row of rows) {
    // tenta a linha-cabeça; se houver continuações, anexa antes do parse para
    // que regex pegue unidade/qtd que possam estar na linha seguinte
    const merged = [row.headLine, ...row.continuations.slice(0, 6)].join(" ");
    const parsed = tryParseItemLine(merged) || tryParseItemLine(row.headLine);
    if (!parsed) continue;
    if (seen.has(parsed.item_number)) continue;
    seen.add(parsed.item_number);

    // Se descrição ficou muito curta mas há continuações, junta tudo como descrição.
    if (parsed.descricao.length < 25 && row.continuations.length > 0) {
      const extra = row.continuations.join(" ").replace(/\s+/g, " ").trim();
      // remove números/unidades soltos do final
      parsed.descricao = (parsed.descricao + " " + extra)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1000);
    }

    const { score, status, reason } = scoreItem(parsed);
    // descrição muito curta (provavelmente só código) → pendente
    const isShort = parsed.descricao.replace(/\D/g, "").length >= parsed.descricao.length * 0.7;
    const finalStatus = isShort && parsed.descricao.length < 30 ? "pendente" : status;
    items.push({
      ...parsed,
      marca: "",
      status: finalStatus,
      extraction_method: "regex",
      extraction_score: finalStatus === "pendente" ? Math.min(score, 55) : score,
      extraction_reason: finalStatus === "pendente" && isShort ? "descrição parece só código" : reason,
    });
  }
  items.sort((a, b) => a.item_number - b.item_number);
  trace(`regex: ${items.length} itens extraídos (de ${rows.length} linhas-cabeça)`);

  // Detecta gaps na numeração (1,2,3,5 → faltou 4): marca como sinal de que
  // o regex falhou e devemos escalar para IA.
  let hasGaps = false;
  if (items.length >= 2) {
    const nums = items.map((i) => i.item_number);
    const minN = Math.min(...nums);
    const maxN = Math.max(...nums);
    const expected = maxN - minN + 1;
    if (items.length < expected) {
      hasGaps = true;
      trace(`⚠️ gaps detectados: ${items.length}/${expected} itens (de ${minN} a ${maxN})`);
    }
  }

  // ===== Header por regex =====
  const headerText = lines.slice(0, Math.min(120, lines.length)).map((l) => l.text).join("\n");
  const header = extractHeaderRegex(headerText);
  const headerFields = Object.values(header).filter((v) => v && v.length > 0).length;
  trace(`header regex: ${headerFields}/11 campos preenchidos`);

  // ===== Score global =====
  const incompletes = items.filter((i) => i.status !== "ok").length;
  const incompletePct = items.length ? (incompletes / items.length) * 100 : 100;
  let globalScore = items.length === 0 ? 0
    : Math.round(items.reduce((s, i) => s + i.extraction_score, 0) / items.length);
  // header conta para o global
  globalScore = Math.round(globalScore * 0.7 + (headerFields / 11) * 100 * 0.3);
  trace(`score global: ${globalScore} | incompletos: ${incompletes}/${items.length} (${incompletePct.toFixed(0)}%)`);

  // ===== Etapa 3 — IA por escalonamento =====
  let method: "hibrido" | "ia_fallback" = "hibrido";

  // 3.0 Header incompleto → pede só o cabeçalho à IA (barato)
  if (headerFields < 5 && rawText.length > 100) {
    try {
      onProgress?.("Complementando cabeçalho com IA…");
      trace("ia_bloco: cabeçalho");
      const aiHdr = await aiAssistHeader({ data: { text: headerText.slice(0, 8000) } });
      if (aiHdr?.ok && aiHdr.data) {
        for (const k of Object.keys(header) as (keyof HybridHeader)[]) {
          if (!header[k] && aiHdr.data[k]) header[k] = aiHdr.data[k];
        }
      }
    } catch (e) {
      trace(`ia header falhou: ${(e as Error).message}`);
    }
  }

  // 3.1 Itens individuais incompletos (até 30%): manda trechos
  const incompleteItems = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => it.status === "pendente");

  if (incompleteItems.length > 0 && incompleteItems.length / items.length <= 0.3 && items.length > 0) {
    trace(`ia_item: corrigindo ${incompleteItems.length} item(ns) incompletos`);
    onProgress?.(`Corrigindo ${incompleteItems.length} itens com IA…`);
    // monta trechos: para cada item incompleto, pega 3 linhas antes/depois ao redor da linha original
    const snippets = incompleteItems.map(({ it }) => {
      const lineIdx = tableLines.findIndex((l) => new RegExp(`^${it.item_number}[\\.\\)\\-]?\\s+`).test(l.text));
      const start = Math.max(0, lineIdx - 1);
      const end = Math.min(tableLines.length, lineIdx + 3);
      return { item_number: it.item_number, snippet: tableLines.slice(start, end).map((l) => l.text).join("\n") };
    });
    try {
      const aiRes = await aiAssistItems({ data: { mode: "items", snippets } });
      if (aiRes?.ok && aiRes.items) {
        for (const fixed of aiRes.items) {
          const idx = items.findIndex((i) => i.item_number === fixed.item_number);
          if (idx < 0) continue;
          items[idx] = {
            ...items[idx],
            descricao: fixed.descricao || items[idx].descricao,
            unidade: fixed.unidade || items[idx].unidade,
            quantidade: fixed.quantidade || items[idx].quantidade,
            valor_unitario: fixed.valor_unitario ?? items[idx].valor_unitario,
            marca: fixed.marca || items[idx].marca,
            status: "ok",
            extraction_method: "ia_item",
            extraction_score: Math.max(items[idx].extraction_score, 80),
            extraction_reason: "",
          };
        }
      }
    } catch (e) {
      trace(`ia_item falhou: ${(e as Error).message}`);
    }
  }

  // 3.2 Bloco/tabela inteira — aciona se: >30% incompletos, há gaps na
  // numeração, ou >50% das descrições parecem só código (curtas).
  const shortDescPct = items.length
    ? items.filter((i) => i.descricao.length < 30).length / items.length
    : 0;
  const shouldRunBloco =
    items.length > 0 &&
    (incompleteItems.length / items.length > 0.3 || hasGaps || shortDescPct > 0.5);

  if (shouldRunBloco) {
    trace(`ia_bloco: tabela inteira (incompletos ${(incompleteItems.length / items.length * 100).toFixed(0)}%, gaps=${hasGaps}, descCurtas=${(shortDescPct * 100).toFixed(0)}%)`);
    onProgress?.("Reprocessando tabela com IA…");
    try {
      const tableText = tableLines.map((l) => l.text).join("\n").slice(0, 60000);
      const aiRes = await aiAssistItems({ data: { mode: "table", tableText } });
      if (aiRes?.ok && aiRes.items && aiRes.items.length >= items.length) {
        items.length = 0;
        for (const a of aiRes.items) {
          const { score, status } = scoreItem({
            item_number: a.item_number,
            descricao: a.descricao,
            unidade: a.unidade,
            quantidade: a.quantidade,
            valor_unitario: a.valor_unitario,
          });
          items.push({
            item_number: a.item_number,
            descricao: a.descricao,
            unidade: a.unidade || "UN",
            quantidade: a.quantidade || 1,
            valor_unitario: a.valor_unitario || 0,
            marca: a.marca || "",
            status,
            extraction_method: "ia_bloco",
            extraction_score: Math.max(score, 80),
            extraction_reason: "",
          });
        }
        items.sort((a, b) => a.item_number - b.item_number);
      }
    } catch (e) {
      trace(`ia_bloco falhou: ${(e as Error).message}`);
    }
  }

  // 3.3 Fallback documento completo: 0 itens OU score < 60 → caller deve disparar `extractEdital`
  if (items.length === 0 || globalScore < 60) {
    method = "ia_fallback";
    trace("⚠️ pipeline híbrido insuficiente — fallback IA documento recomendado");
  }

  // recalcula score final
  const finalScore = items.length === 0 ? 0
    : Math.round(items.reduce((s, i) => s + i.extraction_score, 0) / items.length * 0.7 + (headerFields / 11) * 100 * 0.3);

  return { header, items, globalScore: finalScore, method, rawText, log };
}
