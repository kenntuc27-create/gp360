import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtBRL, fmtDate } from "./format";
import { supabase } from "@/integrations/supabase/client";
import type { ExportBid } from "./exporters";

export interface ProposalRow {
  item_number: number;
  descricao: string;
  marca?: string;
  modelo?: string;
  fabricante?: string;
  unidade?: string;
  quantidade: number;
  preco_final: number;
  /** Preço unitário de referência informado no edital (extraído pela IA). */
  valor_unitario_edital?: number;
}

export interface CompanyData {
  tipo: "empreendimentos" | "medicamentos";
  display_name: string;
  razao_social: string;
  cnpj: string;
  inscricao_estadual?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  logo_url?: string;
  primary_color?: string;
  slogan?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  pix?: string;
  socio_nome?: string;
  socio_cpf?: string;
  socio_rg?: string;
  declaracoes?: string[];
  proposal_validity_days?: number;
}

/** Carrega os dados completos da empresa pela chave `tipo`. */
export async function loadCompany(
  tipo: "empreendimentos" | "medicamentos",
): Promise<CompanyData | null> {
  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("tipo", tipo)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    declaracoes: Array.isArray(data.declaracoes)
      ? (data.declaracoes as string[])
      : [],
  } as CompanyData;
}

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

const NAVY = "#0F2D5C";
const RED = "#C8202C";

function drawHeader(doc: jsPDF, company: CompanyData, logo: { url: string; fmt: "PNG" | "JPEG" } | null) {
  const pageW = doc.internal.pageSize.getWidth();
  // Faixa superior decorativa
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

  // Slogan à direita
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(NAVY);
  doc.text(company.slogan || "Fé, Confiança e Compromisso", pageW - 10, 14, { align: "right" });
}

function drawFooter(doc: jsPDF, company: CompanyData) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const y = pageH - 22;

  // Linha decorativa
  doc.setDrawColor(NAVY); doc.setLineWidth(0.3);
  doc.line(10, y - 2, pageW - 10, y - 2);

  // Fundo azul
  doc.setFillColor(NAVY);
  doc.rect(0, y, pageW, 18, "F");

  doc.setTextColor("#fff"); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text(company.razao_social, 10, y + 6);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  if (company.cnpj || company.inscricao_estadual) {
    doc.text(
      `CNPJ: ${company.cnpj}${company.inscricao_estadual ? `  /  IE: ${company.inscricao_estadual}` : ""}`,
      10, y + 10,
    );
  }
  // Bloco direito
  const rightX = pageW - 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  if (company.endereco) doc.text(company.endereco, rightX, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  const linha2 = [company.bairro, company.cidade && `${company.cidade}/${company.estado || ""}`].filter(Boolean).join(", ");
  if (linha2) doc.text(linha2, rightX, y + 10, { align: "right" });
  if (company.telefone) doc.text(company.telefone, rightX, y + 14, { align: "right" });

  // Linha vermelha decorativa
  doc.setDrawColor(RED); doc.setLineWidth(0.8);
  doc.line(0, pageH - 2, pageW, pageH - 2);
}

function drawWatermark(doc: jsPDF, logo: { url: string; fmt: "PNG" | "JPEG" } | null) {
  if (!logo) return;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // jsPDF não tem opacity nativa fácil, usamos GState se disponível
  try {
    const anyDoc = doc as any;
    const gs = new (jsPDF as any).GState({ opacity: 0.08 });
    anyDoc.setGState(gs);
    const w = 140;
    const h = 50;
    doc.addImage(logo.url, logo.fmt, (pageW - w) / 2, (pageH - h) / 2, w, h);
    anyDoc.setGState(new (jsPDF as any).GState({ opacity: 1 }));
  } catch {
    /* opacity sem suporte: ignora marca d'água */
  }
}

function valorPorExtenso(v: number): string {
  // Implementação simples e legível: jsPDF não tem nativa, usamos Intl + sufixo
  // Para evitar bug, devolvemos formato amigável
  const inteiro = Math.floor(v);
  const cent = Math.round((v - inteiro) * 100);
  return `${inteiro.toLocaleString("pt-BR")} reais e ${cent.toString().padStart(2, "0")} centavos`;
}

function ensureSpace(doc: jsPDF, currentY: number, needed: number, company: CompanyData, logo: any): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (currentY + needed > pageH - 28) {
    doc.addPage();
    drawHeader(doc, company, logo);
    drawWatermark(doc, logo);
    drawFooter(doc, company);
    return 40;
  }
  return currentY;
}

