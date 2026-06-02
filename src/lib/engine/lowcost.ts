import { EngineHeader, EngineItem, DocumentMap, StructuralRegion } from "./types";

/**
 * Mapeia a estrutura do documento usando Regex (Baixo Custo)
 */
export function mapDocumentStructureLowCost(text: string): DocumentMap {
  const lines = text.split("\n");
  const totalPagesEstimate = Math.max(1, Math.ceil(text.length / 3000));
  
  const regions: StructuralRegion[] = [];
  
  // Heurística para itens: Procura CATMAT ou cabeçalhos clássicos
  const itemKeywords = [/item/i, /catmat/i, /descrição/i, /unidade/i, /quantidade/i, /especificação/i];
  const itemLineIndex = lines.findIndex(line => 
    itemKeywords.filter(kw => kw.test(line)).length >= 3
  );

  // Heurística para financeiro
  const financialKeywords = [
    /valor total estimado/i, 
    /valor total da contratação/i, 
    /valor global/i, 
    /orçamento/i, 
    /preço máximo/i,
    /preço unitário máximo/i
  ];
  const financialLineIndex = lines.findIndex(line => 
    financialKeywords.some(kw => kw.test(line))
  );

  if (itemLineIndex !== -1) {
    regions.push({
      type: "items",
      pages: [Math.ceil(itemLineIndex / 50) || 1],
      confidence: 85,
      description: "Região de itens detectada via CATMAT/Tabela"
    });
  }

  if (financialLineIndex !== -1) {
    regions.push({
      type: "financial",
      pages: [Math.ceil(financialLineIndex / 50) || 1],
      confidence: 90,
      description: "Região financeira detectada via Valor Total"
    });
  }

  regions.push({
    type: "header",
    pages: [1, 2],
    confidence: 95,
    description: "Início do documento"
  });

  return {
    regions,
    total_pages: totalPagesEstimate,
    is_scanned: false,
    has_tables: text.includes("|") || text.includes("\t") || itemLineIndex !== -1 || /CATMAT/i.test(text),
    rotation_needed: 0
  };
}

/**
 * Extrai cabeçalho usando Regex (Baixo Custo)
 */
export function extractHeaderLowCost(text: string): Partial<EngineHeader> {
  const header: Partial<EngineHeader> = {};
  
  // Órgão / UASG
  const uasgMatch = text.match(/(?:UASG|CONTRATANTE\/GERENCIADOR|CÓDIGO DA UASG)[^\d]*[\(\s:]{0,3}(\d{6})[\)\s]?/i);
  if (uasgMatch) header.uasg = uasgMatch[1];

  // Nome do Órgão (Heurística: primeira linha grande após termos como "MINISTÉRIO" ou "PREFEITURA")
  const orgaoMatch = text.match(/(?:MINISTÉRIO|PREFEITURA|GOVERNO|SECRETARIA)[^\n]+(?:\n[^\n]+)?/i);
  if (orgaoMatch) header.orgao = orgaoMatch[0].replace(/\n/g, " ").trim();

  // Número do Pregão: Aceita "90.006/2025", "90006/2025", "Nº 90.006/2025"
  const pregaoMatch = text.match(/(?:Pregão|PE|SRP|DISPENSA|INEXIGIBILIDADE)[^\d\n]*N?o?\.?\s*(\d+[.\d]*[\/\-]\d+)/i);
  if (pregaoMatch) header.numero_pregao = pregaoMatch[1];

  // Processo: Aceita "64575.001022/2026-11"
  const processoMatch = text.match(/Processo[^\d\n]{0,20}(\d[\d.\/\-]+)/i);
  if (processoMatch) header.processo = processoMatch[1];

  // Modalidade
  if (/PREGÃO ELETRÔNICO/i.test(text)) header.modalidade = "Pregão Eletrônico";
  else if (/Inexigibilidade/i.test(text)) header.modalidade = "Inexigibilidade";
  else if (/Dispensa/i.test(text)) header.modalidade = "Dispensa";
  else if (/Tomada de Preço/i.test(text)) header.modalidade = "Tomada de Preço";
  else if (/Concorrência/i.test(text)) header.modalidade = "Concorrência";

  // Portal
  const portalMatch = text.match(/(comprasnet|compras\.gov\.br|bll\.org\.br|licitacoes-e\.com\.br|portaldecompraspublicas\.com\.br|www\.gov\.br\/compras|transparencia\.gov\.br)/i);
  if (portalMatch) header.portal = portalMatch[1];

  // Valor Total do Edital
  const totalMatch = text.match(/(?:Valor Total da Contratação|Valor Total Estimado|Valor Global|Total do Edital|Orçamento Estimado)[\s\S]{0,100}?R\$\s*([\d.,]+)/i);
  if (totalMatch) {
    header.valor_total_estimado = parsePtBrFloat(totalMatch[1]);
  }

  // Data da Sessão (Abertura)
  const dataMatch = text.match(/(?:Data de abertura|Data da sessão|Início da sessão|Data da licitação)[\s\S]{0,30}(\d{2}\/\d{2}\/\d{4})/i);
  if (dataMatch) header.data_abertura = dataMatch[1];

  // Contatos (Email / Tel)
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) header.contato_email = emailMatch[0];

  const telMatch = text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  if (telMatch) header.contato_tel = telMatch[0];

  return header;
}

