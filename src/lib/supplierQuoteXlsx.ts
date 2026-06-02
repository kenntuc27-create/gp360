import ExcelJS from "exceljs";
import { TIPO_LOGO, TIPO_NOME, type ExportBid, type ExportCompany, type ExportItem } from "./exporters";
import { fmtDate } from "./format";
import { loadCompany } from "./proposalPdf";

/** DTO restrito enviado ao fornecedor — NUNCA contém dados estratégicos internos
 *  (valor edital, custo, margem, lucro, preço de venda). */
export interface FornecedorExportItem {
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  marca?: string;
  observacao?: string;
}

const CAMPOS_PROIBIDOS_FORNECEDOR = [
  "valor_unitario", "valor_total", "valor_licitacao", "valor_licitacao_unitario",
  "valor_licitacao_total", "valor_estimado", "valor_referencia",
  "custo", "custo_unitario", "preco_venda", "preco_venda_manual", "preco_modo",
  "margem", "margin_pct", "lucro", "disputar", "best_supplier_cost",
];

/** Constrói DTO seguro p/ fornecedor a partir de itens internos.
 *  Remove campos estratégicos e bloqueia se algum proibido permanecer. */
export function construirItensDeExportacao(
  items: ReadonlyArray<Record<string, unknown>>,
): FornecedorExportItem[] {
  const safe: FornecedorExportItem[] = items.map((it) => ({
    item_number: Number(it.item_number) || 0,
    descricao: String(it.descricao ?? ""),
    unidade: String(it.unidade ?? "UN"),
    quantidade: Number(it.quantidade) || 0,
    marca: it.marca ? String(it.marca) : "",
    observacao: it.observacao ? String(it.observacao) : "",
  }));
  // Validação final — defesa em profundidade.
  for (const row of safe) {
    for (const k of Object.keys(row)) {
      if (CAMPOS_PROIBIDOS_FORNECEDOR.includes(k)) {
        const msg = `[SEGURANÇA] Campo proibido "${k}" no DTO de fornecedor — exportação bloqueada.`;
        console.error(msg, row);
        throw new Error(msg);
      }
    }
  }
  return safe;
}

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

async function fetchImage(url?: string): Promise<{ buf: ArrayBuffer; ext: "png" | "jpeg" } | null> {
  const target = url && url.trim() ? url : "/logo-empreendimentos.png";
  try {
    const r = await fetch(target);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const ext = target.toLowerCase().endsWith(".png") ? "png" : "jpeg";
    return { buf, ext };
  } catch { return null; }
}

/**
 * Gera Excel profissional para envio ao fornecedor.
 * 2 abas: COTAÇÃO FORNECEDOR + INSTRUÇÕES.
 * Retorna o Blob (para anexar/enviar) além de baixar localmente.
 */
