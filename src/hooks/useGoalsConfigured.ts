import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { monthKey } from "@/lib/team";

/**
 * Verifica se há AO MENOS UMA meta válida (>0) configurada
 * em qualquer um dos níveis: business, sector ou employee.
 * O sistema só deve liberar dashboards quando isso for true.
 */
export function useGoalsConfigured(period: string = monthKey()) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  async function check() {
    setLoading(true);
    try {
      const [biz, sec, emp] = await Promise.all([
        (supabase.from as any)("business_goals")
          .select("id", { count: "exact", head: true })
          .eq("reference_month", period)
          .gt("target_amount", 0),
        supabase
          .from("sectors")
          .select("id", { count: "exact", head: true })
          .gt("monthly_revenue_target", 0),
        (supabase.from as any)("employee_goals")
          .select("id", { count: "exact", head: true })
          .eq("reference_month", period)
          .gt("target_amount", 0),
      ]);
      const total = (biz.count || 0) + (sec.count || 0) + (emp.count || 0);
      setConfigured(total > 0);
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  return { configured, loading, refresh: check };
}