/**
 * Extrai itens usando Estratégia Híbrida (Âncora CATMAT + State Machine)
 */
export function extractItemsLowCost(text: string): EngineItem[] {
  const lines = text.split("\n");
  const items: EngineItem[] = [];
  
  // Padrão Ouro 1: [Item] [Desc...] [CATMAT] [Unid] [Qtd] [R$ Unit] [R$ Total]
  const catmatRowRegex = /^\s*(\d{1,4})\s+(.+?)\s+(\d{5,8})\s+([A-ZÇÃÕ0-9\s\/]{2,20}?)\s+([\d.,]+)\s+R\$\s*([\d.,]+)(?:\s+([\d.,]+))?/;
  
  // Padrão Ouro 2: Sem CATMAT (Itens simples)
  const simpleRowRegex = /^\s*(\d{1,4})\s+(.+?)\s+([A-ZÇÃÕ0-9\s\/]{2,20}?)\s+([\d.,]+)\s+R\$\s*([\d.,]+)(?:\s+([\d.,]+))?/;

  // Padrão Prata: Início de item genérico ("Item 01", "01.", etc)
  const itemStartRegex = /^[\s]*(?:Item\s+)?(\d{1,3})[\s]*[.\-)]?[\s]+|^[\s]*Item[\s]+(\d+)[\s]*[.\-)]?[\s]*/i;

  let lastItem: EngineItem | null = null;

  for (let line of lines) {
    const rawLine = line;
    line = line.trim();
    if (!line || line.length < 3) continue;

    // Tenta Padrão Ouro 1 (com CATMAT)
    const gold1 = rawLine.match(catmatRowRegex);
    if (gold1) {
      if (lastItem) items.push(lastItem);
      lastItem = {
        item_number: parseInt(gold1[1]),
        descricao: gold1[2].trim(),
        catmat: gold1[3],
        unidade: gold1[4].trim(),
        quantidade: parsePtBrFloat(gold1[5]),
        valor_unitario: parsePtBrFloat(gold1[6]),
        valor_total: gold1[7] ? parsePtBrFloat(gold1[7]) : (parsePtBrFloat(gold1[5]) * parsePtBrFloat(gold1[6])),
        confidence: { score: 98, reason: "Regex Ouro (CATMAT)" }
      };
      continue;
    }

    // Tenta Padrão Ouro 2 (Sem CATMAT)
    const gold2 = rawLine.match(simpleRowRegex);
    if (gold2) {
      const itemNum = parseInt(gold2[1]);
      // Verifica se é item sequencial ou número de página (heuristic)
      if (itemNum < 2000) {
        if (lastItem) items.push(lastItem);
        lastItem = {
          item_number: itemNum,
          descricao: gold2[2].trim(),
          unidade: gold2[3].trim(),
          quantidade: parsePtBrFloat(gold2[4]),
          valor_unitario: parsePtBrFloat(gold2[5]),
          valor_total: gold2[6] ? parsePtBrFloat(gold2[6]) : (parsePtBrFloat(gold2[4]) * parsePtBrFloat(gold2[5])),
          confidence: { score: 90, reason: "Regex Ouro (Simples)" }
        };
        continue;
      }
    }

    // Tenta Padrão Prata (Início de Item)
    const itemMatch = line.match(itemStartRegex);
    if (itemMatch) {
      const itemNum = parseInt(itemMatch[1] || itemMatch[2]);
      const isSequential = lastItem ? itemNum === lastItem.item_number + 1 : itemNum === 1;
      const isLikelyHeader = /^(DO|DA|DAS|DOS|Capítulo|Seção|TÍTULO|Lei|Artigo|Decreto|UASG|Pregão|CNPJ)/i.test(line.replace(itemStartRegex, "").trim());

      if (isSequential && !isLikelyHeader) {
        if (lastItem) items.push(lastItem);
        lastItem = {
          item_number: itemNum,
          descricao: line.replace(itemStartRegex, "").trim(),
          unidade: "UN",
          quantidade: 0,
          valor_unitario: 0,
          valor_total: 0,
          confidence: { score: 50, reason: "Regex Prata (Sequencial)" }
        };
        continue;
      }
    }

    // Continuação da descrição
    if (lastItem && !/PÁGINA|UASG|Pregão|CNPJ|Identidade visual|Anexo|Termo de Referência/i.test(line)) {
      if (lastItem.descricao.length < 4000) {
        lastItem.descricao += " " + line;
      }
    }
  }

  if (lastItem) items.push(lastItem);

  // Limpeza de itens inválidos (ex: fragmentos de rodapé detectados como itens)
  return items.filter(it => 
    it.descricao.length > 5 && 
    !/Sumário|EDITAL|Lei nº|Processo nº|UASG|Pregão|Página|Anexo|Assinatura|Documento|Identidade/i.test(it.descricao)
  );
}

function parsePtBrFloat(val: string): number {
  if (!val) return 0;
  // Remove pontos de milhar, troca vírgula por ponto
  const cleaned = val.replace(/\.(?=\d{3}(,|$|\.))/g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function extractFinancialLowCost(text: string): { total_edital: number } {
  const header = extractHeaderLowCost(text);
  return { total_edital: header.valor_total_estimado || 0 };
}
