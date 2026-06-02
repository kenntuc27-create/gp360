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
import { Trophy, AlertTriangle, RefreshCw, TrendingUp, Award } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/equipe/performance")({ component: PerformancePage });

type Score = {
  employee_id: string;
  reference_date: string;
  score: number;
  classification: string;
  production_score: number;
  tasks_score: number;
  behavior_score: number;
  previous_classification: string | null;
};
type Emp = { id: string; full_name: string };

const classColor = (c: string) =>
  c === "A" ? "bg-success text-success-foreground" : c === "B" ? "bg-success/80 text-success-foreground" : c === "C" ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground";
const classLabel = (c: string) =>
  c === "A" ? "Excelente" : c === "B" ? "Bom" : c === "C" ? "Atenção" : "Crítico";

function PerformancePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [scores, setScores] = useState<Score[]>([]);
  const [history, setHistory] = useState<Score[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.full_name])), [employees]);

  async function load() {
    const [{ data: e }, { data: s }] = await Promise.all([
      supabase.from("employees").select("id, full_name").eq("active", true).order("full_name"),
      supabase.from("performance_scores").select("*").eq("reference_date", date).order("score", { ascending: false }),
    ]);
    setEmployees((e || []) as Emp[]);
    setScores((s || []) as Score[]);
    if (!selectedEmp && e && e[0]) setSelectedEmp(e[0].id);
  }

  useEffect(() => { load(); }, [date]);

  useEffect(() => {
    if (!selectedEmp) return;
    const since = new Date(); since.setDate(since.getDate() - 29);
    supabase.from("performance_scores")
      .select("*").eq("employee_id", selectedEmp)
      .gte("reference_date", since.toISOString().slice(0, 10))
      .order("reference_date").then(({ data }) => setHistory((data || []) as Score[]));
  }, [selectedEmp]);

  async function recompute() {
    setLoading(true);
    const { error } = await supabase.rpc("compute_performance_scores", { _date: date });
    setLoading(false);
    if (error) toast.error(error.message); else { toast.success("Scores recalculados"); load(); }
  }

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();
  const counts = { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>;
  scores.forEach((s) => { counts[s.classification] = (counts[s.classification] || 0) + 1; });

  return (
    <AppShell title="Score de Performance">
      <PageHeader
        title="Score & Ranking"
        description="Performance automática baseada em produção, tarefas e comportamento."
        icon={Trophy}
        actions={
          <>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[160px]" />
            <Button onClick={recompute} disabled={loading} variant="outline" size="sm">
              <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Recalcular
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {(["A", "B", "C", "D"] as const).map((c) => {
          const tone = c === "A" || c === "B" ? "success" : c === "C" ? "warning" : "destructive";
          return (
            <StatCard
              key={c}
              label={`${c} — ${classLabel(c)}`}
              value={counts[c] || 0}
              icon={Award}
              tone={tone as any}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="size-4 text-success" /> Top performers</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {top3.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> :
              top3.map((s, i) => (
                <div key={s.employee_id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold w-6">#{i + 1}</span>
                    <span>{empMap[s.employee_id] || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={classColor(s.classification)}>{s.classification}</Badge>
                    <span className="font-mono font-semibold">{s.score}</span>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4 text-destructive" /> Funcionários críticos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {bottom3.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> :
              bottom3.map((s) => (
                <div key={s.employee_id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <span>{empMap[s.employee_id] || "—"}</span>
                  <div className="flex items-center gap-2">
                    <Badge className={classColor(s.classification)}>{s.classification}</Badge>
                    <span className="font-mono font-semibold">{s.score}</span>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Ranking completo do dia</CardTitle></CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum score calculado. Clique em "Recalcular agora".</p>
          ) : (
            <div className="space-y-1">
              {sorted.map((s, i) => (
                <button key={s.employee_id} onClick={() => setSelectedEmp(s.employee_id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded hover:bg-muted text-left ${selectedEmp === s.employee_id ? "bg-muted" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                    <span className="text-sm">{empMap[s.employee_id] || "—"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground hidden md:inline">P:{s.production_score} T:{s.tasks_score} C:{s.behavior_score}</span>
                    <Badge className={classColor(s.classification)}>{s.classification}</Badge>
                    <span className="font-mono font-semibold w-12 text-right">{s.score}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEmp && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="size-4" /> Evolução — {empMap[selectedEmp]}</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Sem histórico.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="reference_date" tickFormatter={(v) => v.slice(8, 10)} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2} name="Score" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