export async function exportSupplierQuoteXlsx(
  bid: ExportBid,
  items: ExportItem[] | FornecedorExportItem[],
  company: ExportCompany,
  opts: { download?: boolean } = { download: true },
): Promise<{ blob: Blob; filename: string }> {
  // 🔒 Defesa em profundidade: sempre sanitiza antes de gerar XLSX,
  // bloqueia se algum campo estratégico vazar.
  const itemsSafe = construirItensDeExportacao(items as unknown as ReadonlyArray<Record<string, unknown>>);

  const wb = new ExcelJS.Workbook();
  wb.creator = company.company_name || "Cotação";
  wb.created = new Date();

  const primary = (company.primary_color || "#0F3460").replace("#", "").toUpperCase().padStart(6, "0");
  const tipoLogo = TIPO_LOGO[bid.tipo_cotacao || "empreendimentos"] || "/logo-empreendimentos.png";
  const nomeEmpresa = TIPO_NOME[bid.tipo_cotacao || "empreendimentos"] || company.company_name;

  // ===== ABA 1: COTAÇÃO FORNECEDOR =====
  const ws = wb.addWorksheet("COTAÇÃO FORNECEDOR", {
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: false, state: "frozen", ySplit: 9 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });

  ws.columns = [
    { width: 8 },   // A item
    { width: 55 },  // B descrição
    { width: 10 },  // C un
    { width: 12 },  // D qtd
    { width: 22 },  // E marca/modelo
    { width: 18 },  // F valor unit
    { width: 18 },  // G valor total
    { width: 16 },  // H prazo entrega
  ];

  // Logo
  try {
    const img = await fetchImage(tipoLogo);
    if (img) {
      const id = wb.addImage({ buffer: img.buf, extension: img.ext });
      ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 65 } });
    }
  } catch (err) { console.warn("Logo:", err); }

  // Cabeçalho empresa
  const compInfo = await loadCompany((bid.tipo_cotacao || "empreendimentos") as "empreendimentos" | "medicamentos");
  ws.mergeCells("B1:H1");
  const c1 = ws.getCell("B1");
  c1.value = nomeEmpresa;
  c1.font = { bold: true, size: 18, color: { argb: "FF" + primary } };
  c1.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;

  ws.mergeCells("B2:H2");
  ws.getCell("B2").value = compInfo?.razao_social || "";
  ws.getCell("B2").font = { bold: true, size: 10, color: { argb: "FF333333" } };

  ws.mergeCells("B3:H3");
  ws.getCell("B3").value = [
    compInfo?.cnpj && `CNPJ: ${compInfo.cnpj}`,
    compInfo?.inscricao_estadual && `IE: ${compInfo.inscricao_estadual}`,
    compInfo?.endereco,
    compInfo?.cidade && `${compInfo.cidade}/${compInfo.estado || ""}`,
    compInfo?.telefone || company.phone,
    compInfo?.email || company.email,
  ].filter(Boolean).join("  ·  ");
  ws.getCell("B3").font = { size: 9, color: { argb: "FF555555" } };
  ws.getRow(3).height = 14;

  // Faixa título
  ws.mergeCells("A4:H4");
  const t = ws.getCell("A4");
  t.value = "SOLICITAÇÃO DE COTAÇÃO AO FORNECEDOR";
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
  ws.getRow(4).height = 28;

  // Bloco info licitação
  const info: [string, string][] = [
    ["Órgão:", bid.orgao || "-"],
    ["Processo:", bid.processo || "-"],
    ["Objeto:", bid.objeto || "-"],
    ["Data envio:", fmtDate(new Date())],
  ];
  let r = 5;
  for (const [k, v] of info) {
    ws.mergeCells(`A${r}:B${r}`);
    const kc = ws.getCell(`A${r}`);
    kc.value = k; kc.font = { bold: true, size: 10 };
    kc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FA" } };
    ws.mergeCells(`C${r}:H${r}`);
    const vc = ws.getCell(`C${r}`);
    vc.value = v; vc.font = { size: 10 };
    vc.alignment = { wrapText: true, vertical: "middle" };
    ws.getRow(r).height = 18;
    r++;
  }
  ws.getRow(r).height = 6; r++;

  // Cabeçalho tabela
  const headers = ["ITEM", "DESCRIÇÃO", "UN.", "QTD.", "MARCA / MODELO", "VALOR UNIT. (R$)", "VALOR TOTAL (R$)", "PRAZO ENTREGA"];
  const hr = ws.getRow(r);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  hr.height = 26;
  r++;

  const startData = r;
  for (const it of itemsSafe) {
    const row = ws.getRow(r);
    row.values = [
      it.item_number,
      it.descricao,
      it.unidade || "",
      Number(it.quantidade) || 0,
      it.marca || "",
      null, // valor unitário (fornecedor preenche)
      { formula: `D${r}*F${r}` },
      "",
    ];
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).alignment = { vertical: "middle", wrapText: true };
    row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
    row.getCell(4).numFmt = "#,##0.##";
    row.getCell(6).numFmt = '"R$" #,##0.00;[Red]"R$" #,##0.00;"-"';
    row.getCell(7).numFmt = '"R$" #,##0.00;[Red]"R$" #,##0.00;"-"';
    row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } }; // amarelo claro = preencher
    row.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
    row.eachCell((c) => {
      c.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    });
    row.height = Math.max(22, Math.min(80, 18 + Math.floor((it.descricao?.length || 0) / 55) * 14));
    // listrado
    if ((r - startData) % 2 === 1) {
      [1, 2, 3, 4, 5].forEach((ci) => {
        const cell = row.getCell(ci);
        if (!cell.fill || (cell.fill as any).fgColor?.argb !== "FFFFF9C4") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFBFD" } };
        }
      });
    }
    r++;
  }

  // Total geral
  const totalRow = ws.getRow(r);
  ws.mergeCells(`A${r}:F${r}`);
  const tc = totalRow.getCell(1);
  tc.value = "TOTAL GERAL DA PROPOSTA";
  tc.alignment = { horizontal: "right", vertical: "middle" };
  tc.font = { bold: true, size: 11 };
  tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F7" } };
  totalRow.getCell(7).value = { formula: `SUM(G${startData}:G${r - 1})` };
  totalRow.getCell(7).numFmt = '"R$" #,##0.00';
  totalRow.getCell(7).font = { bold: true, size: 11 };
  totalRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F7" } };
  totalRow.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F7" } };
  totalRow.height = 24;
  for (let i = 1; i <= 8; i++) {
    totalRow.getCell(i).border = { top: { style: "medium" }, bottom: { style: "medium" } };
  }
  r += 2;

  // Dados do fornecedor
  ws.mergeCells(`A${r}:H${r}`);
  const fh = ws.getCell(`A${r}`);
  fh.value = "DADOS DO FORNECEDOR";
  fh.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  fh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
  fh.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 22;
  r++;
  const fornFields: [string, string][] = [
    ["Razão Social:", ""],
    ["CNPJ:", ""],
    ["Contato:", ""],
    ["Telefone / WhatsApp:", ""],
    ["E-mail:", ""],
    ["Validade da proposta:", ""],
    ["Condições de pagamento:", ""],
  ];
  for (const [k, v] of fornFields) {
    ws.mergeCells(`A${r}:B${r}`);
    const kc = ws.getCell(`A${r}`);
    kc.value = k; kc.font = { bold: true, size: 10 };
    kc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FA" } };
    ws.mergeCells(`C${r}:H${r}`);
    ws.getCell(`C${r}`).value = v;
    ws.getCell(`C${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
    ws.getRow(r).height = 22;
    r++;
  }

  // ===== ABA 2: INSTRUÇÕES =====
  const ws2 = wb.addWorksheet("INSTRUÇÕES", {
    views: [{ showGridLines: false }],
  });
  ws2.columns = [{ width: 4 }, { width: 100 }];

  ws2.mergeCells("A1:B1");
  const it1 = ws2.getCell("A1");
  it1.value = "INSTRUÇÕES DE PREENCHIMENTO";
  it1.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  it1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
  it1.alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(1).height = 30;

  const instrucoes: string[] = [
    "Preencha apenas as células destacadas em amarelo.",
    "Coluna VALOR UNIT.: informe o preço por unidade (R$). O VALOR TOTAL é calculado automaticamente.",
    "Coluna MARCA / MODELO: informe a marca e/ou modelo ofertado quando aplicável.",
    "Coluna PRAZO ENTREGA: informe o prazo em dias úteis para cada item, se variar.",
    "Não altere a quantidade, descrição ou unidade — esses dados vêm do edital.",
    "Preencha o bloco DADOS DO FORNECEDOR ao final da aba COTAÇÃO FORNECEDOR.",
    "Salve o arquivo e devolva por WhatsApp ou e-mail respondendo à mensagem enviada.",
    "Em caso de dúvida sobre especificação, entre em contato pelo telefone informado.",
  ];

  let rr = 3;
  instrucoes.forEach((txt, i) => {
    ws2.getCell(`A${rr}`).value = `${i + 1}.`;
    ws2.getCell(`A${rr}`).font = { bold: true, size: 11, color: { argb: "FF" + primary } };
    ws2.getCell(`A${rr}`).alignment = { vertical: "top", horizontal: "right" };
    ws2.getCell(`B${rr}`).value = txt;
    ws2.getCell(`B${rr}`).font = { size: 11 };
    ws2.getCell(`B${rr}`).alignment = { wrapText: true, vertical: "top" };
    ws2.getRow(rr).height = 28;
    rr++;
  });

  rr += 1;
  ws2.mergeCells(`A${rr}:B${rr}`);
  const pz = ws2.getCell(`A${rr}`);
  const prazoEnvio = bid.data_encerramento_propostas || bid.data_abertura;
  pz.value = prazoEnvio
    ? `PRAZO PARA ENVIO DA COTAÇÃO: até ${fmtDate(prazoEnvio)}`
    : "PRAZO PARA ENVIO DA COTAÇÃO: o quanto antes — preferencialmente em até 48h.";
  pz.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  pz.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC0392B" } };
  pz.alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(rr).height = 28;

  rr += 2;
  ws2.mergeCells(`A${rr}:B${rr}`);
  ws2.getCell(`A${rr}`).value = `Contato: ${nomeEmpresa} — ${[company.phone, company.email].filter(Boolean).join(" · ")}`;
  ws2.getCell(`A${rr}`).font = { italic: true, size: 10, color: { argb: "FF555555" } };
  ws2.getCell(`A${rr}`).alignment = { horizontal: "center" };

  // Gera blob
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const filename = `cotacao_${(bid.processo || bid.orgao || "edital").replace(/\W+/g, "_")}.xlsx`;
  if (opts.download !== false) triggerDownload(blob, filename);
  return { blob, filename };
}

/**
 * Mensagem padrão curta para acompanhar o arquivo.
 */
export function buildSupplierMessage(bid: ExportBid, company: ExportCompany): string {
  const nome = TIPO_NOME[bid.tipo_cotacao || "empreendimentos"] || company.company_name;
  const prazo = bid.data_encerramento_propostas || bid.data_abertura;
  const linhas = [
    `Olá! Segue solicitação de cotação da ${nome}.`,
    "",
    `Órgão: ${bid.orgao || "-"}`,
    `Processo: ${bid.processo || "-"}`,
    bid.objeto ? `Objeto: ${bid.objeto}` : "",
    prazo ? `Prazo para envio: ${fmtDate(prazo)}` : "",
    "",
    "Pedimos a gentileza de preencher a planilha em anexo (apenas as células em amarelo) e devolver por aqui.",
    "",
    "Obrigado!",
  ].filter(Boolean);
  return linhas.join("\n");
}

/**
 * Normaliza telefone para formato internacional E.164 (sem +) usado pelo wa.me.
 * Aceita: "(11) 99999-9999", "11999999999", "5511999999999", "+55 11 99999-9999".
 * Sempre retorna com DDI 55 (Brasil) quando não vier outro DDI.
 */
export function normalizePhoneForWhatsApp(raw?: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // Já tem DDI (12-13 dígitos começando com 55, ou outro país com 11+)
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  if (digits.length >= 11 && !digits.startsWith("55") && digits.length > 11) return digits;
  // Brasil sem DDI: 10 (fixo) ou 11 (celular) dígitos
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

/** Detecta se está em mobile (iOS/Android). */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** URL pública do WhatsApp (apenas para mobile / botões "Abrir no app"). */
export function buildWhatsAppUrl(phone: string | undefined, message: string): string {
  const num = normalizePhoneForWhatsApp(phone);
  const text = encodeURIComponent(message);
  return num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** Abre o WhatsApp evitando domínios bloqueados pela rede.
 *  - Mobile: abre wa.me em nova aba (vai direto pro app).
 *  - Desktop: dispara o protocolo nativo `whatsapp://` (WhatsApp Desktop), SEM
 *    abrir aba para web.whatsapp.com / api.whatsapp.com (firewall corporativo
 *    bloqueia → ERR_BLOCKED_BY_RESPONSE). Sempre copia mensagem + número como fallback. */
export async function openWhatsApp(phone: string | undefined, message: string): Promise<boolean> {
  const num = normalizePhoneForWhatsApp(phone);
  const fullText = num ? `${message}\n\n📱 Número: +${num}` : message;
  await copyToClipboard(fullText);

  if (isMobileDevice()) {
    try {
      const win = window.open(buildWhatsAppUrl(phone, message), "_blank", "noopener,noreferrer");
      return !!win;
    } catch { return false; }
  }

  // Desktop: dispara protocolo nativo via clique programático em <a>.
  // Iframe oculto não funciona mais no Chrome moderno; <a>.click() preserva o gesto
  // do usuário, que é exigido pelo navegador para abrir protocolos custom (whatsapp://).
  const text = encodeURIComponent(message);
  const native = num ? `whatsapp://send?phone=${num}&text=${text}` : `whatsapp://send?text=${text}`;
  try {
    const a = document.createElement("a");
    a.href = native;
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
    return true;
  } catch { return false; }
}


/** Copia texto para a área de transferência com fallback robusto. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallback abaixo */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export async function shareSupplierQuote(
  channel: "whatsapp" | "email",
  target: { phone?: string; email?: string },
  bid: ExportBid,
  items: ExportItem[] | FornecedorExportItem[],
  company: ExportCompany,
) {
  const { blob, filename } = await exportSupplierQuoteXlsx(bid, items, company, { download: true });
  const message = buildSupplierMessage(bid, company);

  // Tenta compartilhar como anexo se o navegador suportar (mobile)
  const file = new File([blob], filename, { type: blob.type });
  const navAny = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (channel === "whatsapp" && navAny.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: message, title: "Cotação" });
      return;
    } catch { /* fallback abaixo */ }
  }

  if (channel === "whatsapp") {
    await openWhatsApp(target.phone, `${message}\n\n📎 Anexe a planilha: ${filename} (já baixada).`);
    return;
  }

  if (channel === "email") {
    const to = target.email || "";
    const subject = `Solicitação de cotação — ${bid.processo || bid.orgao || ""}`.trim();
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message + "\n\n[Anexe o arquivo " + filename + " que foi baixado.]")}`;
    window.location.href = url;
  }
}
