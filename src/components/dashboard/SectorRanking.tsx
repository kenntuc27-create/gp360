import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingDown, Activity } from "lucide-react";
import { monthKey } from "@/lib/team";

type Sector = { id: string; name: string };
type Metric = { id: string; sector_id: string; daily_goal: number | null };
type Prod = { metric_id: string; realized_value: number };

export function SectorRanking() {
  const [rows, setRows] = useState<{ id: string; name: string; achievement: number; produced: number; goal: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const period = monthKey();
      const d = new Date(period); d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const [{ data: s }, { data: m }, { data: p }] = await Promise.all([
        supabase.from("sectors").select("id, name").order("name"),
        supabase.from("sector_metrics").select("id, sector_id, daily_goal").eq("active", true),
        supabase.from("daily_production_metrics")
          .select("metric_id, realized_value")
          .gte("production_date", period).lt("production_date", end),
      ]);
      if (cancel) return;
      const sectors = (s || []) as Sector[];
      const metrics = (m || []) as Metric[];
      const prods = (p || []) as Prod[];

      const metricToSector = new Map(metrics.map((x) => [x.id, x.sector_id]));
      const goalBySector = new Map<string, number>();
      const today = new Date();
      const workingDays = Math.max(1, today.getDate());
      metrics.forEach((mt) => {
        const g = (Number(mt.daily_goal) || 0) * workingDays;
        goalBySector.set(mt.sector_id, (goalBySector.get(mt.sector_id) || 0) + g);
      });
      const prodBySector = new Map<string, number>();
      prods.forEach((pr) => {
        const sid = metricToSector.get(pr.metric_id);
        if (!sid) return;
        prodBySector.set(sid, (prodBySector.get(sid) || 0) + (Number(pr.realized_value) || 0));
      });
      const computed = sectors.map((sec) => {
        const produced = prodBySector.get(sec.id) || 0;
        const goal = goalBySector.get(sec.id) || 0;
        const achievement = goal > 0 ? (produced / goal) * 100 : 0;
        return { id: sec.id, name: sec.name, produced, goal, achievement };
      }).filter((r) => r.goal > 0)
        .sort((a, b) => b.achievement - a.achievement);
      setRows(computed);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const top = rows[0];
  const bottom = rows[rows.length - 1];

  const tone = (a: number) => a >= 90 ? "bg-emerald-100 text-emerald-700" : a >= 60 ? "bg-amber-100 text-amber-700" : "bg-destructive/10 text-destructive";

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><Activity className="size-4 text-primary" />Ranking de Setores</span>}
      description="Aderência à meta no mês"
    >
      {loading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Sem metas configuradas para o mês.</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {top && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2.5">
                <div className="text-[10px] font-semibold uppercase text-emerald-700 inline-flex items-center gap-1">
                  <Trophy className="size-3" />Melhor setor
                </div>
                <div className="text-sm font-semibold mt-1 truncate">{top.name}</div>
                <div className="text-xs text-muted-foreground">{top.achievement.toFixed(0)}% atingido</div>
              </div>
            )}
            {bottom && bottom.id !== top?.id && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                <div className="text-[10px] font-semibold uppercase text-destructive inline-flex items-center gap-1">
                  <TrendingDown className="size-3" />Pior setor
                </div>
                <div className="text-sm font-semibold mt-1 truncate">{bottom.name}</div>
                <div className="text-xs text-muted-foreground">{bottom.achievement.toFixed(0)}% atingido</div>
              </div>
            )}
          </div>
          <ul className="divide-y text-sm">
            {rows.slice(0, 6).map((r, i) => (
              <li key={r.id} className="flex items-center justify-between py-1.5">
                <span className="truncate"><span className="text-muted-foreground mr-2 tabular-nums">#{i + 1}</span>{r.name}</span>
                <Badge variant="outline" className={tone(r.achievement)}>{r.achievement.toFixed(0)}%</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
