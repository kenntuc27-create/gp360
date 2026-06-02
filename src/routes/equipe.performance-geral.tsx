import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtBRL, fmtNum } from "@/lib/format";
import { dailyGoalFor, monthlyGoalFor, pctAchieved, pctTone } from "@/lib/performance";
import { monthKey } from "@/lib/team";
import { GoalsGate } from "@/components/GoalsGate";
import {
  TrendingUp, Trophy, Target, Activity, Building2, Users, AlertTriangle, ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/equipe/performance-geral")({ component: PerformanceGeral });

type Business = { id: string; name: string };
type Sector = { id: string; name: string; business_id: string | null };
type Employee = { id: string; full_name: string; sector_id: string | null };
type EmpBiz = { employee_id: string; business_id: string };
type Metric = { id: string; sector_id: string; name: string; unit: string; daily_goal: number | null; value_type: string };
type Prod = { employee_id: string; metric_id: string; production_date: string; realized_value: number };
type EmpGoal = { employee_id: string; target_amount: number; working_days: number };
type SectorGoal = { sector_id: string; target_amount: number; working_days: number };

function PerformanceGeral() {
  const { isAdmin, nivelAcesso } = useAuth();

  const [period, setPeriod] = useState(monthKey());
  const [businessId, setBusinessId] = useState<string>("all");

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empBiz, setEmpBiz] = useState<EmpBiz[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);
  const [empGoals, setEmpGoals] = useState<EmpGoal[]>([]);
  const [sectorGoals, setSectorGoals] = useState<SectorGoal[]>([]);

  // Load reference data once
  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: s }, { data: e }, { data: eb }] = await Promise.all([
        supabase.from("businesses").select("id, name").eq("active", true).order("name"),
        supabase.from("sectors").select("id, name, business_id").order("name"),
        supabase.from("employees").select("id, full_name, sector_id").eq("active", true).order("full_name"),
        supabase.from("employee_businesses").select("employee_id, business_id"),
      ]);
      setBusinesses((b || []) as Business[]);
      setSectors((s || []) as Sector[]);
      setEmployees((e || []) as Employee[]);
      setEmpBiz((eb || []) as EmpBiz[]);
    })();
  }, []);

  // Load period data
  useEffect(() => {
    (async () => {
      const start = period;
      const d = new Date(period); d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const [{ data: m }, { data: p }, { data: eg }, { data: bg }] = await Promise.all([
        supabase.from("sector_metrics").select("id, sector_id, name, unit, daily_goal, value_type").eq("active", true),
        supabase.from("daily_production_metrics")
          .select("employee_id, metric_id, production_date, realized_value")
          .gte("production_date", start).lt("production_date", end),
        supabase.from("employee_goals").select("employee_id, target_amount, working_days").eq("reference_month", period),
        supabase.from("business_goals").select("business_id, target_amount, working_days").eq("reference_month", period),
      ]);
      setMetrics((m || []) as Metric[]);
      setProds((p || []) as Prod[]);
      setEmpGoals((eg || []) as EmpGoal[]);
      // map business_goals → sector_goals via business_id (we don't have sector_goals table; reuse business)
      const mapped = ((bg || []) as any[]).map((g) => ({ sector_id: g.business_id, target_amount: g.target_amount, working_days: g.working_days }));
      setSectorGoals(mapped as SectorGoal[]);
    })();
  }, [period]);

  // Filter by business
  const employeesByBiz = useMemo(() => {
    if (businessId === "all") return employees;
    const ids = new Set(empBiz.filter((x) => x.business_id === businessId).map((x) => x.employee_id));
    return employees.filter((e) => ids.has(e.id));
  }, [employees, empBiz, businessId]);

  const sectorsByBiz = useMemo(() => {
    if (businessId === "all") return sectors;
    return sectors.filter((s) => s.business_id === businessId);
  }, [sectors, businessId]);

  const metricsByBiz = useMemo(() => {
    const sectorIds = new Set(sectorsByBiz.map((s) => s.id));
    return metrics.filter((m) => sectorIds.has(m.sector_id));
  }, [metrics, sectorsByBiz]);

  // Map helpers
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const sectorMap = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const goalMap = useMemo(() => new Map(empGoals.map((g) => [g.employee_id, g])), [empGoals]);

  // Filter prods: somente lançamentos de funcionários do escopo (não contabiliza ausentes)
  const empIdsScope = useMemo(() => new Set(employeesByBiz.map((e) => e.id)), [employeesByBiz]);
  const metricIdsScope = useMemo(() => new Set(metricsByBiz.map((m) => m.id)), [metricsByBiz]);
  const prodsScope = useMemo(
    () => prods.filter((p) => empIdsScope.has(p.employee_id) && metricIdsScope.has(p.metric_id)),
    [prods, empIdsScope, metricIdsScope]
  );

  // ===== Empresa (consolidado) =====
  const company = useMemo(() => {
    const realized = prodsScope.reduce((a, p) => a + Number(p.realized_value || 0), 0);
    let monthlyGoalTotal = 0;
    employeesByBiz.forEach((e) => {
      const g = goalMap.get(e.id);
      if (g && g.target_amount > 0) {
        monthlyGoalTotal += Number(g.target_amount);
      } else {
        // soma das metas das métricas do setor desse funcionário
        const sm = metricsByBiz.filter((m) => m.sector_id === e.sector_id);
        sm.forEach((m) => {
          monthlyGoalTotal += monthlyGoalFor(null, m, g?.working_days || 22);
        });
      }
    });
    const pct = pctAchieved(realized, monthlyGoalTotal);
    return { realized, monthlyGoalTotal, pct };
  }, [prodsScope, employeesByBiz, metricsByBiz, goalMap]);

  // ===== Por funcionário =====
  const employeeRows = useMemo(() => {
    return employeesByBiz.map((e) => {
      const goal = goalMap.get(e.id) || null;
      const sectorMetrics = metricsByBiz.filter((m) => m.sector_id === e.sector_id);
      const realized = prodsScope
        .filter((p) => p.employee_id === e.id)
        .reduce((a, p) => a + Number(p.realized_value || 0), 0);
      let monthlyGoal = Number(goal?.target_amount || 0);
      if (monthlyGoal <= 0) {
        monthlyGoal = sectorMetrics.reduce((a, m) => a + monthlyGoalFor(null, m, goal?.working_days || 22), 0);
      }
      const dailyGoal = goal?.target_amount && goal.working_days
        ? goal.target_amount / goal.working_days
        : sectorMetrics.reduce((a, m) => a + dailyGoalFor(m, null), 0);
      const lancou = prodsScope.some((p) => p.employee_id === e.id);
      return {
        id: e.id,
        name: e.full_name,
        sector: sectorMap.get(e.sector_id || "")?.name || "—",
        realized,
        monthlyGoal,
        dailyGoal,
        pct: pctAchieved(realized, monthlyGoal),
        pendente: !lancou,
      };
    }).sort((a, b) => b.pct - a.pct);
  }, [employeesByBiz, metricsByBiz, prodsScope, goalMap, sectorMap]);

  // ===== Por setor =====
  const sectorRows = useMemo(() => {
    return sectorsByBiz.map((s) => {
      const empsOfSector = employeesByBiz.filter((e) => e.sector_id === s.id);
      const realized = prodsScope
        .filter((p) => empsOfSector.some((e) => e.id === p.employee_id))
        .reduce((a, p) => a + Number(p.realized_value || 0), 0);
      const goalsForSector = empsOfSector.map((e) => goalMap.get(e.id)).filter(Boolean) as EmpGoal[];
      let monthlyGoal = goalsForSector.reduce((a, g) => a + Number(g.target_amount || 0), 0);
      if (monthlyGoal <= 0) {
        const sm = metricsByBiz.filter((m) => m.sector_id === s.id);
        monthlyGoal = sm.reduce((a, m) => a + monthlyGoalFor(null, m, 22), 0) * Math.max(1, empsOfSector.length);
      }
      return {
        id: s.id,
        name: s.name,
        employees: empsOfSector.length,
        realized,
        monthlyGoal,
        pct: pctAchieved(realized, monthlyGoal),
      };
    }).sort((a, b) => b.pct - a.pct);
  }, [sectorsByBiz, employeesByBiz, prodsScope, metricsByBiz, goalMap]);

  const top5 = employeeRows.slice(0, 5);
  const pendentes = employeeRows.filter((r) => r.pendente);

  const chartData = sectorRows.slice(0, 8).map((s) => ({
    setor: s.name,
    Realizado: Math.round(s.realized),
    Meta: Math.round(s.monthlyGoal),
  }));

  return (
    <AppShell title="Gestão de Performance">
      <PageHeader
        title="Performance Geral"
        description="Indicadores padronizados por empresa, setor e funcionário."
        icon={TrendingUp}
        actions={
          <>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Negócio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os negócios</SelectItem>
                {businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <input
              type="month"
              value={period.slice(0, 7)}
              onChange={(e) => setPeriod(`${e.target.value}-01`)}
              className="h-9 border rounded-md px-2 text-sm bg-background"
            />
          </>
        }
      />

      <GoalsGate period={period}>

      {/* Cards resumo - Empresa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Produção total"
          value={fmtBRL(company.realized)}
          icon={Activity}
          tone="primary"
          hint={`${employeesByBiz.length} funcionário(s) no escopo`}
        />
        <StatCard
          label="Meta mensal"
          value={fmtBRL(company.monthlyGoalTotal)}
          icon={Target}
          tone="default"
          hint={businessId === "all" ? "Soma de todos os negócios" : businesses.find((b) => b.id === businessId)?.name}
        />
        <StatCard
          label="% atingido"
          value={`${company.pct}%`}
          icon={TrendingUp}
          tone={pctTone(company.pct)}
          hint={
            company.pct >= 100
              ? `Excedente de ${fmtBRL(company.realized - company.monthlyGoalTotal)}`
              : `Faltam ${fmtBRL(Math.max(0, company.monthlyGoalTotal - company.realized))}`
          }
        />
        <StatCard
          label="Lançamentos pendentes"
          value={String(pendentes.length)}
          icon={AlertTriangle}
          tone={pendentes.length === 0 ? "success" : "warning"}
          hint={pendentes.length === 0 ? "Todos lançaram produção" : "Funcionários sem produção no período"}
        />
      </div>

      <Tabs defaultValue="empresa" className="mb-5">
        <TabsList>
          <TabsTrigger value="empresa"><Building2 className="size-4 mr-1" /> Empresa</TabsTrigger>
          <TabsTrigger value="setor"><Users className="size-4 mr-1" /> Setor</TabsTrigger>
          <TabsTrigger value="funcionario"><Trophy className="size-4 mr-1" /> Funcionário</TabsTrigger>
        </TabsList>

        {/* EMPRESA */}
        <TabsContent value="empresa" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Meta vs Realizado por setor</CardTitle></CardHeader>
            <CardContent style={{ height: 320 }}>
              {chartData.length === 0 ? (
                <div className="text-sm text-muted-foreground py-12 text-center">Sem dados no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="setor" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                    <Legend />
                    <Bar dataKey="Meta" fill="hsl(var(--muted-foreground) / 0.4)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SETOR */}
        <TabsContent value="setor" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Ranking por setor</CardTitle></CardHeader>
            <CardContent>
              {sectorRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum setor no escopo.</p>
              ) : (
                <div className="space-y-1">
                  {sectorRows.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                        <div>
                          <div className="text-sm font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.employees} funcionário(s)</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground hidden md:inline">{fmtBRL(s.realized)} / {fmtBRL(s.monthlyGoal)}</span>
                        <Badge className={
                          pctTone(s.pct) === "success" ? "bg-success text-success-foreground" :
                          pctTone(s.pct) === "warning" ? "bg-warning text-warning-foreground" :
                          "bg-destructive text-destructive-foreground"
                        }>{s.pct}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FUNCIONÁRIO */}
        <TabsContent value="funcionario" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="size-4 text-amber-500" /> Top 5</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {top5.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> :
                  top5.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold w-6">#{i + 1}</span>
                        <div>
                          <div className="text-sm font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.sector}</div>
                        </div>
                      </div>
                      <Badge className={
                        pctTone(r.pct) === "success" ? "bg-success text-success-foreground" :
                        pctTone(r.pct) === "warning" ? "bg-warning text-warning-foreground" :
                        "bg-destructive text-destructive-foreground"
                      }>{r.pct}%</Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /> Lançamentos pendentes</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {pendentes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tudo lançado no período. ✅</p>
                ) : pendentes.slice(0, 8).map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.sector}</div>
                    </div>
                    <Badge variant="outline">Sem produção</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Ranking completo</CardTitle></CardHeader>
            <CardContent>
              {employeeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum funcionário no escopo.</p>
              ) : (
                <div className="space-y-1">
                  {employeeRows.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.sector}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {r.pendente && <Badge variant="outline" className="hidden sm:inline-flex">Pendente</Badge>}
                        <span className="text-muted-foreground hidden md:inline">{fmtBRL(r.realized)} / {fmtBRL(r.monthlyGoal)}</span>
                        <Badge className={
                          pctTone(r.pct) === "success" ? "bg-success text-success-foreground" :
                          pctTone(r.pct) === "warning" ? "bg-warning text-warning-foreground" :
                          "bg-destructive text-destructive-foreground"
                        }>{r.pct}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      </GoalsGate>

      <div className="text-xs text-muted-foreground">
        Cálculos seguem regra única: meta diária = <code>daily_goal</code> ou <code>meta_mensal / dias_úteis</code>; % atingido = realizado / meta × 100. Funcionários sem lançamento aparecem como pendentes e não inflam o realizado.
      </div>
    </AppShell>
  );
}
