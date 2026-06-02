import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { monthKey } from "@/lib/team";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { fmtBRL, fmtNum } from "@/lib/format";
import { BarChart3 } from "lucide-react";
import { GoalsGate } from "@/components/GoalsGate";

export const Route = createFileRoute("/equipe/dashboard")({ component: DashboardEquipe });

type Emp = { id: string; full_name: string; sector_id: string | null };
type Metric = { id: string; name: string; unit: string; daily_goal: number; value_type: "quantidade" | "monetario" };
type Prod = { production_date: string; realized_value: number; metric_id: string };

function DashboardEquipe() {
  const { user, isAdmin } = useAuth();
  const [empOptions, setEmpOptions] = useState<Emp[]>([]);
  const [empId, setEmpId] = useState("");
  const [employee, setEmployee] = useState<Emp | null>(null);
  const [period, setPeriod] = useState(monthKey());
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (isAdmin) {
        const { data } = await supabase.from("employees").select("id, full_name, sector_id").eq("active", true).order("full_name");
        setEmpOptions((data || []) as Emp[]);
        if (data && data[0]) setEmpId(data[0].id);
      } else {
        const { data } = await supabase.from("employees").select("id, full_name, sector_id").eq("user_id", user.id).maybeSingle();
        if (data) { setEmployee(data as Emp); setEmpId(data.id); }
      }
    })();
  }, [user, isAdmin]);

  useEffect(() => {
    if (!empId) return;
    (async () => {
      const current = empOptions.find((e) => e.id === empId) || employee;
      if (!current?.sector_id) { setMetrics([]); setProds([]); return; }
      const start = period;
      const d = new Date(period); d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.from("sector_metrics").select("id, name, unit, daily_goal, value_type").eq("sector_id", current.sector_id).eq("active", true).order("sort_order"),
        supabase.from("daily_production_metrics").select("production_date, realized_value, metric_id").eq("employee_id", empId).gte("production_date", start).lt("production_date", end).order("production_date"),
      ]);
      setMetrics((m || []) as Metric[]);
      setProds((p || []) as Prod[]);
    })();
  }, [empId, period, empOptions, employee]);

  const daysInMonth = useMemo(() => {
    const d = new Date(period); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return d.getDate();
  }, [period]);

  const summary = useMemo(() =>
    metrics.map((m) => {
      const realized = prods.filter((p) => p.metric_id === m.id).reduce((a, p) => a + Number(p.realized_value || 0), 0);
      const monthlyGoal = m.daily_goal * daysInMonth;
      const pct = monthlyGoal > 0 ? Math.round((realized / monthlyGoal) * 100) : 0;
      return { ...m, realized, monthlyGoal, pct };
    }), [metrics, prods, daysInMonth]);

  const chartData = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    prods.forEach((p) => {
      byDate[p.production_date] = byDate[p.production_date] || {};
      byDate[p.production_date][p.metric_id] = Number(p.realized_value || 0);
    });
    return Object.keys(byDate).sort().map((date) => ({
      date,
      ...metrics.reduce((acc, m) => ({ ...acc, [m.name]: byDate[date][m.id] || 0 }), {}),
    }));
  }, [prods, metrics]);

  const colors = ["#1e3a6f", "#dc2626", "#16a34a", "#d97706", "#7c3aed"];

  return (
    <AppShell title="Meu desempenho">
      <PageHeader
        title="Meu desempenho"
        description="Comparativo entre meta e realizado no período."
        icon={BarChart3}
        actions={
          <>
            {isAdmin && (
              <select className="h-9 border rounded-md px-2 text-sm bg-background" value={empId} onChange={(e) => setEmpId(e.target.value)}>
                {empOptions.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            )}
            <input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} className="h-9 border rounded-md px-2 text-sm bg-background" />
          </>
        }
      />

      <GoalsGate period={period}>

      {summary.length === 0 ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground text-center">Nenhuma métrica configurada para o setor deste funcionário.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {summary.map((s) => {
              const isMoney = s.value_type === "monetario";
              const tone = s.pct >= 100 ? "success" : s.pct >= 70 ? "warning" : "destructive";
              return (
                <StatCard
                  key={s.id}
                  label={`${s.name}${isMoney ? " (R$)" : ""}`}
                  tone={tone}
                  value={
                    <span>
                      {isMoney ? fmtBRL(s.realized) : fmtNum(s.realized)}
                      <span className="text-sm font-normal text-muted-foreground"> / {isMoney ? fmtBRL(s.monthlyGoal) : `${fmtNum(s.monthlyGoal)} ${s.unit}`}</span>
                    </span>
                  }
                  hint={`${s.pct}% do mês`}
                />
              );
            })}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Produção diária por métrica</CardTitle></CardHeader>
            <CardContent style={{ height: 320 }}>
              {chartData.length === 0 ? (
                <div className="text-sm text-muted-foreground py-12 text-center">Sem lançamentos no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(8, 10)} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {metrics.map((m, i) => (
                      <Line key={m.id} type="monotone" dataKey={m.name} stroke={colors[i % colors.length]} strokeWidth={2} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
      </GoalsGate>
    </AppShell>
  );
}