export async function exportProposalCatalogPdf(
  bid: ExportBid,
  rows: ProposalRow[],
  // assinatura mantida para compat: aceita company_settings antigo OU CompanyData novo
  legacyOrCompany?: { tipo?: string; primary_color?: string; proposal_validity_days?: number } | CompanyData,
) {
  const tipo = (bid.tipo_cotacao || "empreendimentos") as "empreendimentos" | "medicamentos";
  // Carrega da nova tabela companies; se não achar, usa fallback
  const loaded = await loadCompany(tipo);
  const company: CompanyData = loaded || ({
    tipo,
    display_name: tipo === "medicamentos" ? "Pará Medicamentos" : "Pará Empreendimentos",
    razao_social: tipo === "medicamentos" ? "PARA MEDICAMENTOS E SERVICOS MEDICOS LTDA" : "PARA EMPREENDIMENTOS COMERCIO E PRESTACAO DE SERVICOS LTDA",
    cnpj: tipo === "medicamentos" ? "26.123.476/0001-03" : "07.947.570/0001-32",
    logo_url: tipo === "medicamentos" ? "/logo-medicamentos.png" : "/logo-empreendimentos.png",
    declaracoes: [],
    proposal_validity_days: legacyOrCompany?.proposal_validity_days || 60,
  } as CompanyData);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const logo = company.logo_url ? await fetchAsDataUrl(company.logo_url) : null;

  drawHeader(doc, company, logo);
  drawWatermark(doc, logo);
  drawFooter(doc, company);

  // ===== Título PROPOSTA COMERCIAL =====
  doc.setFillColor(NAVY);
  doc.rect(35, 35, pageW - 70, 9, "F");
  doc.setTextColor("#fff"); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("PROPOSTA COMERCIAL", pageW / 2, 41.5, { align: "center" });

  // ===== Cabeçalho do processo =====
  doc.setTextColor("#000"); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  let y = 54;
  if (bid.orgao) { doc.text(bid.orgao.toUpperCase(), 12, y); y += 5; }
  if (bid.uasg) { doc.text(`UASG / Unidade Compradora: ${bid.uasg}`, 12, y); y += 5; }
  if (bid.processo) { doc.text(`Processo: ${bid.processo}`, 12, y); y += 5; }
  if (bid.modalidade) { doc.text(`Modalidade: ${bid.modalidade}`, 12, y); y += 5; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (bid.data_inicio_propostas) { doc.text(`Início das propostas: ${bid.data_inicio_propostas}`, 12, y); y += 4.5; }
  if (bid.data_encerramento_propostas) { doc.text(`Encerramento das propostas: ${bid.data_encerramento_propostas}`, 12, y); y += 4.5; }
  if (bid.data_limite_entrega) { doc.text(`Data limite de entrega: ${bid.data_limite_entrega}`, 12, y); y += 4.5; }
  y += 3;

  // ===== Identificação do licitante =====
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("IDENTIFICAÇÃO DO LICITANTE E REPRESENTANTE LEGAL:", 12, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);

  const ident: [string, string][] = [
    ["Razão Social: ", `${company.razao_social}, CNPJ: ${company.cnpj}`],
    ["Endereço: ", [company.endereco, company.bairro, company.cidade, company.estado, `CEP: ${company.cep || ""}`].filter(Boolean).join(", ") + (company.telefone ? ` - Fone: ${company.telefone}` : "")],
  ];
  if (company.email) ident.push(["E-mail: ", company.email]);
  for (const [k, v] of ident) {
    const lines = doc.splitTextToSize(v, pageW - 24 - doc.getTextWidth(k));
    doc.setFont("helvetica", "bold"); doc.text(k, 12, y);
    doc.setFont("helvetica", "normal");
    lines.forEach((ln: string, idx: number) => {
      doc.text(ln, 12 + doc.getTextWidth(k), y + idx * 4.5);
    });
    y += lines.length * 4.5 + 1;
  }

  if (company.socio_nome) {
    y += 2;
    doc.setFont("helvetica", "bold"); doc.text("Dados do Sócio: ", 12, y);
    doc.setFont("helvetica", "normal");
    const socio = `${company.socio_nome}${company.socio_cpf ? `, CPF nº ${company.socio_cpf}` : ""}${company.socio_rg ? `, RG: ${company.socio_rg}` : ""}.`;
    const lines = doc.splitTextToSize(socio, pageW - 24 - doc.getTextWidth("Dados do Sócio: "));
    lines.forEach((ln: string, idx: number) => {
      doc.text(ln, 12 + doc.getTextWidth("Dados do Sócio: "), y + idx * 4.5);
    });
    y += lines.length * 4.5 + 3;
  }

  // ===== Tabela de itens =====
  let total = 0;
  const body = rows.map((it) => {
    const tot = (Number(it.quantidade) || 0) * (Number(it.preco_final) || 0);
    total += tot;
    return [
      String(it.item_number).padStart(2, "0"),
      it.descricao || "",
      it.marca || "—",
      it.modelo || it.fabricante || "—",
      it.unidade || "UN",
      String(it.quantidade ?? ""),
      fmtBRL(Number(it.preco_final) || 0),
      fmtBRL(tot),
    ];
  });

  autoTable(doc, {
    startY: y + 2,
    margin: { left: 10, right: 10, bottom: 28 },
    head: [["ITEM", "ESPECIFICAÇÃO", "MARCA/MODELO", "FABRICANTE/VERSÃO", "UNID", "QUANT", "VALOR UNIT.", "VALOR TOTAL"]],
    body,
    styles: { fontSize: 8, cellPadding: 2.2, valign: "middle", lineColor: "#999", lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: "#fff", fontStyle: "bold", halign: "center", fontSize: 8 },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { cellWidth: 60 },
      2: { halign: "center", cellWidth: 22 },
      3: { halign: "center", cellWidth: 22 },
      4: { halign: "center", cellWidth: 12 },
      5: { halign: "center", cellWidth: 14 },
      6: { halign: "right", cellWidth: 22 },
      7: { halign: "right", cellWidth: 26 },
    },
    didDrawPage: () => {
      drawHeader(doc, company, logo);
      drawWatermark(doc, logo);
      drawFooter(doc, company);
    },
  });

  // @ts-expect-error injetado pelo plugin
  let cy: number = (doc.lastAutoTable?.finalY || y) + 6;

  // ===== TOTAL GERAL =====
  cy = ensureSpace(doc, cy, 14, company, logo);
  doc.setFillColor(NAVY);
  doc.rect(pageW - 80, cy, 70, 9, "F");
  doc.setTextColor("#fff"); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(`TOTAL GERAL: ${fmtBRL(total)}`, pageW - 12, cy + 6, { align: "right" });
  cy += 16;

  // ===== Dados Bancários =====
  if (company.banco || company.pix) {
    cy = ensureSpace(doc, cy, 22, company, logo);
    doc.setTextColor("#000"); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("DADOS BANCÁRIOS:", 12, cy); cy += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (company.banco || company.agencia || company.conta) {
      doc.text(`Banco: ${company.banco || "-"}, Agência: ${company.agencia || "-"}, Conta Corrente: ${company.conta || "-"}`, 12, cy); cy += 4.5;
    }
    if (company.pix) { doc.text(`PIX: ${company.pix}`, 12, cy); cy += 5; }
    cy += 2;
  }

  // ===== Objeto =====
  if (bid.objeto) {
    cy = ensureSpace(doc, cy, 18, company, logo);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("OBJETO:", 12, cy);
    doc.setFont("helvetica", "normal");
    const objLines = doc.splitTextToSize(bid.objeto, pageW - 24 - doc.getTextWidth("OBJETO: "));
    objLines.forEach((ln: string, idx: number) => doc.text(ln, 12 + doc.getTextWidth("OBJETO: "), cy + idx * 4.5));
    cy += objLines.length * 4.5 + 4;
  }

  // ===== Texto institucional =====
  cy = ensureSpace(doc, cy, 22, company, logo);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const texto = "Apresentamos e submetemos à apreciação de V. Sas. nossa proposta de preços relativa ao objeto desta licitação, assumindo inteira responsabilidade por qualquer erro ou omissão que venha ser verificada na sua preparação; bem como as informações, condições da proposta e declarações exigidas no Edital/Aviso e Anexos da Dispensa Eletrônica em epígrafe:";
  const tx = doc.splitTextToSize(texto, pageW - 24);
  tx.forEach((ln: string, idx: number) => doc.text(ln, 12, cy + idx * 4.2));
  cy += tx.length * 4.2 + 4;

  // ===== VALOR GLOBAL =====
  cy = ensureSpace(doc, cy, 12, company, logo);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  const valorTxt = `VALOR GLOBAL DA PROPOSTA: ${fmtBRL(total)} (${valorPorExtenso(total)}).`;
  const vtLines = doc.splitTextToSize(valorTxt, pageW - 24);
  vtLines.forEach((ln: string, idx: number) => doc.text(ln, 12, cy + idx * 4.5));
  cy += vtLines.length * 4.5 + 4;

  // ===== Valor de Referência do Edital (com base nos preços extraídos do edital) =====
  const totalEdital = rows.reduce(
    (acc, r) => acc + (Number(r.valor_unitario_edital) || 0) * (Number(r.quantidade) || 0),
    0,
  );
  if (totalEdital > 0) {
    cy = ensureSpace(doc, cy, 10, company, logo);
    doc.setFont("helvetica", "italic"); doc.setFontSize(9);
    doc.text(
      `Valor estimado/referência do edital: ${fmtBRL(totalEdital)} (${valorPorExtenso(totalEdital)}).`,
      12, cy,
    );
    cy += 6;
  }

  // ===== PRAZO E LOCAL DE ENTREGA =====
  if (bid.prazo_entrega || bid.local_entrega || bid.data_limite_entrega) {
    cy = ensureSpace(doc, cy, 26, company, logo);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("PRAZO E LOCAL DE ENTREGA:", 12, cy); cy += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (bid.data_limite_entrega) {
      doc.setFont("helvetica", "bold"); doc.text("Data limite:", 12, cy);
      doc.setFont("helvetica", "normal");
      doc.text(` ${bid.data_limite_entrega}`, 12 + doc.getTextWidth("Data limite:"), cy);
      cy += 4.8;
    }
    if (bid.prazo_entrega) {
      const pl = doc.splitTextToSize(bid.prazo_entrega, pageW - 24);
      pl.forEach((ln: string, idx: number) => doc.text(ln, 12, cy + idx * 4.5));
      cy += pl.length * 4.5 + 1;
    }
    if (bid.local_entrega) {
      doc.setFont("helvetica", "bold"); doc.text("ENDEREÇO:", 12, cy);
      doc.setFont("helvetica", "normal");
      const ll = doc.splitTextToSize(bid.local_entrega, pageW - 24 - doc.getTextWidth("ENDEREÇO: "));
      ll.forEach((ln: string, idx: number) => doc.text(ln, 12 + doc.getTextWidth("ENDEREÇO: "), cy + idx * 4.5));
      cy += ll.length * 4.5 + 1;
    }
    cy += 3;
  }

  // ===== Validade =====
  cy = ensureSpace(doc, cy, 8, company, logo);
  doc.setFont("helvetica", "bold");
  doc.text(`VALIDADE DA PROPOSTA: ${company.proposal_validity_days || 60} (${company.proposal_validity_days === 90 ? "noventa" : "sessenta"}) dias, a contar da data da apresentação da proposta.`, 12, cy);
  cy += 7;

  // ===== Declarações =====
  if (company.declaracoes && company.declaracoes.length > 0) {
    cy = ensureSpace(doc, cy, 14, company, logo);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Declaramos, ainda, que:", 12, cy); cy += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    for (const d of company.declaracoes) {
      const lns = doc.splitTextToSize(`(X) ${d}`, pageW - 24);
      cy = ensureSpace(doc, cy, lns.length * 4 + 2, company, logo);
      lns.forEach((ln: string, idx: number) => doc.text(ln, 12, cy + idx * 4));
      cy += lns.length * 4 + 1.5;
    }
    cy += 3;
  }

  // ===== Cidade/Data + Assinatura (nova página se pouco espaço) =====
  cy = ensureSpace(doc, cy, 50, company, logo);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const dataLocal = `${company.cidade || "Tucuruí"}, ${fmtDate(new Date())}.`;
  doc.text(dataLocal, pageW / 2, cy, { align: "center" });
  cy += 24;

  doc.line(pageW / 2 - 50, cy, pageW / 2 + 50, cy);
  cy += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(company.razao_social, pageW / 2, cy, { align: "center" });
  cy += 4.5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`CNPJ: ${company.cnpj}`, pageW / 2, cy, { align: "center" });
  if (company.socio_nome) {
    cy += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`${company.socio_nome} - RESPONSÁVEL LEGAL`, pageW / 2, cy, { align: "center" });
    if (company.socio_cpf || company.socio_rg) {
      cy += 4.5;
      doc.setFont("helvetica", "normal");
      doc.text(`CPF nº ${company.socio_cpf || "-"}${company.socio_rg ? ` - RG: ${company.socio_rg}` : ""}`, pageW / 2, cy, { align: "center" });
    }
  }

  doc.save(`proposta_${(bid.processo || "edital").replace(/\W+/g, "_")}.pdf`);
}
