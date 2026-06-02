import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/Sparkline";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getOnboardingState, monthKey, todayISO } from "@/lib/team";
import { fmtBRL } from "@/lib/format";
import {
  Plus, TrendingUp, TrendingDown, Minus, Trophy, Target, AlertTriangle,
  Activity, ClipboardList, FileText, BarChart3, ArrowRight, ListTodo,
  CheckCircle2, Clock, CircleDot, Sparkles, Users, Fingerprint,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/equipe/")({ component: EquipeHome });

type Emp = { id: string; full_name: string; sector_id: string | null };
type Metric = { id: string; value_type: string };
type Prod = { employee_id: string; metric_id: string; realized_value: number; production_date: string; status: string };
type EmpGoal = { employee_id: string; target_amount: number; working_days: number };
type Score = { employee_id: string; score: number; classification: string };
type AdhStatus = { employee_id: string; status: string; production_ok: boolean };
type Alert = { id: string; employee_id: string; severity: string; message: string; alert_type: string };
type Task = { id: string; title: string; status: string; assignee_id: string | null };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function classBadgeTone(c: string) {
  if (c === "A") return "bg-success text-success-foreground";
  if (c === "B") return "bg-success/80 text-success-foreground";
  if (c === "C") return "bg-warning text-warning-foreground";
  return "bg-destructive text-destructive-foreground";
}

function EquipeHome() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [onboarding, setOnboarding] = useState<{ hasEmployees: boolean; needsGoals: boolean } | null>(null);

  const [employees, setEmployees] = useState<Emp[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [prodMonth, setProdMonth] = useState<Prod[]>([]);
  const [goals, setGoals] = useState<EmpGoal[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [adh, setAdh] = useState<AdhStatus[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => { getOnboardingState().then(setOnboarding); }, []);
  useEffect(() => {
    if (!onboarding || !isAdmin) return;
    if (!onboarding.hasEmployees || onboarding.needsGoals) navigate({ to: "/equipe/onboarding" });
  }, [onboarding, isAdmin, navigate]);

  const period = monthKey();
  const today = todayISO();

  useEffect(() => {
    (async () => {
      const periodEnd = (() => { const d = new Date(period); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); })();
      const [
        { data: emp }, { data: m }, { data: prod }, { data: g },
        { data: sc }, { data: ad }, { data: al }, { data: tk },
      ] = await Promise.all([
        supabase.from("employees").select("id, full_name, sector_id").eq("active", true),
        supabase.from("sector_metrics").select("id, value_type").eq("active", true),
        supabase.from("daily_production_metrics")
          .select("employee_id, metric_id, realized_value, production_date, status")
          .gte("production_date", period).lt("production_date", periodEnd),
        supabase.from("employee_goals").select("employee_id, target_amount, working_days").eq("reference_month", period),
        supabase.from("performance_scores").select("employee_id, score, classification").eq("reference_date", today),
        supabase.from("adherence_status").select("employee_id, status, production_ok").eq("reference_date", today),
        supabase.from("adherence_alerts").select("id, employee_id, severity, message, alert_type").eq("reference_date", today).eq("resolved", false).limit(8),
        supabase.from("tasks").select("id, title, status, assignee_id").order("created_at", { ascending: false }).limit(40),
      ]);
      setEmployees((emp || []) as Emp[]);
      setMetrics((m || []) as Metric[]);
      setProdMonth((prod || []) as Prod[]);
      setGoals((g || []) as EmpGoal[]);
      setScores((sc || []) as Score[]);
      setAdh((ad || []) as AdhStatus[]);
      setAlerts((al || []) as Alert[]);
      setTasks((tk || []) as Task[]);
    })();
  }, [period, today]);

  const monetaryIds = useMemo(() => new Set(metrics.filter((m) => m.value_type === "monetario").map((m) => m.id)), [metrics]);

  // Yesterday ISO
  const yesterday = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const realizedToday = prodMonth.filter((p) => p.production_date === today && monetaryIds.has(p.metric_id))
    .reduce((a, p) => a + Number(p.realized_value || 0), 0);
  const realizedYesterday = prodMonth.filter((p) => p.production_date === yesterday && monetaryIds.has(p.metric_id))
    .reduce((a, p) => a + Number(p.realized_value || 0), 0);
  const realizedMonth = prodMonth.filter((p) => monetaryIds.has(p.metric_id))
    .reduce((a, p) => a + Number(p.realized_value || 0), 0);

  const monthTarget = goals.reduce((a, g) => a + Number(g.target_amount || 0), 0);
  const dailyTarget = goals.reduce((a, g) => {
    const d = Number(g.working_days || 22); return a + (d > 0 ? Number(g.target_amount || 0) / d : 0);
  }, 0);
  const pctDay = dailyTarget > 0 ? Math.round((realizedToday / dailyTarget) * 100) : 0;
  const pctMonth = monthTarget > 0 ? Math.round((realizedMonth / monthTarget) * 100) : 0;
  const deltaToday = realizedYesterday > 0 ? Math.round(((realizedToday - realizedYesterday) / realizedYesterday) * 100) : (realizedToday > 0 ? 100 : 0);

  // Sparkline last 14 days
  const sparkData = useMemo(() => {
    const days: { date: string; v: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ date: iso, v: 0 });
    }
    prodMonth.filter((p) => monetaryIds.has(p.metric_id)).forEach((p) => {
      const idx = days.findIndex((x) => x.date === p.production_date);
      if (idx >= 0) days[idx].v += Number(p.realized_value || 0);
    });
    return days;
  }, [prodMonth, monetaryIds]);

  const chartData = sparkData.map((d) => ({ date: d.date.slice(8, 10), valor: d.v }));

  // Operation status
  const offline = adh.filter((a) => !a.production_ok).length;
  const opStatus = alerts.some((a) => a.severity === "critico") || offline > employees.length * 0.4
    ? { label: "Crítica", tone: "destructive" as const, dot: "bg-destructive" }
    : offline > 0 || alerts.length > 0
    ? { label: "Atenção", tone: "warning" as const, dot: "bg-warning" }
    : { label: "Operação saudável", tone: "success" as const, dot: "bg-success" };

  // Ranking
  const ranking = useMemo(() => {
    const byEmp: Record<string, Score> = {};
    scores.forEach((s) => { byEmp[s.employee_id] = s; });
    return employees.map((e) => ({
      id: e.id, name: e.full_name,
      score: Number(byEmp[e.id]?.score || 0),
      classification: byEmp[e.id]?.classification || "—",
    })).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [employees, scores]);

  // Presence
  const presence = useMemo(() => {
    const map = new Map(adh.map((a) => [a.employee_id, a]));
    let working = 0, pause = 0, absent = 0;
    employees.forEach((e) => {
      const a = map.get(e.id);
      if (!a) absent++;
      else if (a.status === "regular" && a.production_ok) working++;
      else if (a.status === "regular") pause++;
      else absent++;
    });
    return { working, pause, absent };
  }, [adh, employees]);

  // Tasks kanban counts
  const taskCounts = {
    pendente: tasks.filter((t) => t.status === "pendente").length,
    andamento: tasks.filter((t) => t.status === "em_andamento" || t.status === "andamento").length,
    concluido: tasks.filter((t) => t.status === "concluido" || t.status === "concluida").length,
  };

  const userLabel = (user?.user_metadata?.full_name as string)?.split(" ")[0] || "bem-vindo";

  const trendIcon = deltaToday > 0 ? TrendingUp : deltaToday < 0 ? TrendingDown : Minus;
  const TrendIcon = trendIcon;
  const trendTone = deltaToday > 0 ? "text-success" : deltaToday < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <AppShell title="Gestão de Performance">
      {/* Header inteligente */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting()}, <span className="text-primary">{userLabel}</span> 👋</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-[var(--shadow-card)]">
          <span className={cn("size-2.5 rounded-full animate-pulse", opStatus.dot)} />
          <span className="text-sm font-medium">{opStatus.label}</span>
        </div>
      </div>

      {/* Smart Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <SmartCard
          label="Produção hoje"
          value={fmtBRL(realizedToday)}
          icon={Activity}
          tone="primary"
          spark={sparkData.slice(-10).map((d) => d.v)}
          trend={
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", trendTone)}>
              <TrendIcon className="size-3" /> {deltaToday > 0 ? "+" : ""}{deltaToday}% vs ontem
            </span>
          }
        />
        <SmartCard
          label="Meta do mês"
          value={`${pctMonth}%`}
          subValue={`${fmtBRL(realizedMonth)} / ${fmtBRL(monthTarget)}`}
          icon={Target}
          tone={pctMonth >= 80 ? "success" : pctMonth >= 50 ? "warning" : "destructive"}
          progress={Math.min(100, pctMonth)}
        />
        <SmartCard
          label="Funcionários ativos"
          value={`${presence.working + presence.pause}/${employees.length}`}
          icon={Users}
          tone="default"
          trend={
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-success" />{presence.working}</span>
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-warning" />{presence.pause}</span>
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-destructive" />{presence.absent}</span>
            </div>
          }
        />
        <SmartCard
          label="Alertas abertos"
          value={String(alerts.length)}
          icon={AlertTriangle}
          tone={alerts.length === 0 ? "success" : alerts.some((a) => a.severity === "critico") ? "destructive" : "warning"}
          trend={<span className="text-xs text-muted-foreground">{alerts.length === 0 ? "Tudo certo por aqui" : "Verifique o painel de alertas"}</span>}
        />
      </div>

      {/* Foco no dia */}
      <Card className="mb-5 overflow-hidden border-border/70 shadow-[var(--shadow-elevated)] animate-fade-in">
        <div className="bg-gradient-to-br from-primary/95 to-primary/70 text-primary-foreground p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-90">
                <Sparkles className="size-3.5" /> Foco do dia
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mt-1">Situação do Dia</h2>
              <p className="text-sm opacity-90 mt-0.5">Acompanhe em tempo real o atingimento da meta diária da equipe.</p>
            </div>
            <div className="text-right">
              <div className="text-3xl sm:text-4xl font-bold">{pctDay}%</div>
              <div className="text-xs opacity-90">atingido</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            <FocusStat label="Meta do dia" value={fmtBRL(dailyTarget)} />
            <FocusStat label="Realizado" value={fmtBRL(realizedToday)} />
            <FocusStat label="Restante" value={fmtBRL(Math.max(0, dailyTarget - realizedToday))} />
          </div>
          <div className="mt-4 h-2 w-full rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, pctDay)}%` }} />
          </div>
        </div>
      </Card>

      {/* Charts + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card className="lg:col-span-2 border-border/70">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="size-4 text-primary" /> Produção (últimos 14 dias)</CardTitle>
            <Link to="/equipe/dashboard" className="text-xs text-primary hover:underline inline-flex items-center gap-1">Ver detalhes <ArrowRight className="size-3" /></Link>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => fmtBRL(Number(v))}
                />
                <Area type="monotone" dataKey="valor" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#grd)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Trophy className="size-4 text-warning-foreground" /> Top 5 do dia</CardTitle>
            <Link to="/equipe/performance" className="text-xs text-primary hover:underline">Ranking</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {ranking.length === 0 && <p className="text-sm text-muted-foreground">Sem scores hoje.</p>}
            {ranking.map((r, i) => {
              const initials = r.name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase();
              return (
                <div key={r.id} className="flex items-center gap-3 group">
                  <div className="size-9 rounded-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-[var(--shadow-card)]">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{i + 1}. {r.name}</span>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", classBadgeTone(r.classification))}>{r.classification}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={r.score} className="h-1.5 [&>div]:bg-primary" />
                      <span className="text-xs font-semibold text-muted-foreground w-9 text-right">{Math.round(r.score)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Alertas + Presença + Tarefas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card className="border-border/70">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4 text-destructive" /> Alertas</CardTitle>
            <Link to="/equipe/adesao" className="text-xs text-primary hover:underline">Ver todos</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-success bg-success/5 border border-success/20 rounded-md p-3">
                <CheckCircle2 className="size-4" /> Nenhum alerta no momento.
              </div>
            )}
            {alerts.map((a) => {
              const tone = a.severity === "critico" ? "border-destructive/30 bg-destructive/5 text-destructive"
                : a.severity === "atencao" ? "border-warning/40 bg-warning/10 text-warning-foreground"
                : "border-border bg-muted/30 text-foreground";
              const emp = employees.find((e) => e.id === a.employee_id);
              return (
                <div key={a.id} className={cn("flex items-start gap-2 rounded-md border p-2.5 text-sm transition-transform hover:translate-x-0.5", tone)}>
                  <CircleDot className="size-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{emp?.full_name || "Equipe"}</div>
                    <div className="text-xs opacity-90 truncate">{a.message || a.alert_type}</div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity className="size-4 text-primary" /> Presença em tempo real</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <PresenceTile color="bg-success" label="Trabalhando" value={presence.working} />
              <PresenceTile color="bg-warning" label="Em pausa" value={presence.pause} />
              <PresenceTile color="bg-destructive" label="Ausente" value={presence.absent} />
            </div>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {employees.slice(0, 8).map((e) => {
                const a = adh.find((x) => x.employee_id === e.id);
                const dot = !a ? "bg-destructive" : a.production_ok ? "bg-success" : "bg-warning";
                return (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span className={cn("size-2 rounded-full", dot)} />
                    <span className="truncate">{e.full_name}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><ListTodo className="size-4 text-primary" /> Tarefas</CardTitle>
            <Link to="/equipe/atas" className="text-xs text-primary hover:underline">Gerenciar</Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              <KanbanCol label="Pendente" value={taskCounts.pendente} icon={Clock} tone="warning" />
              <KanbanCol label="Em andamento" value={taskCounts.andamento} icon={Activity} tone="primary" />
              <KanbanCol label="Concluído" value={taskCounts.concluido} icon={CheckCircle2} tone="success" />
            </div>
            <div className="mt-3 space-y-1.5 max-h-[140px] overflow-y-auto">
              {tasks.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm border-l-2 border-primary/40 pl-2 py-1">
                  <span className="truncate">{t.title}</span>
                </div>
              ))}
              {tasks.length === 0 && <p className="text-sm text-muted-foreground">Sem tarefas registradas.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Atalhos rápidos */}
      <Card className="border-border/70 mb-5">
        <CardHeader className="pb-2"><CardTitle className="text-base">Atalhos</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Shortcut to="/equipe/ponto" icon={Fingerprint} label="Bater ponto" />
          <Shortcut to="/equipe/producao" icon={FileText} label="Lançar produção" />
          <Shortcut to="/equipe/dashboard" icon={BarChart3} label="Meu desempenho" />
          <Shortcut to="/equipe/atas" icon={ClipboardList} label="Atas" />
          <Shortcut to="/equipe/adesao" icon={AlertTriangle} label="Adesão" />
          <Shortcut to="/equipe/performance" icon={Trophy} label="Score & Ranking" />
          {isAdmin && <Shortcut to="/equipe/metas" icon={Target} label="Metas" />}
        </CardContent>
      </Card>

      {/* FAB ação rápida */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-5 right-5 z-40 size-14 rounded-full shadow-[0_8px_24px_-4px_rgb(37_99_235_/_0.5)] hover:scale-105 transition-transform"
            aria-label="Ação rápida"
          >
            <Plus className="size-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild><Link to="/equipe/ponto"><Fingerprint className="size-4 mr-2" /> Bater ponto</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/equipe/atas/nova"><ClipboardList className="size-4 mr-2" /> Nova ATA</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/equipe/producao"><FileText className="size-4 mr-2" /> Lançar produção</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/equipe/adesao"><AlertTriangle className="size-4 mr-2" /> Registrar ocorrência</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </AppShell>
  );
}

