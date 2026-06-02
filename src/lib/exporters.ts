import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtBRL, fmtDate } from "./format";
import { supabase } from "@/integrations/supabase/client";

interface CompanyInfo {
  razao_social?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
}

async function loadCompanyInfo(tipo: string): Promise<CompanyInfo | null> {
  try {
    const { data } = await supabase
      .from("companies")
      .select("razao_social, cnpj, inscricao_estadual, endereco, bairro, cidade, estado, cep, telefone, email")
      .eq("tipo", tipo)
      .maybeSingle();
    return (data as CompanyInfo) || null;
  } catch { return null; }
}

export interface ExportItem {
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  marca?: string;
  valor_unitario?: number;
  prazo?: string;
  observacao?: string;
}
export interface ExportBid {
  orgao: string;
  processo: string;
  objeto: string;
  modalidade?: string;
  data_abertura?: string;
  uasg?: string;
  data_inicio_propostas?: string;
  data_encerramento_propostas?: string;
  data_limite_entrega?: string;
  prazo_entrega?: string;
  local_entrega?: string;
  tipo_cotacao?: "empreendimentos" | "medicamentos";
}

export const TIPO_LOGO: Record<string, string> = {
  empreendimentos: "/logo-empreendimentos.png",
  medicamentos: "/logo-medicamentos.png",
};
export const TIPO_NOME: Record<string, string> = {
  empreendimentos: "Pará Empreendimentos",
  medicamentos: "Pará Medicamentos",
};
export interface ExportCompany {
  company_name: string;
  phone?: string;
  email?: string;
  city?: string;
  logo_url?: string;
  primary_color?: string;
  proposal_validity_days?: number;
}

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

function logoFor(bid: ExportBid, fallback?: string): string {
  const tipo = bid.tipo_cotacao || "empreendimentos";
  return TIPO_LOGO[tipo] || fallback || "/logo-empreendimentos.png";
}

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

