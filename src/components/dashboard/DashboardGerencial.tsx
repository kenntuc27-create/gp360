import { Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { KpiBidsModal } from "@/components/dashboard/KpiBidsModal";
import { SectionCard } from "@/components/dashboard/SectionCard";

import { fmtBRL } from "@/lib/format";
import { monthKey } from "@/lib/team";
import { Users, Target, TrendingUp, Activity, ArrowRight, AlertTriangle, Trophy, AlertCircle, FileText, CheckCircle2, TrendingDown } from "lucide-react";

type Emp = { id: string; full_name: string; sector_id: string | null };
type Sector = { id: string; name: string; business_id: string | null };
type Score = { employee_id: string; score: number; classification: string };
type Goal = { employee_id: string; target_amount: number };
type Prod = { employee_id: string; realized_value: number };
type AlertRow = { id: string; employee_id: string; message: string; severity: string; reference_date: string; alert_type: string };

export function DashboardGerencial() {
  const { companyId, user } = useAuth();
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [financialData, setFinancialData] = useState({ profit: 0, loss: 0 });
  const [counts, setCounts] = useState({ total: 0, inProgress: 0, finished: 0, won: 0, lost: 0, cancelled: 0 });
  const [allBids, setAllBids] = useState<any[]>([]);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [bidsModalTitle, setBidsModalTitle] = useState("");
  const [bidsModalData, setBidsModalData] = useState<any[]>([]);


  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const period = monthKey();
      const d = new Date(period); d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      // sectors of manager's company (best-effort: filter by business_id == companyId if matches)
      const { data: secData } = await supabase.from("sectors").select("id, name, business_id");
      const allSectors = (secData || []) as Sector[];
      const mySectors = companyId
        ? allSectors.filter((s) => !s.business_id || s.business_id === companyId)
        : allSectors;
      const mySectorIds = new Set(mySectors.map((s) => s.id));

      const { data: empData } = await supabase
        .from("employees").select("id, full_name, sector_id").eq("active", true);
      const allEmps = (empData || []) as Emp[];
      const myEmps = allEmps.filter((e) => !e.sector_id || mySectorIds.has(e.sector_id));
      const empIds = myEmps.map((e) => e.id);

      const results = await Promise.all([
        empIds.length
          ? supabase.from("performance_scores").select("employee_id, score, classification").eq("reference_date", today).in("employee_id", empIds)
          : Promise.resolve({ data: [] }),
        empIds.length
          ? supabase.from("employee_goals").select("employee_id, target_amount").eq("reference_month", period).in("employee_id", empIds)
          : Promise.resolve({ data: [] }),
        empIds.length
          ? supabase.from("daily_production_metrics")
              .select("employee_id, realized_value")
              .gte("production_date", period).lt("production_date", end)
              .in("employee_id", empIds)
          : Promise.resolve({ data: [] }),
        empIds.length
          ? supabase.from("adherence_alerts")
              .select("id, employee_id, message, severity, reference_date, alert_type")
              .eq("resolved", false).in("employee_id", empIds)
              .order("reference_date", { ascending: false }).limit(10)
          : Promise.resolve({ data: [] }),
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
      const [sc, gl, pr, al, bidsRes, allBidsRes] = results;

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
      setSectors(mySectors);
      setEmployees(myEmps);
      setScores((sc.data || []) as Score[]);
      setGoals((gl.data || []) as Goal[]);
      setProds((pr.data || []) as Prod[]);
      setAlerts((al.data || []) as AlertRow[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [companyId, user?.id]);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.full_name])), [employees]);

  const totalGoal = goals.reduce((s, g) => s + (Number(g.target_amount) || 0), 0);
  const totalProd = prods.reduce((s, p) => s + (Number(p.realized_value) || 0), 0);
  const achievement = totalGoal > 0 ? (totalProd / totalGoal) * 100 : 0;
  const avgScore = scores.length ? scores.reduce((s, x) => s + x.score, 0) / scores.length : 0;
  const criticos = scores.filter((s) => s.classification === "D").length;

  const ranking = [...scores].sort((a, b) => b.score - a.score).slice(0, 8);

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
      // Sempre recalcular a partir dos itens (mesma fórmula da página da licitação)
      // para garantir que o card bata com o cabeçalho da licitação.
      let profit: number | null = null;

      if (b.bid_items && b.bid_items.length > 0) {
        const wonItems = b.bid_items.filter((i: any) =>
          i.venceu === true || ['won', 'homologated', 'GANHO', 'HOMOLOGADO'].includes(i.status || '')
        );
        if (wonItems.length > 0) {
          profit = wonItems.reduce((acc: number, i: any) => {
            const qtd = Number(i.quantidade) || 0;
            const custo = (Number(i.quoted_value) || Number(i.custo_unitario) || 0) * qtd;
            const venda = (Number(i.homologated_value) || Number(i.preco_homologado) || 0) * qtd;
            return acc + (venda - custo);
          }, 0);
        }
      }

      // Fallback: usa o valor armazenado apenas se não houver itens disponíveis
      if (profit === null) {
        profit = Number(b.profit_value) || 0;
      }

      return {
        ...b,
        profit: profit
      };
    }));
    setShowBidsModal(true);
  };


  return (
    <AppShell title="Painel Gerencial">
      <KpiBidsModal 
        isOpen={showBidsModal}
        onClose={() => setShowBidsModal(false)}
        title={bidsModalTitle}
        description={`Lista de licitações classificadas como ${bidsModalTitle.toLowerCase()}.`}
        data={bidsModalData}
      />
      <section className="grid grid-cols-2 lg:grid-cols-6 sm:grid-cols-3 gap-3 mb-4">

        <KpiTile label="Lucro Obtido" value={fmtBRL(financialData.profit)} tone="success" icon={<Trophy className="size-4" />} />
        {financialData.loss > 0 && <KpiTile label="Prejuízo" value={fmtBRL(financialData.loss)} tone="destructive" icon={<AlertCircle className="size-4" />} />}
        <KpiTile label="Equipe" value={employees.length} hint={`${sectors.length} setores`} icon={<Users className="size-4" />} />
        <KpiTile label="Meta do mês" value={fmtBRL(totalGoal)} icon={<Target className="size-4" />} />
        <KpiTile label="Produção" value={fmtBRL(totalProd)} hint={`${achievement.toFixed(0)}% atingido`} tone={achievement >= 90 ? "success" : achievement >= 60 ? "warning" : "destructive"} icon={<TrendingUp className="size-4" />} />
        <KpiTile label="Score médio" value={avgScore.toFixed(1)} hint={`${criticos} em situação crítica`} tone={avgScore >= 7 ? "success" : "warning"} icon={<Activity className="size-4" />} />
      </section>

      <section aria-label="Licitações" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <KpiTile label="Cadastradas" value={counts.total} icon={<FileText className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Cadastradas", "cadastradas")} />
        <KpiTile label="Em andamento" value={counts.inProgress} tone="warning" icon={<Activity className="size-4" />} onClick={() => handleOpenBidsModal("Licitações em Andamento", "em_andamento")} />
        <KpiTile label="Finalizadas" value={counts.finished} tone="success" icon={<CheckCircle2 className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Finalizadas", "finalizadas")} />
        <KpiTile label="Ganhas" value={counts.won} tone="success" icon={<Trophy className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Ganhas", "ganhas")} />
        <KpiTile label="Perdidas" value={counts.lost} tone="destructive" icon={<TrendingDown className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Perdidas", "perdidas")} />
        <KpiTile label="Canceladas" value={counts.cancelled} tone="muted" icon={<AlertCircle className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Canceladas", "canceladas")} />

      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <SectionCard
          title={<span className="inline-flex items-center gap-2"><Trophy className="size-4 text-primary" />Ranking da equipe</span>}
          description="Score do dia"
          actions={<Link to="/equipe/performance" className="text-xs text-primary hover:underline inline-flex items-center gap-1">Ver tudo <ArrowRight className="size-3" /></Link>}
        >
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>
          ) : ranking.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Sem scores hoje.</div>
          ) : (
            <ul className="divide-y text-sm">
              {ranking.map((s, i) => (
                <li key={s.employee_id} className="flex items-center justify-between py-2">
                  <span className="truncate"><span className="text-muted-foreground mr-2 tabular-nums">#{i + 1}</span>{empMap[s.employee_id] || "—"}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{s.classification}</Badge>
                    <span className="text-xs tabular-nums font-semibold">{Number(s.score).toFixed(1)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={<span className="inline-flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" />Alertas da equipe</span>}
          description={`${alerts.length} pendentes`}
        >
          {alerts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Sem alertas.</div>
          ) : (
            <ul className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {alerts.map((a) => (
                <li key={a.id} className="text-sm border-l-2 pl-2 py-1.5"
                    style={{ borderColor: a.severity === "critico" ? "hsl(var(--destructive))" : "rgb(217 119 6)" }}>
                  <div className="text-foreground">{empMap[a.employee_id] ? <span className="font-medium">{empMap[a.employee_id]} · </span> : null}{a.message}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(a.reference_date).toLocaleDateString("pt-BR")} · {a.alert_type}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Link to="/equipe/performance"><Button variant="outline" size="sm" className="w-full">Performance</Button></Link>
        <Link to="/equipe/metas"><Button variant="outline" size="sm" className="w-full">Metas</Button></Link>
        <Link to="/equipe/producao"><Button variant="outline" size="sm" className="w-full">Produção</Button></Link>
        <Link to="/equipe/adesao"><Button variant="outline" size="sm" className="w-full">Adesão</Button></Link>
      </div>
    </AppShell>
  );
}
