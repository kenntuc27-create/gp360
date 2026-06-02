import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { KpiBidsModal } from "@/components/dashboard/KpiBidsModal";
import { SectionCard } from "@/components/dashboard/SectionCard";

import { fmtBRL } from "@/lib/format";
import { monthKey, todayISO } from "@/lib/team";
import { Target, TrendingUp, Activity, Clock, CheckCircle2, Trophy, AlertCircle, FileText, TrendingDown } from "lucide-react";

type Score = { score: number; classification: string; production_score: number; tasks_score: number; behavior_score: number };
type Goal = { target_amount: number; working_days: number };
type Prod = { realized_value: number; production_date: string };
type Task = { id: string; title: string; due_date: string | null; status: string };

export function DashboardOperacional() {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [prods, setProds] = useState<Prod[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [punchedIn, setPunchedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [financialData, setFinancialData] = useState({ profit: 0, loss: 0 });
  const [counts, setCounts] = useState({ total: 0, inProgress: 0, finished: 0, won: 0, lost: 0, cancelled: 0 });
  const [allBids, setAllBids] = useState<any[]>([]);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [bidsModalTitle, setBidsModalTitle] = useState("");
  const [bidsModalData, setBidsModalData] = useState<any[]>([]);


  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data: emp } = await supabase
        .from("employees").select("id").eq("user_id", user.id).eq("active", true).maybeSingle();
      const eid = emp?.id || null;
      if (cancel) return;
      setEmployeeId(eid);
      if (!eid) { setLoading(false); return; }

      const today = todayISO();
      const period = monthKey();
      const d = new Date(period); d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);

      const results = await Promise.all([
        supabase.from("performance_scores")
          .select("score, classification, production_score, tasks_score, behavior_score")
          .eq("employee_id", eid).eq("reference_date", today).maybeSingle(),
        supabase.from("employee_goals")
          .select("target_amount, working_days")
          .eq("employee_id", eid).eq("reference_month", period).maybeSingle(),
        supabase.from("daily_production_metrics")
          .select("realized_value, production_date")
          .eq("employee_id", eid)
          .gte("production_date", period).lt("production_date", end),
        supabase.from("tasks")
          .select("id, title, due_date, status")
          .eq("assignee_id", eid).neq("status", "concluida").order("due_date", { ascending: true }).limit(8),
        supabase.from("time_punches")
          .select("id").eq("employee_id", eid).eq("punch_date", today).limit(1),
        supabase.from("bids")
          .select(`
            id, status, resultado, sold_total, profit_value, total_homologated, total_quoted,
            bid_items(quantidade, quoted_value, custo_unitario, homologated_value, preco_homologado, status, venceu)
          `)
          .eq("status", "finalizada")
          .not("resultado", "is", null),
        supabase.from("bids").select(`
          id, orgao, processo, status, resultado, created_at, profit_value,
          bid_items(quantidade, quoted_value, custo_unitario, homologated_value, preco_homologado, status, venceu)
        `)
      ]);

      if (cancel) return;

      const [sc, gl, pr, tk, tp, bidsRes, allBidsRes] = results;

      // Calcular contagens
      const allBidsData = (allBidsRes?.data || []) as any[];
      setAllBids(allBidsData);
      const total = allBidsData.length;
      const inProgress = allBidsData.filter(b => !b.resultado && b.status !== "cancelada" && b.status !== "finalizada").length;
      const finished = allBidsData.filter(b => !!b.resultado || b.status === "finalizada").length;
      const won = allBidsData.filter(b => b.resultado === "ganha").length;
      const lost = allBidsData.filter(b => b.resultado === "perdida").length;
      const cancelled = allBidsData.filter(b => b.status === "cancelada").length;

      setCounts({ total, inProgress, finished, won, lost, cancelled });

      // Calcular lucro/prejuízo real
      const bids = (bidsRes?.data || []) as any[];
      let totalResultado = 0;

      bids.forEach(bid => {
        // Ignora bids perdidas no cálculo de lucro real
        if (bid.resultado !== "ganha") return;

        // Prioridade para dados consolidados do cabeçalho
        if (bid.profit_value !== null && Number(bid.profit_value) !== 0) {
          totalResultado += Number(bid.profit_value);
          return;
        }

        // Fallback para itens
        const bidItems = (bid.bid_items || []).filter((i: any) => 
          i.venceu === true || ['won', 'homologated', 'GANHO', 'HOMOLOGADO'].includes(i.status || '')
        );

        const resultadoBid = bidItems.reduce((acc: number, i: any) => {
          const custo = (Number(i.quoted_value) || Number(i.custo_unitario) || 0) * (Number(i.quantidade) || 0);
          const venda = (Number(i.homologated_value) || Number(i.preco_homologado) || 0) * (Number(i.quantidade) || 0);
          return acc + (venda - custo);
        }, 0);

        totalResultado += resultadoBid;
      });

      const totalLucro = totalResultado > 0 ? totalResultado : 0;
      const totalPrejuizo = totalResultado < 0 ? Math.abs(totalResultado) : 0;

      setFinancialData({ profit: totalLucro, loss: totalPrejuizo });
      setScore((sc.data as Score) || null);
      setGoal((gl.data as Goal) || null);
      setProds((pr.data || []) as Prod[]);
      setTasks((tk.data || []) as Task[]);
      setPunchedIn(((tp.data as any[]) || []).length > 0);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user?.id]);

  const totalProd = prods.reduce((s, p) => s + (Number(p.realized_value) || 0), 0);
  const todayProd = prods.filter((p) => p.production_date === todayISO()).reduce((s, p) => s + (Number(p.realized_value) || 0), 0);
  const goalAmount = Number(goal?.target_amount) || 0;
  const achievement = goalAmount > 0 ? (totalProd / goalAmount) * 100 : 0;
  const dailyTarget = goalAmount && goal?.working_days ? goalAmount / goal.working_days : 0;

  const classTone = (c?: string) => c === "A" ? "success" : c === "B" ? "success" : c === "C" ? "warning" : "destructive";

  const handleOpenBidsModal = (title: string, statusType: string) => {
    let filtered: any[] = [];
    switch (statusType) {
      case "cadastradas":
        filtered = allBids;
        break;
      case "em_andamento":
        filtered = allBids.filter(b => !b.resultado && b.status !== "cancelada" && b.status !== "finalizada");
        break;
      case "finalizadas":
        filtered = allBids.filter(b => !!b.resultado || b.status === "finalizada");
        break;
      case "ganhas":
        filtered = allBids.filter(b => b.resultado === "ganha");
        break;
      case "perdidas":
        filtered = allBids.filter(b => b.resultado === "perdida");
        break;
      case "canceladas":
        filtered = allBids.filter(b => b.status === "cancelada");
        break;
    }
    setBidsModalTitle(title);
    setBidsModalData(filtered.map(b => {
      let profit = b.profit_value;
      
      if ((!profit || profit === 0) && b.resultado === "ganha" && b.bid_items) {
        const wonItems = b.bid_items.filter((i: any) => 
          i.venceu === true || ['won', 'homologated', 'GANHO', 'HOMOLOGADO'].includes(i.status || '')
        );
        profit = wonItems.reduce((acc: number, i: any) => {
          const custo = (Number(i.quoted_value) || Number(i.custo_unitario) || 0) * (Number(i.quantidade) || 0);
          const venda = (Number(i.homologated_value) || Number(i.preco_homologado) || Number(i.sold_total) || 0) * (Number(i.quantidade) || 0);
          return acc + (venda - custo);
        }, 0);
      }

      return {
        ...b,
        profit: profit
      };
    }));
    setShowBidsModal(true);
  };


  if (!loading && !employeeId) {
    return (
      <AppShell title="Meu Painel">
        <SectionCard title="Sem cadastro" description="Você ainda não está vinculado a um funcionário ativo.">
          <p className="text-sm text-muted-foreground">Solicite ao administrador o vínculo do seu usuário.</p>
        </SectionCard>
      </AppShell>
    );
  }

  return (
    <AppShell title="Meu Painel">
      <KpiBidsModal 
        isOpen={showBidsModal}
        onClose={() => setShowBidsModal(false)}
        title={bidsModalTitle}
        description={`Lista de licitações classificadas como ${bidsModalTitle.toLowerCase()}.`}
        data={bidsModalData}
      />
      <section className="grid grid-cols-2 lg:grid-cols-6 sm:grid-cols-3 gap-3 mb-4">

        <KpiTile
          label="Lucro Obtido"
          value={fmtBRL(financialData.profit)}
          tone="success"
          icon={<Trophy className="size-4" />}
        />
        {financialData.loss > 0 && (
          <KpiTile
            label="Prejuízo"
            value={fmtBRL(financialData.loss)}
            tone="destructive"
            icon={<AlertCircle className="size-4" />}
          />
        )}
        <KpiTile
          label="Meu score"
          value={score ? Number(score.score).toFixed(1) : "—"}
          hint={score ? `Classificação ${score.classification}` : "sem score hoje"}
          tone={score ? classTone(score.classification) as any : "muted"}
          icon={<Activity className="size-4" />}
        />
        <KpiTile
          label="Produção hoje"
          value={fmtBRL(todayProd)}
          hint={dailyTarget > 0 ? `meta diária ${fmtBRL(dailyTarget)}` : undefined}
          tone={dailyTarget && todayProd >= dailyTarget ? "success" : "muted"}
          icon={<TrendingUp className="size-4" />}
        />
        <KpiTile
          label="Mês"
          value={fmtBRL(totalProd)}
          hint={goalAmount ? `${achievement.toFixed(0)}% da meta` : "sem meta"}
          tone={achievement >= 90 ? "success" : achievement >= 60 ? "warning" : "muted"}
          icon={<Target className="size-4" />}
        />
        <KpiTile
          label="Ponto"
          value={punchedIn ? "Registrado" : "Pendente"}
          tone={punchedIn ? "success" : "warning"}
          icon={<Clock className="size-4" />}
        />
      </section>

      <section aria-label="Licitações" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <KpiTile label="Cadastradas" value={counts.total} icon={<FileText className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Cadastradas", "cadastradas")} />
        <KpiTile label="Em andamento" value={counts.inProgress} tone="warning" icon={<Activity className="size-4" />} onClick={() => handleOpenBidsModal("Licitações em Andamento", "em_andamento")} />
        <KpiTile label="Finalizadas" value={counts.finished} tone="success" icon={<CheckCircle2 className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Finalizadas", "finalizadas")} />
        <KpiTile label="Ganhas" value={counts.won} tone="success" icon={<Trophy className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Ganhas", "ganhas")} />
        <KpiTile label="Perdidas" value={counts.lost} tone="destructive" icon={<TrendingDown className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Perdidas", "perdidas")} />
        <KpiTile label="Canceladas" value={counts.cancelled} tone="muted" icon={<AlertCircle className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Canceladas", "canceladas")} />

      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Composição do score" description="Hoje">
          {score ? (
            <div className="grid grid-cols-3 gap-2">
              <KpiTile label="Produção" value={Number(score.production_score).toFixed(1)} />
              <KpiTile label="Tarefas" value={Number(score.tasks_score).toFixed(1)} />
              <KpiTile label="Comportamento" value={Number(score.behavior_score).toFixed(1)} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem score calculado para hoje.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Minhas tarefas"
          description={`${tasks.length} pendentes`}
          actions={<Link to="/equipe/producao" className="text-xs text-primary hover:underline">Produção</Link>}
        >
          {tasks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center inline-flex items-center gap-2 justify-center w-full">
              <CheckCircle2 className="size-4 text-emerald-600" /> Sem pendências.
            </div>
          ) : (
            <ul className="divide-y text-sm">
              {tasks.map((t) => {
                const overdue = t.due_date && t.due_date < todayISO();
                return (
                  <li key={t.id} className="flex items-center justify-between py-2 gap-2">
                    <span className="truncate">{t.title}</span>
                    <Badge variant={overdue ? "destructive" : "outline"} className="shrink-0">
                      {t.due_date ? new Date(t.due_date).toLocaleDateString("pt-BR") : "—"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Link to="/equipe/ponto"><Button variant="outline" size="sm" className="w-full">Bater ponto</Button></Link>
        <Link to="/equipe/producao"><Button variant="outline" size="sm" className="w-full">Produção</Button></Link>
        <Link to="/equipe/performance"><Button variant="outline" size="sm" className="w-full">Performance</Button></Link>
        <Link to="/equipe/notificacoes"><Button variant="outline" size="sm" className="w-full">Notificações</Button></Link>
      </div>
    </AppShell>
  );
}