export async function exportXlsx(bid: ExportBid, items: ExportItem[], company: ExportCompany) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cotação", { properties: { defaultRowHeight: 18 } });
  const primary = (company.primary_color || "#0F3460").replace("#", "").toUpperCase().padStart(6, "0");

  ws.columns = [
    { width: 8 }, { width: 50 }, { width: 10 }, { width: 12 },
    { width: 18 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 28 }
  ];

  // Logo (baseada no tipo de cotação) — tolerante a falhas
  try {
    const tipoLogo = logoFor(bid);
    const img = await fetchImage(tipoLogo);
    if (img) {
      const id = wb.addImage({ buffer: img.buf, extension: img.ext });
      ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 110, height: 60 } });
    }
  } catch (err) {
    console.warn("Logo não pôde ser inserida no Excel:", err);
  }

  const nomeEmpresa = TIPO_NOME[bid.tipo_cotacao || "empreendimentos"] || company.company_name;
  const compInfo = await loadCompanyInfo(bid.tipo_cotacao || "empreendimentos");
  ws.mergeCells("B1:I1");
  ws.getCell("B1").value = nomeEmpresa;
  ws.getCell("B1").font = { bold: true, size: 16, color: { argb: "FF" + primary } };
  ws.mergeCells("B2:I2");
  ws.getCell("B2").value = compInfo?.razao_social || "";
  ws.getCell("B2").font = { bold: true, size: 10, color: { argb: "FF333333" } };
  ws.mergeCells("B3:I3");
  ws.getCell("B3").value = [
    compInfo?.cnpj && `CNPJ: ${compInfo.cnpj}`,
    compInfo?.inscricao_estadual && `IE: ${compInfo.inscricao_estadual}`,
    compInfo?.endereco,
    compInfo?.cidade && `${compInfo.cidade}/${compInfo.estado || ""}`,
    compInfo?.telefone || company.phone,
    compInfo?.email || company.email,
  ].filter(Boolean).join("  ·  ");
  ws.getCell("B3").font = { size: 9, color: { argb: "FF555555" } };
  ws.getRow(1).height = 24; ws.getRow(2).height = 16; ws.getRow(3).height = 14;

  // Title
  ws.mergeCells("A4:I4");
  const t = ws.getCell("A4");
  t.value = "SOLICITAÇÃO DE COTAÇÃO";
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
  ws.getRow(4).height = 26;

  // Bid info
  const info: [string, string][] = [
    ["Órgão:", bid.orgao || "-"],
    ["Processo:", bid.processo || "-"],
    ["Objeto:", bid.objeto || "-"],
    ["Modalidade:", bid.modalidade || "-"],
    ["Data:", bid.data_abertura || fmtDate(new Date())],
  ];
  let r = 6;
  for (const [k, v] of info) {
    ws.getCell(`A${r}`).value = k;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.mergeCells(`B${r}:I${r}`);
    ws.getCell(`B${r}`).value = v;
    r++;
  }
  r++;

  // Table header
  const headers = ["ITEM", "DESCRIÇÃO", "UN.", "QTD.", "MARCA", "V. UNITÁRIO", "V. TOTAL", "PRAZO", "OBSERVAÇÃO"];
  const headerRow = ws.getRow(r);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  headerRow.height = 22;
  r++;

  const startData = r;
  for (const it of items) {
    const row = ws.getRow(r);
    row.values = [
      it.item_number,
      it.descricao,
      it.unidade,
      Number(it.quantidade) || 0,
      it.marca || "",
      Number(it.valor_unitario) || 0,
      { formula: `D${r}*F${r}` },
      it.prazo || "",
      it.observacao || "",
    ];
    row.getCell(4).numFmt = "#,##0.##";
    row.getCell(6).numFmt = '"R$" #,##0.00';
    row.getCell(7).numFmt = '"R$" #,##0.00';
    row.eachCell((c) => {
      c.border = { top: { style: "thin", color: { argb: "FFDDDDDD" } }, bottom: { style: "thin", color: { argb: "FFDDDDDD" } }, left: { style: "thin", color: { argb: "FFDDDDDD" } }, right: { style: "thin", color: { argb: "FFDDDDDD" } } };
      c.alignment = { vertical: "middle", wrapText: true };
    });
    r++;
  }

  // Total
  const totalRow = ws.getRow(r);
  ws.mergeCells(`A${r}:F${r}`);
  totalRow.getCell(1).value = "TOTAL GERAL";
  totalRow.getCell(1).alignment = { horizontal: "right" };
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(7).value = { formula: `SUM(G${startData}:G${r - 1})` };
  totalRow.getCell(7).numFmt = '"R$" #,##0.00';
  totalRow.getCell(7).font = { bold: true };
  totalRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
  r += 2;

  // Footer
  ws.mergeCells(`A${r}:I${r}`);
  ws.getCell(`A${r}`).value = `Validade da proposta: ${company.proposal_validity_days || 10} dias`;
  ws.getCell(`A${r}`).font = { italic: true, size: 10 };
  r += 3;
  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = "_______________________________________";
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
  r++;
  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = "Assinatura do Fornecedor";
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
  ws.getCell(`A${r}`).font = { size: 10 };

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `cotacao_${(bid.processo || "edital").replace(/\W+/g, "_")}.xlsx`);
}

