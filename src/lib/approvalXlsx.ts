import ExcelJS from "exceljs";
import { TIPO_NOME, type ExportBid, type ExportCompany } from "./exporters";
import { loadCompany } from "./proposalPdf";

export interface ApprovalRow {
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  marca?: string;
  modelo?: string;
  supplier?: string;
  preco_fornecedor: number;
  frete_unitario: number;
  imposto_pct: number;
  custo_unit: number;
  margem_pct: number;
  preco_final: number;
}

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export async function exportApprovalXlsx(
  bid: ExportBid,
  rows: ApprovalRow[],
  company: ExportCompany,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Aprovação", { properties: { defaultRowHeight: 18 } });
  const primary = (company.primary_color || "#0F3460").replace("#", "").toUpperCase().padStart(6, "0");
  const nome = TIPO_NOME[bid.tipo_cotacao || "empreendimentos"] || company.company_name;

  ws.columns = [
    { width: 6 },   // A item
    { width: 42 },  // B descrição
    { width: 8 },   // C un
    { width: 8 },   // D qtd
    { width: 14 },  // E marca
    { width: 14 },  // F modelo
    { width: 22 },  // G fornecedor
    { width: 14 },  // H preço forn
    { width: 12 },  // I frete
    { width: 10 },  // J imp%
    { width: 14 },  // K custo unit
    { width: 14 },  // L custo total
    { width: 10 },  // M margem%
    { width: 14 },  // N preço final
    { width: 16 },  // O fat. total
    { width: 14 },  // P lucro total
  ];

  // Cabeçalho
  ws.mergeCells("A1:P1");
  ws.getCell("A1").value = `${nome} — RELATÓRIO DE APROVAÇÃO DE LICITAÇÃO`;
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:P2");
  ws.getCell("A2").value = "Documento para análise e aprovação da Diretoria";
  ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF555555" } };
  ws.getCell("A2").alignment = { horizontal: "center" };

  // Info do edital
  let r = 4;
  const tipo = (bid.tipo_cotacao || "empreendimentos") as "empreendimentos" | "medicamentos";
  const compInfo = await loadCompany(tipo);
  const info: [string, string][] = [
    ["Órgão", bid.orgao || "-"],
    ["Processo", bid.processo || "-"],
    ["Objeto", bid.objeto || "-"],
    ["Modalidade", bid.modalidade || "-"],
    ["Data da abertura", bid.data_abertura || "-"],
    ["Empresa proponente", nome],
    ["Razão social", compInfo?.razao_social || "-"],
    ["CNPJ", compInfo?.cnpj || "-"],
    ["Inscrição Estadual", compInfo?.inscricao_estadual || "-"],
    ["Endereço", [compInfo?.endereco, compInfo?.bairro, compInfo?.cidade && `${compInfo.cidade}/${compInfo.estado || ""}`, compInfo?.cep && `CEP ${compInfo.cep}`].filter(Boolean).join(", ") || "-"],
  ];
  for (const [k, v] of info) {
    ws.getCell(`A${r}`).value = k;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    ws.mergeCells(`B${r}:P${r}`);
    ws.getCell(`B${r}`).value = v;
    r++;
  }
  r += 1;

  // Cabeçalho da tabela
  const headers = [
    "Item", "Descrição", "Un.", "Qtd.", "Marca", "Modelo",
    "Fornecedor", "Preço fornec.", "Frete unit.", "Imp.%",
    "Custo unit.", "Custo total", "Margem %", "Preço final unit.",
    "Faturamento", "Lucro estimado",
  ];
  const head = ws.getRow(r);
  headers.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  head.height = 30;
  r++;

  const start = r;
  for (const it of rows) {
    const row = ws.getRow(r);
    row.values = [
      it.item_number,
      it.descricao,
      it.unidade,
      Number(it.quantidade) || 0,
      it.marca || "",
      it.modelo || "",
      it.supplier || "—",
      Number(it.preco_fornecedor) || 0,
      Number(it.frete_unitario) || 0,
      Number(it.imposto_pct) || 0,
      // Custo unit = H + I + (H * J/100)
      { formula: `H${r}+I${r}+(H${r}*J${r}/100)` },
      // Custo total = D * K
      { formula: `D${r}*K${r}` },
      Number(it.margem_pct) || 0,
      // Preço final unit = K * (1 + M/100)
      { formula: `K${r}*(1+M${r}/100)` },
      // Faturamento = D * N
      { formula: `D${r}*N${r}` },
      // Lucro = O - L
      { formula: `O${r}-L${r}` },
    ];
    [8, 9, 11, 12, 14, 15, 16].forEach((col) => row.getCell(col).numFmt = '"R$" #,##0.00');
    [10, 13].forEach((col) => row.getCell(col).numFmt = '0.0"%"');
    row.eachCell((c) => {
      c.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      c.alignment = { vertical: "middle", wrapText: true };
    });
    r++;
  }

  // Totais
  const tot = ws.getRow(r);
  ws.mergeCells(`A${r}:K${r}`);
  tot.getCell(1).value = "TOTAIS GERAIS";
  tot.getCell(1).font = { bold: true, size: 11 };
  tot.getCell(1).alignment = { horizontal: "right" };
  tot.getCell(12).value = { formula: `SUM(L${start}:L${r - 1})` };
  tot.getCell(15).value = { formula: `SUM(O${start}:O${r - 1})` };
  tot.getCell(16).value = { formula: `SUM(P${start}:P${r - 1})` };
  [12, 15, 16].forEach((col) => {
    tot.getCell(col).numFmt = '"R$" #,##0.00';
    tot.getCell(col).font = { bold: true };
    tot.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });
  r += 2;

  // Resumo executivo (KPIs para decisão)
  ws.mergeCells(`A${r}:P${r}`);
  ws.getCell(`A${r}`).value = "RESUMO EXECUTIVO — INDICADORES PARA DECISÃO";
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
  ws.getRow(r).height = 22;
  r++;

  const totRow = r - 3; // linha do "TOTAIS GERAIS"
  const kpis: [string, ExcelJS.CellValue, string][] = [
    ["Quantidade de itens", rows.length, "0"],
    ["Custo total da operação", { formula: `L${totRow}` }, '"R$" #,##0.00'],
    ["Faturamento previsto", { formula: `O${totRow}` }, '"R$" #,##0.00'],
    ["Lucro bruto estimado (R$)", { formula: `P${totRow}` }, '"R$" #,##0.00'],
    ["Imposto sobre lucro (24%)", { formula: `P${totRow}*0.24` }, '"R$" #,##0.00'],
    ["Lucro líquido após imposto (R$)", { formula: `P${totRow}*0.76` }, '"R$" #,##0.00'],
    ["Margem líquida (%)", { formula: `IFERROR(P${totRow}*0.76/O${totRow}*100,0)` }, '0.00"%"'],
    ["Markup sobre custo (%)", { formula: `IFERROR(P${totRow}/L${totRow}*100,0)` }, '0.00"%"'],
    ["Ticket médio por item (faturamento)", { formula: `IFERROR(O${totRow}/${rows.length || 1},0)` }, '"R$" #,##0.00'],
  ];
  for (const [k, v, fmt] of kpis) {
    ws.getCell(`A${r}`).value = k;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    ws.mergeCells(`A${r}:F${r}`);
    ws.mergeCells(`G${r}:P${r}`);
    ws.getCell(`G${r}`).value = v;
    ws.getCell(`G${r}`).numFmt = fmt;
    ws.getCell(`G${r}`).font = { bold: true, size: 12 };
    r++;
  }
  r += 2;

  // Distribuição por fornecedor
  ws.mergeCells(`A${r}:P${r}`);
  ws.getCell(`A${r}`).value = "DISTRIBUIÇÃO POR FORNECEDOR";
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + primary } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
  r++;

  const bySup = new Map<string, { itens: number; custo: number; fat: number }>();
  for (const it of rows) {
    const key = it.supplier || "—";
    const cur = bySup.get(key) || { itens: 0, custo: 0, fat: 0 };
    const custoUnit = it.preco_fornecedor + it.frete_unitario + it.preco_fornecedor * it.imposto_pct / 100;
    cur.itens += 1;
    cur.custo += custoUnit * it.quantidade;
    cur.fat += custoUnit * (1 + it.margem_pct / 100) * it.quantidade;
    bySup.set(key, cur);
  }
  const supHead = ws.getRow(r);
  ["Fornecedor", "Qtd. itens", "Custo total", "Faturamento", "Lucro", "Participação %"].forEach((h, i) => {
    const map = [1, 7, 9, 11, 13, 15];
    const c = supHead.getCell(map[i]);
    c.value = h; c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });
  ws.mergeCells(`A${r}:F${r}`);
  ws.mergeCells(`G${r}:H${r}`);
  ws.mergeCells(`I${r}:J${r}`);
  ws.mergeCells(`K${r}:L${r}`);
  ws.mergeCells(`M${r}:N${r}`);
  ws.mergeCells(`O${r}:P${r}`);
  r++;

  const totalFat = Array.from(bySup.values()).reduce((s, x) => s + x.fat, 0) || 1;
  for (const [sup, v] of bySup.entries()) {
    ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = sup;
    ws.mergeCells(`G${r}:H${r}`); ws.getCell(`G${r}`).value = v.itens;
    ws.mergeCells(`I${r}:J${r}`); ws.getCell(`I${r}`).value = v.custo; ws.getCell(`I${r}`).numFmt = '"R$" #,##0.00';
    ws.mergeCells(`K${r}:L${r}`); ws.getCell(`K${r}`).value = v.fat; ws.getCell(`K${r}`).numFmt = '"R$" #,##0.00';
    ws.mergeCells(`M${r}:N${r}`); ws.getCell(`M${r}`).value = v.fat - v.custo; ws.getCell(`M${r}`).numFmt = '"R$" #,##0.00';
    ws.mergeCells(`O${r}:P${r}`); ws.getCell(`O${r}`).value = v.fat / totalFat; ws.getCell(`O${r}`).numFmt = "0.0%";
    r++;
  }
  r += 2;

  // Aprovação
  ws.mergeCells(`A${r}:P${r}`);
  ws.getCell(`A${r}`).value = "APROVAÇÃO DA DIRETORIA";
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
  r += 2;

  ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = "Decisão:";
  ws.getCell(`A${r}`).font = { bold: true };
  ws.mergeCells(`G${r}:P${r}`); ws.getCell(`G${r}`).value = "(  ) APROVADO     (  ) APROVADO COM RESSALVAS     (  ) RECUSADO";
  r += 2;
  ws.mergeCells(`A${r}:P${r}`); ws.getCell(`A${r}`).value = "Observações da Diretoria:";
  ws.getCell(`A${r}`).font = { bold: true };
  r++;
  ws.mergeCells(`A${r}:P${r + 3}`);
  ws.getCell(`A${r}`).border = {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" },
  };
  r += 5;

  ws.mergeCells(`A${r}:G${r + 2}`);
  ws.getCell(`A${r}`).value = "_____________________________\nResponsável pela cotação";
  ws.getCell(`A${r}`).alignment = { horizontal: "center", vertical: "bottom", wrapText: true };
  ws.mergeCells(`J${r}:P${r + 2}`);
  ws.getCell(`J${r}`).value = "_____________________________\nDiretoria — Aprovação";
  ws.getCell(`J${r}`).alignment = { horizontal: "center", vertical: "bottom", wrapText: true };

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `aprovacao_${(bid.processo || "edital").replace(/\W+/g, "_")}.xlsx`,
  );
}
