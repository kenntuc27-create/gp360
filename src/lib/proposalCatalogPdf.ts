import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtBRL, fmtDate } from "./format";
import { supabase } from "@/integrations/supabase/client";
import type { ExportBid } from "./exporters";
import { loadCompany, type CompanyData, type ProposalRow } from "./proposalPdf";

const NAVY = "#0F2D5C";
const RED = "#C8202C";

async function fetchAsDataUrl(url: string): Promise<{ url: string; fmt: "PNG" | "JPEG" } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    const dataUrl: string = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(blob);
    });
    return { url: dataUrl, fmt: dataUrl.includes("png") ? "PNG" : "JPEG" };
  } catch {
    return null;
  }
}

function drawHeader(doc: jsPDF, company: CompanyData, logo: { url: string; fmt: "PNG" | "JPEG" } | null) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setDrawColor(RED); doc.setLineWidth(0.6);
  doc.line(0, 4, pageW * 0.55, 4);
  doc.setDrawColor("#000"); doc.setLineWidth(0.4);
  doc.line(pageW * 0.05, 7, pageW * 0.55, 7);
  doc.line(pageW * 0.07, 10, pageW * 0.55, 10);
  if (logo) {
    doc.addImage(logo.url, logo.fmt, 10, 8, 50, 18);
  } else {
    doc.setFontSize(14); doc.setTextColor(NAVY); doc.setFont("helvetica", "bold");
    doc.text(company.display_name.toUpperCase(), 10, 18);
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(NAVY);
  doc.text(company.slogan || "Fé, Confiança e Compromisso", pageW - 10, 14, { align: "right" });
}

function drawFooter(doc: jsPDF, company: CompanyData) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const y = pageH - 22;
  doc.setDrawColor(NAVY); doc.setLineWidth(0.3);
  doc.line(10, y - 2, pageW - 10, y - 2);
  doc.setFillColor(NAVY);
  doc.rect(0, y, pageW, 18, "F");
  doc.setTextColor("#fff"); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text(company.razao_social, 10, y + 6);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  if (company.cnpj || company.inscricao_estadual) {
    doc.text(`CNPJ: ${company.cnpj}${company.inscricao_estadual ? `  /  IE: ${company.inscricao_estadual}` : ""}`, 10, y + 10);
  }
  const rightX = pageW - 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  if (company.endereco) doc.text(company.endereco, rightX, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  const linha2 = [company.bairro, company.cidade && `${company.cidade}/${company.estado || ""}`].filter(Boolean).join(", ");
  if (linha2) doc.text(linha2, rightX, y + 10, { align: "right" });
  if (company.telefone) doc.text(company.telefone, rightX, y + 14, { align: "right" });
  doc.setDrawColor(RED); doc.setLineWidth(0.8);
  doc.line(0, pageH - 2, pageW, pageH - 2);
}

function drawWatermark(doc: jsPDF, logo: { url: string; fmt: "PNG" | "JPEG" } | null) {
  if (!logo) return;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  try {
    const anyDoc = doc as any;
    const gs = new (jsPDF as any).GState({ opacity: 0.08 });
    anyDoc.setGState(gs);
    doc.addImage(logo.url, logo.fmt, (pageW - 140) / 2, (pageH - 50) / 2, 140, 50);
    anyDoc.setGState(new (jsPDF as any).GState({ opacity: 1 }));
  } catch { /* ignore */ }
}

function valorPorExtenso(v: number): string {
  const inteiro = Math.floor(v);
  const cent = Math.round((v - inteiro) * 100);
  return `${inteiro.toLocaleString("pt-BR")} reais e ${cent.toString().padStart(2, "0")} centavos`;
}

/** Gera (ou recupera do cache) a imagem AI para um item. */
async function getProductImage(row: ProposalRow, companyTipo: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-catalog-image", {
      body: {
        descricao: row.descricao,
        marca: row.marca || "",
        modelo: row.modelo || "",
        company_tipo: companyTipo,
      },
    });
    if (error) {
      console.error("generate-catalog-image error", error);
      return null;
    }
    return (data as any)?.image_url || null;
  } catch (e) {
    console.error("invoke catalog image", e);
    return null;
  }
}

export interface CatalogProgress {
  current: number;
  total: number;
  item: string;
}

