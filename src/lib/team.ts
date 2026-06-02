import { supabase } from "@/integrations/supabase/client";

export type Sector = { id: string; name: string };
export type Employee = {
  id: string;
  full_name: string;
  email: string | null;
  sector_id: string | null;
  user_id: string | null;
  active: boolean;
};
export type SectorMetric = {
  id: string;
  sector_id: string;
  name: string;
  unit: string;
  daily_goal: number;
  sort_order: number;
  active: boolean;
};
export type DailyProductionMetric = {
  id: string;
  employee_id: string;
  metric_id: string;
  production_date: string;
  realized_value: number;
  notes: string | null;
  submitted_at: string;
  status: "no_prazo" | "atrasado" | "nao_preenchido";
};

export function monthKey(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Retorna se a entrega de hoje está atrasada com base no horário-limite. */
export function computeStatus(now: Date = new Date()): "no_prazo" | "atrasado" {
  const day = now.getDay(); // 0=dom 6=sab
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (day === 0) return "atrasado"; // domingo não há janela
  const limit = day === 6 ? 11 * 60 + 30 : 17 * 60 + 30;
  return minutes <= limit ? "no_prazo" : "atrasado";
}

export async function getOnboardingState() {
  const [{ count: emp }, { count: metrics }] = await Promise.all([
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("sector_metrics").select("*", { count: "exact", head: true }).eq("active", true),
  ]);
  return {
    hasEmployees: (emp || 0) > 0,
    employeesCount: emp || 0,
    metricsCount: metrics || 0,
    needsGoals: (emp || 0) > 0 && (metrics || 0) === 0,
  };
}