function SmartCard({
  label, value, subValue, icon: Icon, tone = "default", trend, spark, progress,
}: {
  label: string; value: string; subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
  trend?: React.ReactNode; spark?: number[]; progress?: number;
}) {
  const toneMap: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };
  const sparkColor: Record<string, string> = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning-foreground",
    destructive: "text-destructive",
  };
  return (
    <Card className="group border-border/70 hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5 transition-all">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1 leading-tight truncate">{value}</p>
            {subValue && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subValue}</p>}
            {trend && <div className="mt-2">{trend}</div>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={cn("size-10 rounded-lg flex items-center justify-center", toneMap[tone])}>
              <Icon className="size-5" />
            </div>
            {spark && spark.length > 0 && (
              <Sparkline data={spark} className={sparkColor[tone]} width={70} height={24} />
            )}
          </div>
        </div>
        {typeof progress === "number" && (
          <Progress value={progress} className="h-1.5 mt-3" />
        )}
      </CardContent>
    </Card>
  );
}

function FocusStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/15 backdrop-blur p-3">
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}

function PresenceTile({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className={cn("size-2.5 rounded-full mx-auto mb-1", color)} />
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function KanbanCol({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: "warning" | "primary" | "success" }) {
  const map = {
    warning: "border-warning/40 bg-warning/10 text-warning-foreground",
    primary: "border-primary/30 bg-primary/5 text-primary",
    success: "border-success/30 bg-success/5 text-success",
  } as const;
  return (
    <div className={cn("rounded-lg border p-3 text-center", map[tone])}>
      <Icon className="size-4 mx-auto mb-1" />
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px]">{label}</div>
    </div>
  );
}

function Shortcut({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-card p-3 hover:border-primary/40 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 transition-all">
      <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
        <Icon className="size-4" />
      </div>
      <span className="text-xs font-medium text-center text-foreground">{label}</span>
    </Link>
  );
}
