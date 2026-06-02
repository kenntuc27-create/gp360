/**
 * Regras únicas de cálculo de performance.
 * Nunca duplicar essa lógica fora deste arquivo.
 */

export type MetricLite = {
  id: string;
  daily_goal: number | null;
  value_type?: string;
};

export type GoalLite = {
  target_amount: number;
  working_days: number;
};

/** Meta diária padronizada: prioriza daily_goal; cai para mensal/dias úteis. */
export function dailyGoalFor(metric: MetricLite | null, monthlyGoal?: GoalLite | null): number {
  const direct = Number(metric?.daily_goal || 0);
  if (direct > 0) return direct;
  const tgt = Number(monthlyGoal?.target_amount || 0);
  const days = Number(monthlyGoal?.working_days || 0);
  if (tgt > 0 && days > 0) return tgt / days;
  return 0;
}

/** Meta mensal padronizada: meta direta OU daily_goal × dias úteis. */
export function monthlyGoalFor(monthlyGoal?: GoalLite | null, metric?: MetricLite | null, workingDays = 22): number {
  const direct = Number(monthlyGoal?.target_amount || 0);
  if (direct > 0) return direct;
  const dg = Number(metric?.daily_goal || 0);
  const days = Number(monthlyGoal?.working_days || workingDays || 0);
  if (dg > 0 && days > 0) return dg * days;
  return 0;
}

/** % atingido com proteção contra divisão por zero. */
export function pctAchieved(realized: number, goal: number): number {
  if (!goal || goal <= 0) return 0;
  return Math.round((Number(realized || 0) / goal) * 100);
}

/** Diferença (faltante negativo, excedente positivo). */
export function delta(realized: number, goal: number): number {
  return Number(realized || 0) - Number(goal || 0);
}

/** Tom semântico para % atingido. */
export function pctTone(pct: number): "success" | "warning" | "destructive" {
  if (pct >= 90) return "success";
  if (pct >= 60) return "warning";
  return "destructive";
}
