import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/equipe/adesao")({ component: AdesaoPage });

type Status = { employee_id: string; reference_date: string; status: string; details: any };
type Alert = { id: string; employee_id: string; reference_date: string; alert_type: string; severity: string; message: string; resolved: boolean; created_at: string };
type Emp = { id: string; full_name: string };

function AdesaoPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(false);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.full_name])), [employees]);

  async function load() {
    const [{ data: e }, { data: s }, { data: a }] = await Promise.all([
      supabase.from("employees").select("id, full_name").eq("active", true).order("full_name"),
      supabase.from("adherence_status").select("*").eq("reference_date", date),
      supabase.from("adherence_alerts").select("*").eq("reference_date", date).order("severity", { ascending: false }),
    ]);
    setEmployees((e || []) as Emp[]);
    setStatuses((s || []) as Status[]);
    setAlerts((a || []) as Alert[]);
  }

  useEffect(() => { load(); }, [date]);

  async function recompute() {
    setLoading(true);
    const { error } = await supabase.rpc("recompute_adherence" as any, { _employee_id: user?.id, _date: date });
    setLoading(false);
    if (error) toast.error(error.message); else { toast.success("Adesão recalculada"); load(); }
  }

  const counts = useMemo(() => {
    const c = { regular: 0, atencao: 0, nao_aderente: 0 };
    for (const s of statuses) (c as any)[s.status]++;
    return c;
  }, [statuses]);

  const sevColor = (s: string) => s === "critico" ? "destructive" : s === "atencao" ? "warning" : "secondary";
  const statusColor = (s: string) => s === "regular" ? "bg-success/10 text-success border-success/30" : s === "atencao" ? "bg-warning/15 text-warning-foreground border-warning/40" : "bg-destructive/10 text-destructive border-destructive/30";
  const statusLabel = (s: string) => s === "regular" ? "🟢 Regular" : s === "atencao" ? "🟡 Atenção" : "🔴 Não aderente";

  return (
    <AppShell title="Controle de Adesão">
      <PageHeader
        title="Adesão e Alertas Inteligentes"
        description="Status diário, alertas automáticos e disciplina operacional."
        icon={AlertTriangle}
        actions={
          <>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[160px]" />
            <Button onClick={recompute} disabled={loading} size="sm">
              <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Recalcular
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Regulares" value={counts.regular} icon={CheckCircle2} tone="success" />
          <StatCard label="Atenção" value={counts.atencao} icon={AlertCircle} tone="warning" />
          <StatCard label="Não aderentes" value={counts.nao_aderente} icon={AlertTriangle} tone="destructive" />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Funcionários</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {employees.map((e) => {
              const st = statuses.find((s) => s.employee_id === e.id);
              const empAlerts = alerts.filter((a) => a.employee_id === e.id);
              const status = st?.status || "regular";
              return (
                <div key={e.id} className={`p-3 rounded-md border ${statusColor(status)}`}>
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{e.full_name}</div>
                    <span className="text-sm font-semibold">{statusLabel(status)}</span>
                  </div>
                  {st?.details && (
                    <div className="text-xs mt-1 opacity-80">
                      Tarefas atrasadas: {st.details.overdue_tasks ?? 0} • Ausências: {st.details.absent ?? 0} • Dias sem produção (5d): {st.details.recent_misses ?? 0}
                    </div>
                  )}
                  {empAlerts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {empAlerts.map((a) => (
                        <Badge key={a.id} variant={sevColor(a.severity) as any}>{a.alert_type}: {a.message}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {employees.length === 0 && <div className="text-sm text-muted-foreground">Nenhum funcionário ativo.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Todos os alertas do dia</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {alerts.length === 0 && <div className="text-muted-foreground">Sem alertas.</div>}
            {alerts.map((a) => (
              <div key={a.id} className="flex justify-between border-b py-1">
                <span>{empMap[a.employee_id] || a.employee_id} — {a.message}</span>
                <Badge variant={sevColor(a.severity) as any}>{a.severity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
