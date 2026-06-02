import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { loadCompany } from "./proposalPdf";
import { fmtDate } from "./format";

export interface AcceptanceItem {
  item_number: number;
  descricao: string;
  marca?: string;
  modelo?: string;
  unidade?: string;
  quantidade: number;
}

export interface AcceptanceData {
  tipo_cotacao: "empreendimentos" | "medicamentos";
  bid: {
    orgao?: string;
    processo?: string;
    modalidade?: string;
    objeto?: string;
    uasg?: string;
    local_entrega?: string;
  };
  delivery: {
    delivery_date?: string | null;
    nfe_numero?: string;
    nfe_chave?: string;
    empenho_numero?: string;
    ordem_fornecimento?: string;
    transportadora?: string;
    responsavel?: string;
  };
  acceptance: {
    servidor_nome: string;
    servidor_cargo: string;
    servidor_matricula: string;
    servidor_cpf: string;
    orgao_setor: string;
    signature_data_url?: string;
    acceptance_date: string;
    observacoes?: string;
  };
  items: AcceptanceItem[];
}

export async function generateAcceptanceTermPdf(data: AcceptanceData): Promise<Blob> {
  const company = await loadCompany(data.tipo_cotacao);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("TERMO DE RECEBIMENTO E ACEITE", pageW / 2, y, { align: "center" });
  y += 8;

  // Empresa
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("DADOS DA EMPRESA FORNECEDORA", margin, y); y += 5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  if (company) {
    const lines = [
      `Razão Social: ${company.razao_social || ""}`,
      `Nome Fantasia: ${company.display_name || ""}`,
      `CNPJ: ${company.cnpj || ""}${company.inscricao_estadual ? `   IE: ${company.inscricao_estadual}` : ""}`,
      `Endereço: ${[company.endereco, company.bairro, company.cidade, company.estado, company.cep].filter(Boolean).join(", ")}`,
      `Telefone: ${company.telefone || "-"}   E-mail: ${company.email || "-"}`,
    ];
    lines.forEach((l) => { doc.text(l, margin, y); y += 4.5; });
  }
  y += 3;

  // Órgão
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("DADOS DO ÓRGÃO PÚBLICO RECEBEDOR", margin, y); y += 5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  [
    `Órgão: ${data.bid.orgao || "-"}`,
    `Setor / Secretaria: ${data.acceptance.orgao_setor || "-"}`,
    `Local de Entrega: ${data.bid.local_entrega || "-"}`,
    `Responsável pelo Recebimento: ${data.acceptance.servidor_nome || "-"}`,
  ].forEach((l) => { doc.text(l, margin, y); y += 4.5; });
  y += 3;

  // Referências
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("REFERÊNCIAS DA LICITAÇÃO", margin, y); y += 5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  [
    `Modalidade / Pregão: ${data.bid.modalidade || "-"}`,
    `Processo Administrativo: ${data.bid.processo || "-"}`,
    `UASG: ${data.bid.uasg || "-"}`,
    `Empenho: ${data.delivery.empenho_numero || "-"}   Ordem de Fornecimento: ${data.delivery.ordem_fornecimento || "-"}`,
    `NF-e nº ${data.delivery.nfe_numero || "-"}   Chave: ${data.delivery.nfe_chave || "-"}`,
    `Transportadora: ${data.delivery.transportadora || "-"}   Entregador: ${data.delivery.responsavel || "-"}`,
    `Data da Entrega: ${data.delivery.delivery_date ? fmtDate(data.delivery.delivery_date) : "-"}`,
  ].forEach((l) => { doc.text(l, margin, y); y += 4.5; });
  y += 3;

  // Tabela itens
  autoTable(doc, {
    startY: y,
    head: [["#", "Descrição", "Marca/Modelo", "Un.", "Qtd."]],
    body: data.items.map((it) => [
      String(it.item_number),
      it.descricao,
      [it.marca, it.modelo].filter(Boolean).join(" / ") || "-",
      it.unidade || "UN",
      String(it.quantidade),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 52, 96], textColor: 255 },
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Declaração
  if (y > 230) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("DECLARAÇÃO DE RECEBIMENTO E ACEITE", margin, y); y += 5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  const declText = "Declaramos para os devidos fins que os materiais/produtos descritos neste documento foram recebidos em conformidade com as especificações solicitadas, em perfeitas condições de uso e funcionamento, atendendo integralmente ao objeto da licitação acima referenciada.";
  doc.text(doc.splitTextToSize(declText, pageW - margin * 2), margin, y);
  y += 18;

  if (data.acceptance.observacoes) {
    doc.setFont("helvetica", "bold").text("Observações:", margin, y); y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(data.acceptance.observacoes, pageW - margin * 2), margin, y);
    y += 12;
  }

  // Assinatura
  if (y > 230) { doc.addPage(); y = margin; }
  y += 5;
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("ASSINATURA DO RESPONSÁVEL PELO RECEBIMENTO", margin, y); y += 6;

  if (data.acceptance.signature_data_url) {
    try {
      doc.addImage(data.acceptance.signature_data_url, "PNG", margin, y, 70, 25);
    } catch {
      // ignore
    }
  }
  doc.line(margin, y + 27, margin + 90, y + 27);
  y += 30;

  doc.setFont("helvetica", "normal").setFontSize(9);
  [
    `Nome: ${data.acceptance.servidor_nome || "-"}`,
    `Cargo: ${data.acceptance.servidor_cargo || "-"}`,
    `Matrícula: ${data.acceptance.servidor_matricula || "-"}   CPF: ${data.acceptance.servidor_cpf || "-"}`,
    `Data do Recebimento: ${fmtDate(data.acceptance.acceptance_date)}`,
  ].forEach((l) => { doc.text(l, margin, y); y += 4.5; });

  return doc.output("blob");
}
