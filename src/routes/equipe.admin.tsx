import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { monthKey, todayISO } from "@/lib/team";
import { fmtBRL } from "@/lib/format";
import { Target, TrendingUp, Percent, AlertCircle, LayoutDashboard, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/equipe/admin")({ component: AdminDashboard });

type Business = { id: string; name: string };
type Sector = { id: string; name: string; business_id: string | null };
type Emp = { id: string; full_name: string; sector_id: string | null };
type EmpBiz = { employee_id: string; business_id: string };
type Metric = { id: string; sector_id: string; value_type: string };
type Prod = { employee_id: string; metric_id: string; realized_value: number; production_date: string; status: string };
type EmpGoal = { employee_id: string; business_id: string | null; target_amount: number; working_days: number };
type BizGoal = { business_id: string; target_amount: number; working_days: number };

function toneFromPct(pct: number): "success" | "warning" | "destructive" {
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "destructive";
}

function AdminDashboard() {
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState(monthKey());
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [empBiz, setEmpBiz] = useState<EmpBiz[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [productions, setProductions] = useState<Prod[]>([]);
  const [goals, setGoals] = useState<EmpGoal[]>([]);
  const [bizGoals, setBizGoals] = useState<BizGoal[]>([]);
  const [bizFilter, setBizFilter] = useState<string>("all");

  const periodEnd = useMemo(() => { const d = new Date(period); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); }, [period]);

  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: s }, { data: e }, { data: eb }, { data: m }] = await Promise.all([
        (supabase.from as any)("businesses").select("id, name").eq("active", true).order("sort_order"),
        supabase.from("sectors").select("id, name, business_id").order("name"),
        supabase.from("employees").select("id, full_name, sector_id").eq("active", true),
        (supabase.from as any)("employee_businesses").select("employee_id, business_id"),
        supabase.from("sector_metrics").select("id, sector_id, value_type").eq("active", true),
      ]);
      setBusinesses((b || []) as Business[]);
      setSectors((s || []) as Sector[]);
      setEmployees((e || []) as Emp[]);
      setEmpBiz((eb || []) as EmpBiz[]);
      setMetrics((m || []) as Metric[]);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: prod }, { data: g }, { data: bg }] = await Promise.all([
        supabase.from("daily_production_metrics")
          .select("employee_id, metric_id, realized_value, production_date, status")
          .gte("production_date", period).lt("production_date", periodEnd),
        (supabase.from as any)("employee_goals").select("employee_id, business_id, target_amount, working_days").eq("reference_month", period),
        (supabase.from as any)("business_goals").select("business_id, target_amount, working_days").eq("reference_month", period),
      ]);
      setProductions((prod || []) as Prod[]);
      setGoals((g || []) as EmpGoal[]);
      setBizGoals((bg || []) as BizGoal[]);
    })();
  }, [period, periodEnd]);

  const monetaryMetricIds = useMemo(() => new Set(metrics.filter((m) => m.value_type === "monetario").map((m) => m.id)), [metrics]);

  // Funcionários filtrados pelo negócio (via vínculo direto OU via setor do negócio)
  const empsInBusiness = useMemo(() => {
    if (bizFilter === "all") return employees;
    const direct = new Set(empBiz.filter((x) => x.business_id === bizFilter).map((x) => x.employee_id));
    const sectorIds = new Set(sectors.filter((s) => s.business_id === bizFilter).map((s) => s.id));
    return employees.filter((e) => direct.has(e.id) || (e.sector_id && sectorIds.has(e.sector_id)));
  }, [employees, empBiz, sectors, bizFilter]);

  const today = todayISO();
  const isCurrentMonth = period.slice(0, 7) === today.slice(0, 7);

  const rows = useMemo(() => empsInBusiness.map((e) => {
    // pega meta do funcionário no negócio filtrado (ou soma se "all")
    const myGoals = bizFilter === "all"
      ? goals.filter((g) => g.employee_id === e.id)
      : goals.filter((g) => g.employee_id === e.id && g.business_id === bizFilter);
    const monthTarget = myGoals.reduce((a, g) => a + Number(g.target_amount || 0), 0);
    const days = myGoals[0]?.working_days || 22;
    const dailyTarget = days > 0 ? monthTarget / days : 0;
    const realizedMonth = productions
      .filter((p) => p.employee_id === e.id && monetaryMetricIds.has(p.metric_id))
      .reduce((a, p) => a + Number(p.realized_value || 0), 0);
    const realizedToday = productions
      .filter((p) => p.employee_id === e.id && p.production_date === today && monetaryMetricIds.has(p.metric_id))
      .reduce((a, p) => a + Number(p.realized_value || 0), 0);
    const pctMonth = monthTarget > 0 ? Math.round((realizedMonth / monthTarget) * 100) : 0;
    const pctDay = dailyTarget > 0 ? Math.round((realizedToday / dailyTarget) * 100) : 0;
    return { id: e.id, name: e.full_name, monthTarget, dailyTarget, realizedMonth, realizedToday, pctMonth, pctDay };
  }).sort((a, b) => b.pctMonth - a.pctMonth), [empsInBusiness, goals, productions, monetaryMetricIds, today, bizFilter]);

  // Totais (preferir meta do negócio se filtrado, senão soma das individuais)
  const bizGoalSelected = bizFilter !== "all" ? bizGoals.find((b) => b.business_id === bizFilter) : null;
  const sumIndivTarget = rows.reduce((a, r) => a + r.monthTarget, 0);
  const totalTarget = bizGoalSelected ? Number(bizGoalSelected.target_amount) : (bizFilter === "all" ? bizGoals.reduce((a, g) => a + Number(g.target_amount || 0), 0) || sumIndivTarget : sumIndivTarget);
  const workingDays = bizGoalSelected?.working_days || 22;
  const totalReal = rows.reduce((a, r) => a + r.realizedMonth, 0);
  const totalPct = totalTarget > 0 ? Math.round((totalReal / totalTarget) * 100) : 0;
  const dailyTotalTarget = workingDays > 0 ? totalTarget / workingDays : 0;
  const dailyTotalReal = rows.reduce((a, r) => a + r.realizedToday, 0);
  const atrasados = productions.filter((p) => p.status === "atrasado").length;

  if (!isAdmin) return <AppShell title="Painel admin"><Card><CardContent className="py-8 text-sm text-muted-foreground">Apenas administradores.</CardContent></Card></AppShell>;

  const currentBizName = bizFilter === "all" ? "Consolidado" : (businesses.find((b) => b.id === bizFilter)?.name || "");

  return (
    <AppShell title="Painel da equipe">
      <PageHeader
        title="Painel da Equipe"
        description={`Meta vs realizado por funcionário — ${currentBizName}.`}
        icon={LayoutDashboard}
        actions={<Input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} className="w-[140px]" />}
      />

      {/* Abas por negócio */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant={bizFilter === "all" ? "default" : "outline"} onClick={() => setBizFilter("all")}>
          Consolidado
        </Button>
        {businesses.map((b) => (
          <Button key={b.id} size="sm" variant={bizFilter === b.id ? "default" : "outline"} onClick={() => setBizFilter(b.id)}>
            <Briefcase className="size-4 mr-1" />{b.name}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {isCurrentMonth ? (
          <StatCard label="Meta do dia" value={fmtBRL(dailyTotalTarget)} icon={Target} tone="primary"
            hint={`Realizado hoje: ${fmtBRL(dailyTotalReal)}`} />
        ) : (
          <StatCard label="Meta diária" value={fmtBRL(dailyTotalTarget)} icon={Target} tone="primary" />
        )}
        <StatCard label="Meta do mês" value={fmtBRL(totalTarget)} icon={Target}
          hint={bizGoalSelected ? "Meta do negócio" : "Soma individual"} />
        <StatCard label="Realizado mês" value={fmtBRL(totalReal)} icon={TrendingUp} tone="primary" />
        <StatCard label="% atingido" value={`${totalPct}%`} icon={Percent} tone={toneFromPct(totalPct)} />
      </div>

      {atrasados > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> {atrasados} lançamento(s) marcado(s) como atrasados no período.
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Progresso por funcionário</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Sem funcionários ou metas no período.</p>}
          {rows.map((r) => {
            const tone = toneFromPct(r.pctMonth);
            const colorClass = tone === "success" ? "[&>div]:bg-success" : tone === "warning" ? "[&>div]:bg-warning" : "[&>div]:bg-destructive";
            // negócios deste funcionário (badges)
            const myBizIds = new Set(empBiz.filter((x) => x.employee_id === r.id).map((x) => x.business_id));
            const myBizNames = businesses.filter((b) => myBizIds.has(b.id)).map((b) => b.name);
            return (
              <div key={r.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium">{r.name}</div>
                      {myBizNames.map((n) => <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Meta mês: {fmtBRL(r.monthTarget)} · Diária: {fmtBRL(r.dailyTarget)}
                      {isCurrentMonth && <> · Hoje: {fmtBRL(r.realizedToday)} ({r.pctDay}%)</>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-lg font-bold",
                      tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "text-destructive")}>
                      {r.pctMonth}%
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtBRL(r.realizedMonth)} / {fmtBRL(r.monthTarget)}</div>
                  </div>
                </div>
                <Progress value={Math.min(100, r.pctMonth)} className={colorClass} />
                {r.monthTarget === 0 && (
                  <div className="text-xs text-warning-foreground mt-2">⚠ Sem meta definida — defina em <strong>Metas</strong>.</div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </AppShell>
  );
}