export async function exportProposalWithCatalogPdf(
  bid: ExportBid,
  rows: ProposalRow[],
  onProgress?: (p: CatalogProgress) => void,
) {
  const tipo = (bid.tipo_cotacao || "empreendimentos") as "empreendimentos" | "medicamentos";
  const loaded = await loadCompany(tipo);
  const company: CompanyData = loaded || ({
    tipo,
    display_name: tipo === "medicamentos" ? "Pará Medicamentos" : "Pará Empreendimentos",
    razao_social: tipo === "medicamentos" ? "PARA MEDICAMENTOS E SERVICOS MEDICOS LTDA" : "PARA EMPREENDIMENTOS COMERCIO E PRESTACAO DE SERVICOS LTDA",
    cnpj: tipo === "medicamentos" ? "26.123.476/0001-03" : "07.947.570/0001-32",
    declaracoes: [],
    proposal_validity_days: 60,
  } as CompanyData);

  // 1) Buscar/gerar imagens primeiro (em sequência para não estourar rate limit)
  const images: (string | null)[] = [];
  const imageData: ({ url: string; fmt: "PNG" | "JPEG" } | null)[] = [];
  for (let i = 0; i < rows.length; i++) {
    onProgress?.({ current: i + 1, total: rows.length, item: rows[i].descricao.slice(0, 60) });
    const url = await getProductImage(rows[i], tipo);
    images.push(url);
    imageData.push(url ? await fetchAsDataUrl(url) : null);
    // Throttle to respect Gemini rate limits (~10 RPM no tier free)
    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, 6500));
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = company.logo_url ? await fetchAsDataUrl(company.logo_url) : null;

  drawHeader(doc, company, logo);
  drawWatermark(doc, logo);
  drawFooter(doc, company);

  // ===== Cabeçalho do processo (estilo do modelo enviado) =====
  doc.setTextColor("#000"); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  let y = 38;
  if (bid.orgao) { doc.text(bid.orgao.toUpperCase(), pageW / 2, y, { align: "center" }); y += 6; }
  if (bid.uasg) { doc.setFontSize(10); doc.text(`UASG / Unidade Compradora: ${bid.uasg}`, pageW / 2, y, { align: "center" }); y += 5; doc.setFontSize(11); }
  if (bid.processo) { doc.text(`Processo: ${bid.processo}`, pageW / 2, y, { align: "center" }); y += 5; }
  if (bid.modalidade) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(bid.modalidade, pageW / 2, y, { align: "center" }); y += 5;
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (bid.data_inicio_propostas) { doc.text(`Início das propostas: ${bid.data_inicio_propostas}`, pageW / 2, y, { align: "center" }); y += 4.5; }
  if (bid.data_encerramento_propostas) { doc.text(`Encerramento das propostas: ${bid.data_encerramento_propostas}`, pageW / 2, y, { align: "center" }); y += 4.5; }
  if (bid.data_limite_entrega) { doc.text(`Data limite de entrega: ${bid.data_limite_entrega}`, pageW / 2, y, { align: "center" }); y += 4.5; }
  y += 2;

  // ===== Parágrafo institucional =====
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  const intro = `${company.razao_social}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${company.cnpj}${company.inscricao_estadual ? `, Inscrição Estadual nº ${company.inscricao_estadual}` : ""}, com sede ${company.endereco ? `à ${company.endereco}` : ""}${company.cidade ? `, no município de ${company.cidade}` : ""}${company.estado ? `/${company.estado}` : ""}${company.cep ? `, CEP: ${company.cep}` : ""}${company.email ? `, e-mail: ${company.email}` : ""}, por meio de seu Representante Legal, vem apresentar sua`;
  const introLines = doc.splitTextToSize(intro, pageW - 30);
  introLines.forEach((ln: string, idx: number) => doc.text(ln, pageW / 2, y + idx * 4.5, { align: "center" }));
  y += introLines.length * 4.5 + 4;

  // ===== Título PROPOSTA =====
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(NAVY);
  doc.text("PROPOSTA", pageW / 2, y, { align: "center" });
  y += 4;
  doc.setTextColor("#000");

  // ===== Tabela com imagens =====
  let total = 0;
  const body = rows.map((it) => {
    const tot = (Number(it.quantidade) || 0) * (Number(it.preco_final) || 0);
    total += tot;
    return [
      String(it.item_number).padStart(2, "0"),
      it.descricao || "",
      it.marca || "—",
      it.modelo || "—",
      "", // coluna IMAGEM (preenchida via didDrawCell)
      String(it.quantidade ?? ""),
      fmtBRL(Number(it.preco_final) || 0),
      fmtBRL(tot),
    ];
  });

  autoTable(doc, {
    startY: y + 2,
    margin: { left: 10, right: 10, bottom: 28, top: 32 },
    head: [["ITEM", "DESCRIÇÃO", "MARCA", "MODELO", "IMAGEM", "QUANT", "VALOR UNIT.", "TOTAL"]],
    body,
    styles: { fontSize: 8, cellPadding: 2.2, valign: "middle", lineColor: "#666", lineWidth: 0.25 },
    headStyles: { fillColor: NAVY, textColor: "#fff", fontStyle: "bold", halign: "center", fontSize: 8 },
    columnStyles: {
      0: { halign: "center", cellWidth: 11 },
      1: { cellWidth: 50 },
      2: { halign: "center", cellWidth: 22 },
      3: { halign: "center", cellWidth: 22 },
      4: { halign: "center", cellWidth: 30, minCellHeight: 32 },
      5: { halign: "center", cellWidth: 13 },
      6: { halign: "right", cellWidth: 20 },
      7: { halign: "right", cellWidth: 22 },
    },
    didDrawPage: () => {
      drawHeader(doc, company, logo);
      drawWatermark(doc, logo);
      drawFooter(doc, company);
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        const img = imageData[data.row.index];
        if (img) {
          const cell = data.cell;
          const size = Math.min(cell.width - 2, cell.height - 2, 28);
          const x = cell.x + (cell.width - size) / 2;
          const yy = cell.y + (cell.height - size) / 2;
          try {
            doc.addImage(img.url, img.fmt, x, yy, size, size);
          } catch (e) { console.error("addImage", e); }
        }
      }
    },
  });

  // @ts-expect-error injetado
  let cy: number = (doc.lastAutoTable?.finalY || y) + 6;

  // ===== VALOR GLOBAL =====
  if (cy > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage(); drawHeader(doc, company, logo); drawWatermark(doc, logo); drawFooter(doc, company); cy = 40;
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor("#000");
  const valorTxt = `VALOR GLOBAL DA PROPOSTA: ${fmtBRL(total)} (${valorPorExtenso(total)}).`;
  const vt = doc.splitTextToSize(valorTxt, pageW - 24);
  vt.forEach((ln: string, idx: number) => doc.text(ln, pageW / 2, cy + idx * 5, { align: "center" }));
  cy += vt.length * 5 + 6;

  // ===== Valor de Referência do Edital =====
  const totalEdital = rows.reduce(
    (acc, r) => acc + (Number(r.valor_unitario_edital) || 0) * (Number(r.quantidade) || 0),
    0,
  );
  if (totalEdital > 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9.5);
    doc.text(
      `Valor estimado/referência do edital: ${fmtBRL(totalEdital)} (${valorPorExtenso(totalEdital)}).`,
      pageW / 2, cy, { align: "center" },
    );
    cy += 6;
  }

  // ===== Validade =====
  doc.setFont("helvetica", "italic"); doc.setFontSize(10);
  doc.text(`"prazo de validade da proposta de ${company.proposal_validity_days || 60} (${(company.proposal_validity_days || 60) === 90 ? "noventa" : "sessenta"}) dias"`, 12, cy);
  cy += 7;

  // ===== Prazo e Local de entrega =====
  if (bid.prazo_entrega || bid.local_entrega || bid.data_limite_entrega) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("PRAZO E LOCAL DE ENTREGA:", 12, cy); cy += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    if (bid.data_limite_entrega) {
      doc.setFont("helvetica", "bold"); doc.text("Data limite:", 12, cy);
      doc.setFont("helvetica", "normal");
      doc.text(` ${bid.data_limite_entrega}`, 12 + doc.getTextWidth("Data limite:"), cy);
      cy += 4.8;
    }
    if (bid.prazo_entrega) {
      const pl = doc.splitTextToSize(String(bid.prazo_entrega), pageW - 24);
      pl.forEach((ln: string, idx: number) => doc.text(ln, 12, cy + idx * 4.5));
      cy += pl.length * 4.5 + 1;
    }
    if (bid.local_entrega) {
      doc.setFont("helvetica", "bold"); doc.text("ENDEREÇO:", 12, cy);
      doc.setFont("helvetica", "normal");
      const le = doc.splitTextToSize(String(bid.local_entrega), pageW - 24 - doc.getTextWidth("ENDEREÇO: "));
      le.forEach((ln: string, idx: number) => doc.text(ln, 12 + doc.getTextWidth("ENDEREÇO: "), cy + idx * 4.5));
      cy += le.length * 4.5 + 1;
    }
    cy += 3;
  }

  // ===== Texto final =====
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const final = "Declaramos que nos preços acima propostos, estão inclusos todos os custos necessários para a execução dos serviços, objeto da cotação em referência, bem como todos os tributos, fretes, seguros, encargos trabalhistas, comerciais e quaisquer outras despesas que incidam ou venham a incidir sobre o objeto desta licitação.";
  const ft = doc.splitTextToSize(final, pageW - 24);
  ft.forEach((ln: string, idx: number) => doc.text(ln, 12, cy + idx * 4.2));
  cy += ft.length * 4.2 + 8;

  // ===== Data + assinatura =====
  if (cy > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage(); drawHeader(doc, company, logo); drawWatermark(doc, logo); drawFooter(doc, company); cy = 40;
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`${company.cidade || "Tucuruí"}, ${fmtDate(new Date())}.`, pageW / 2, cy, { align: "center" });
  cy += 22;
  doc.line(pageW / 2 - 50, cy, pageW / 2 + 50, cy); cy += 5;
  doc.setFont("helvetica", "bold"); doc.text(company.razao_social, pageW / 2, cy, { align: "center" });
  cy += 4.5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`CNPJ: ${company.cnpj}`, pageW / 2, cy, { align: "center" });
  if (company.socio_nome) {
    cy += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`${company.socio_nome} - RESPONSÁVEL LEGAL`, pageW / 2, cy, { align: "center" });
  }

  doc.save(`proposta_catalogo_${(bid.processo || "edital").replace(/\W+/g, "_")}.pdf`);
}
