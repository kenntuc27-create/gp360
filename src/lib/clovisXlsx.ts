import ExcelJS from "exceljs";
import { TIPO_NOME, type ExportBid, type ExportCompany } from "./exporters";
import { loadCompany } from "./proposalPdf";

export interface ClovisRow {
  descricao: string;
  quantidade: number;
  valor_unitario_edital: number;
  custo_unitario: number;
  preco_final: number;
}

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export async function exportClovisXlsx(
  bid: ExportBid,
  rows: ClovisRow[],
  company: ExportCompany,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clovis", { properties: { defaultRowHeight: 18 } });

  const compInfo = await loadCompany(bid.tipo_cotacao || "empreendimentos");
  const primary = (company.primary_color || "#0F3460").replace("#", "").toUpperCase().padStart(6, "0");
  const nome = TIPO_NOME[bid.tipo_cotacao || "empreendimentos"] || company.company_name;

  ws.columns = [
    { width: 42 }, // A descrição
    { width: 8 },  // B qtd
    { width: 16 }, // C valor unit (ref/venda)
    { width: 16 }, // D valor lote
    { width: 16 }, // E total
    { width: 2 },  // F sep
    { width: 16 }, // G valor unit (cotação/custo)
    { width: 8 },  // H qtd
    { width: 16 }, // I valor total custo
    { width: 2 },  // J sep
    { width: 16 }, // K lucro unit
    { width: 16 }, // L lucro total
    { width: 12 }, // M margem %
  ];

  // Header da empresa
  ws.mergeCells("A1:M1");
  const c1 = ws.getCell("A1");
  c1.value = `${compInfo?.razao_social || company.company_name || nome}`;
  c1.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  c1.alignment = { horizontal: "center", vertical: "middle" };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${primary}` } };
  ws.getRow(1).height = 24;

  ws.mergeCells("A2:M2");
  const c2 = ws.getCell("A2");
  const linha2 = [
    compInfo?.cnpj && `CNPJ: ${compInfo.cnpj}`,
    compInfo?.inscricao_estadual && `IE: ${compInfo.inscricao_estadual}`,
    compInfo?.endereco,
  ].filter(Boolean).join("  ·  ");
  c2.value = linha2 || "";
  c2.alignment = { horizontal: "center" };
  c2.font = { size: 9, color: { argb: "FF555555" } };

  ws.mergeCells("A3:M3");
  const c3 = ws.getCell("A3");
  c3.value = `Relatório Clovis — ${bid.orgao || ""} ${bid.processo ? `· ${bid.processo}` : ""}`;
  c3.alignment = { horizontal: "center" };
  c3.font = { bold: true, size: 11 };

  // Section headers (row 5)
  const sectionFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${primary}` } };
  const sectionFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

  ws.mergeCells("A5:E5");
  const refH = ws.getCell("A5");
  refH.value = "REF (VENDA)";
  refH.alignment = { horizontal: "center", vertical: "middle" };
  refH.font = sectionFont;
  refH.fill = sectionFill;

  ws.mergeCells("G5:I5");
  const cotH = ws.getCell("G5");
  cotH.value = "COTAÇÃO (CUSTO)";
  cotH.alignment = { horizontal: "center", vertical: "middle" };
  cotH.font = sectionFont;
  cotH.fill = sectionFill;

  ws.mergeCells("K5:M5");
  const margH = ws.getCell("K5");
  margH.value = "MARGEM DE LUCRO";
  margH.alignment = { horizontal: "center", vertical: "middle" };
  margH.font = sectionFont;
  margH.fill = sectionFill;

  // Column headers (row 6)
  const headerRow = ws.getRow(6);
  const headers: Array<[string, string]> = [
    ["A6", "DESCRIÇÃO"], ["B6", "QTD"], ["C6", "VALOR UNITARIO"], ["D6", "VALOR LOTE"], ["E6", "TOTAL"],
    ["G6", "VALOR UNITARIO"], ["H6", "QTD"], ["I6", "VALOR TOTAL"],
    ["K6", "LUCRO UNIT."], ["L6", "LUCRO TOTAL"], ["M6", "MARGEM %"],
  ];
  for (const [addr, label] of headers) {
    const cell = ws.getCell(addr);
    cell.value = label;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FF999999" } },
      bottom: { style: "thin", color: { argb: "FF999999" } },
      left: { style: "thin", color: { argb: "FF999999" } },
      right: { style: "thin", color: { argb: "FF999999" } },
    };
  }
  headerRow.height = 28;

  // Data rows
  const startRow = 7;
  rows.forEach((r, idx) => {
    const rn = startRow + idx;
    ws.getCell(`A${rn}`).value = r.descricao;
    ws.getCell(`B${rn}`).value = r.quantidade;
    ws.getCell(`C${rn}`).value = r.valor_unitario_edital;
    ws.getCell(`D${rn}`).value = { formula: `B${rn}*C${rn}` };
    ws.getCell(`E${rn}`).value = { formula: `B${rn}*C${rn}` };

    ws.getCell(`G${rn}`).value = r.custo_unitario;
    ws.getCell(`H${rn}`).value = r.quantidade;
    ws.getCell(`I${rn}`).value = { formula: `G${rn}*H${rn}` };

    // Lucro unit = valor vendido (C) - custo (G)
    ws.getCell(`K${rn}`).value = { formula: `C${rn}-G${rn}` };
    ws.getCell(`L${rn}`).value = { formula: `K${rn}*B${rn}` };
    // Margem = (vendido - custo)/vendido * 100
    ws.getCell(`M${rn}`).value = { formula: `IFERROR((C${rn}-G${rn})/C${rn}*100,0)` };

    const cols = ["A","B","C","D","E","G","H","I","K","L","M"];
    for (const col of cols) {
      const cell = ws.getCell(`${col}${rn}`);
      cell.border = {
        top: { style: "hair", color: { argb: "FFCCCCCC" } },
        bottom: { style: "hair", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FF999999" } },
        right: { style: "thin", color: { argb: "FF999999" } },
      };
      if (col !== "A") cell.alignment = { horizontal: "right", vertical: "middle" };
      else cell.alignment = { vertical: "middle", wrapText: true };
      if (["C","D","E","G","I","K","L"].includes(col)) {
        cell.numFmt = '"R$" #,##0.00';
      }
      if (col === "M") cell.numFmt = '0.0"%"';
    }
  });

  // Totals row
  const lastRow = startRow + rows.length - 1;
  const totalRow = lastRow + 1;
  ws.getCell(`A${totalRow}`).value = "TOTAL";
  ws.getCell(`A${totalRow}`).font = { bold: true };
  ws.getCell(`A${totalRow}`).alignment = { horizontal: "right" };
  if (rows.length > 0) {
    ws.getCell(`E${totalRow}`).value = { formula: `SUM(E${startRow}:E${lastRow})` };
    ws.getCell(`I${totalRow}`).value = { formula: `SUM(I${startRow}:I${lastRow})` };
    ws.getCell(`L${totalRow}`).value = { formula: `SUM(L${startRow}:L${lastRow})` };
    ws.getCell(`M${totalRow}`).value = { formula: `IFERROR((E${totalRow}-I${totalRow})/E${totalRow}*100,0)` };
    for (const col of ["E","I","L"]) {
      const cell = ws.getCell(`${col}${totalRow}`);
      cell.numFmt = '"R$" #,##0.00';
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      cell.border = {
        top: { style: "medium", color: { argb: "FF666666" } },
        bottom: { style: "medium", color: { argb: "FF666666" } },
      };
    }
    const mc = ws.getCell(`M${totalRow}`);
    mc.numFmt = '0.0"%"';
    mc.font = { bold: true };
    mc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  }

  // Resumo: Lucro bruto -> imposto 24% -> Lucro líquido
  const lucroRow = totalRow + 2;
  ws.getCell(`J${lucroRow}`).value = "LUCRO BRUTO TOTAL";
  ws.getCell(`J${lucroRow}`).font = { bold: true };
  ws.getCell(`J${lucroRow}`).alignment = { horizontal: "right" };
  ws.getCell(`L${lucroRow}`).value = { formula: `L${totalRow}` };
  ws.getCell(`L${lucroRow}`).numFmt = '"R$" #,##0.00';
  ws.getCell(`L${lucroRow}`).font = { bold: true, color: { argb: "FF1B7F3F" } };

  const impRow = lucroRow + 1;
  ws.getCell(`J${impRow}`).value = "IMPOSTO (24% sobre lucro)";
  ws.getCell(`J${impRow}`).font = { bold: true };
  ws.getCell(`J${impRow}`).alignment = { horizontal: "right" };
  ws.getCell(`L${impRow}`).value = { formula: `L${lucroRow}*0.24` };
  ws.getCell(`L${impRow}`).numFmt = '"R$" #,##0.00';
  ws.getCell(`L${impRow}`).font = { bold: true, color: { argb: "FFB91C1C" } };

  const liqRow = impRow + 1;
  ws.getCell(`J${liqRow}`).value = "LUCRO LÍQUIDO";
  ws.getCell(`J${liqRow}`).font = { bold: true };
  ws.getCell(`J${liqRow}`).alignment = { horizontal: "right" };
  ws.getCell(`L${liqRow}`).value = { formula: `L${lucroRow}-L${impRow}` };
  ws.getCell(`L${liqRow}`).numFmt = '"R$" #,##0.00';
  ws.getCell(`L${liqRow}`).font = { bold: true, color: { argb: "FF0F3460" }, size: 12 };
  ws.getCell(`L${liqRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const safeName = `${bid.processo || bid.orgao || "cotacao"}`.replace(/[^a-z0-9-_]+/gi, "_");
  triggerDownload(blob, `Clovis_${safeName}.xlsx`);
}
