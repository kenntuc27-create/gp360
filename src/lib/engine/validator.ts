import { EngineItem, EngineHeader } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  total_calculated: number;
  divergences: { item: number; type: string; details: string }[];
}

/**
 * ETAPA 7 — VALIDAÇÃO AUTOMÁTICA
 * Realiza verificações matemáticas, de consistência e de sequencial.
 */
export function validateExtraction(
  header: EngineHeader,
  items: EngineItem[],
  totalEstimatedFromHeader?: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const divergences: { item: number; type: string; details: string }[] = [];

  // 1. Validação de somas por item
  let totalCalculated = 0;
  items.forEach(it => {
    const unit = Number(it.valor_unitario) || 0;
    const qty = Number(it.quantidade) || 0;
    const statedTotal = Number(it.valor_total) || 0;
    const calculatedTotal = unit * qty;
    
    totalCalculated += statedTotal || calculatedTotal;
    
    // Alerta se o total da linha divergir muito da multiplicação
    if (statedTotal > 0 && Math.abs(statedTotal - calculatedTotal) > 0.05) {
      const msg = `Qtd (${qty}) x Unit (${unit.toLocaleString('pt-BR')}) = ${calculatedTotal.toLocaleString('pt-BR')} != Total informado (${statedTotal.toLocaleString('pt-BR')})`;
      divergences.push({ item: it.item_number, type: "matematica", details: msg });
      warnings.push(`Divergência matemática no Item ${it.item_number}: ${msg}`);
    }

    // Validação de dados básicos
    if (it.descricao.length < 5) {
      warnings.push(`Item ${it.item_number}: Descrição muito curta ou ausente.`);
    }
    if (qty <= 0) {
      errors.push(`Item ${it.item_number}: Quantidade inválida (${qty}).`);
    }
  });

  // 2. Validação contra o total do edital
  const totalEdital = totalEstimatedFromHeader || header.valor_total_estimado || 0;
  if (totalEdital > 0) {
    const diff = Math.abs(totalEdital - totalCalculated);
    if (diff > totalEdital * 0.02) { // 2% de tolerância para arredondamentos
      const msg = `A soma dos itens (${totalCalculated.toLocaleString('pt-BR')}) diverge do valor total do edital (${totalEdital.toLocaleString('pt-BR')})`;
      errors.push(msg);
      divergences.push({ item: 0, type: "total_global", details: msg });
    }
  }

  // 3. Verificação de sequencial e lacunas
  const numbers = items.map(it => it.item_number).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i+1] !== numbers[i] + 1 && numbers[i+1] !== numbers[i]) {
      warnings.push(`Lacuna detectada na numeração: salto do item ${numbers[i]} para o ${numbers[i+1]}`);
    }
  }

  // 4. Verificação de duplicidade de números de itens
  const uniqueNumbers = new Set(numbers);
  if (uniqueNumbers.size !== numbers.length) {
    warnings.push("Existem itens com o mesmo número identificador.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    total_calculated: totalCalculated,
    divergences
  };
}