export async function exportPdf(bid: ExportBid, items: ExportItem[], company: ExportCompany) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const primary = company.primary_color || "#0F3460";
  const pageW = doc.internal.pageSize.getWidth();

  // Logo (baseada no tipo de cotação)
  try {
    const logoUrl = logoFor(bid);
    const r = await fetch(logoUrl);
    if (r.ok) {
      const blob = await r.blob();
      const dataUrl: string = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.readAsDataURL(blob);
      });
      const fmt = dataUrl.includes("png") ? "PNG" : "JPEG";
      doc.addImage(dataUrl, fmt, 10, 6, 36, 20);
    }
  } catch { /* ignore */ }

  const nomeEmpresa = TIPO_NOME[bid.tipo_cotacao || "empreendimentos"] || company.company_name;
  const compInfo = await loadCompanyInfo(bid.tipo_cotacao || "empreendimentos");
  doc.setFontSize(14); doc.setTextColor(primary); doc.setFont("helvetica", "bold");
  doc.text(nomeEmpresa, 50, 12);
  doc.setFontSize(9); doc.setTextColor("#333"); doc.setFont("helvetica", "bold");
  if (compInfo?.razao_social) doc.text(compInfo.razao_social, 50, 17);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor("#555");
  const linhaCnpj = [
    compInfo?.cnpj && `CNPJ: ${compInfo.cnpj}`,
    compInfo?.inscricao_estadual && `IE: ${compInfo.inscricao_estadual}`,
  ].filter(Boolean).join("  ·  ");
  if (linhaCnpj) doc.text(linhaCnpj, 50, 21);
  doc.text([compInfo?.endereco, compInfo?.cidade && `${compInfo.cidade}/${compInfo.estado || ""}`, compInfo?.telefone || company.phone, compInfo?.email || company.email].filter(Boolean).join("  ·  "), 50, 25);

  // Title
  doc.setFillColor(primary);
  doc.rect(10, 28, pageW - 20, 9, "F");
  doc.setTextColor("#fff"); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("SOLICITAÇÃO DE COTAÇÃO", pageW / 2, 34, { align: "center" });

  // Info
  doc.setTextColor("#000"); doc.setFontSize(9);
  let y = 43;
  const info: [string, string][] = [
    ["Órgão:", bid.orgao || "-"],
    ["Processo:", bid.processo || "-"],
    ["Objeto:", bid.objeto || "-"],
    ["Modalidade:", bid.modalidade || "-"],
    ["Data:", bid.data_abertura || fmtDate(new Date())],
  ];
  for (const [k, v] of info) {
    doc.setFont("helvetica", "bold"); doc.text(k, 10, y);
    doc.setFont("helvetica", "normal"); doc.text(String(v).slice(0, 180), 32, y);
    y += 5;
  }

  let total = 0;
  const body = items.map((it) => {
    const tot = (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0);
    total += tot;
    return [
      String(it.item_number),
      it.descricao,
      it.unidade || "",
      String(it.quantidade ?? ""),
      it.marca || "",
      it.valor_unitario ? fmtBRL(it.valor_unitario) : "",
      tot ? fmtBRL(tot) : "",
      it.prazo || "",
      it.observacao || "",
    ];
  });

  autoTable(doc, {
    startY: y + 2,
    head: [["ITEM", "DESCRIÇÃO", "UN.", "QTD.", "MARCA", "V. UNIT.", "V. TOTAL", "PRAZO", "OBS."]],
    body,
    styles: { fontSize: 8, cellPadding: 1.8, valign: "middle" },
    headStyles: { fillColor: primary, textColor: "#fff", fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { cellWidth: 90 },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "right", cellWidth: 16 },
      4: { cellWidth: 24 },
      5: { halign: "right", cellWidth: 22 },
      6: { halign: "right", cellWidth: 24 },
      7: { cellWidth: 18 },
      8: { cellWidth: 30 },
    },
    foot: [["", "", "", "", "", "TOTAL", fmtBRL(total), "", ""]],
    footStyles: { fillColor: "#EEEEEE", textColor: "#000", fontStyle: "bold", halign: "right" },
  });

  // Footer
  // @ts-expect-error lastAutoTable injetado pelo plugin
  const fy = (doc.lastAutoTable?.finalY || y) + 10;
  doc.setFontSize(9); doc.setFont("helvetica", "italic");
  doc.text(`Validade da proposta: ${company.proposal_validity_days || 10} dias`, 10, fy);
  doc.setFont("helvetica", "normal");
  doc.text("_______________________________________", pageW / 2, fy + 18, { align: "center" });
  doc.text("Assinatura do Fornecedor", pageW / 2, fy + 23, { align: "center" });

  doc.save(`cotacao_${(bid.processo || "edital").replace(/\W+/g, "_")}.pdf`);
}
