import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileUp, FileText, TrendingUp, Trophy, Gavel, Target, AlertTriangle, ArrowRight,
  CircleDollarSign, Activity, Clock, Building2, TrendingDown,
  DollarSign,
  AlertCircle,
  Search,
  CheckCircle2,
} from "lucide-react";
import { useAllowedTipos } from "@/hooks/useAllowedTipos";
import { useAuth } from "@/hooks/useAuth";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { SectorRanking } from "@/components/dashboard/SectorRanking";
import { SupplierRanking } from "@/components/dashboard/SupplierRanking";
import { PeriodFilter, getPeriodRange, type PeriodKey } from "@/components/dashboard/PeriodFilter";
import { SegmentFilter } from "@/components/dashboard/SegmentFilter";
import { StatusFilter, type BidStatus } from "@/components/dashboard/StatusFilter";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { fmtBRL } from "@/lib/format";
import { KpiDetailsModal } from "./KpiDetailsModal";
import { KpiBidsModal } from "./KpiBidsModal";


interface BidLite {
  id: string; orgao: string | null; processo: string | null;
  status: string; resultado: string | null; created_at: string;
  segment_id?: string | null;
  valor_total_estimado: number | null;
  sold_total: number | null;
  bought_total: number | null;
  profit_value: number | null;
  total_homologated: number | null;
  total_quoted: number | null;
}
interface ItemLite {
  bid_id: string; quantidade: number; valor_unitario: number | null;
  custo_unitario: number | null; preco_venda_manual: number | null;
  margin_pct: number | null; disputar: boolean; venceu: boolean | null;
  preco_homologado: number | null;
  valor_estimado_total: number | null;
  valor_maximo: number | null;
  status: string | null;
  descricao: string | null;
  estimated_value?: number | null;
  quoted_value?: number | null;
  homologated_value?: number | null;
  profit_value?: number | null;
}
interface AlertLite {
  id: string; message: string; severity: string;
  reference_date: string; alert_type: string;
}

export function DashboardDiretoria() {
  const allowed = useAllowedTipos();
  const { isAdmin } = useAuth();
  const [bids, setBids] = useState<BidLite[]>([]);
  const [items, setItems] = useState<ItemLite[]>([]);
  const [alerts, setAlerts] = useState<AlertLite[]>([]);
  const [pendingResp, setPendingResp] = useState(0);
  const [bidsWithResp, setBidsWithResp] = useState<Set<string>>(new Set());
  const [pendingBidIds, setPendingBidIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [periodKey, setPeriodKey] = useState<PeriodKey>("30d");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<BidStatus>("all");
  const [showDetails, setShowDetails] = useState(false);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [bidsModalTitle, setBidsModalTitle] = useState("");
  const [bidsModalData, setBidsModalData] = useState<BidLite[]>([]);


  useEffect(() => {
    if (allowed.length === 0) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data: bidsData } = await supabase
        .from("bids")
        .select("id, orgao, processo, status, resultado, created_at, segment_id, valor_total_estimado, sold_total, bought_total, profit_value, total_homologated, total_quoted")
        .in("tipo_cotacao", allowed)
        .order("created_at", { ascending: false });
      const ids = (bidsData || []).map((b) => b.id);
      const itemsRes = ids.length
        ? await supabase
            .from("bid_items")
            .select("bid_id, quantidade, valor_unitario, custo_unitario, preco_venda_manual, margin_pct, disputar, venceu, preco_homologado, valor_estimado_total, valor_maximo, status, descricao, estimated_value, quoted_value, homologated_value, profit_value")
            .in("bid_id", ids)
        : { data: [] as ItemLite[] };
      const alertsRes = await supabase
        .from("adherence_alerts")
        .select("id, message, severity, reference_date, alert_type")
        .eq("resolved", false)
        .order("reference_date", { ascending: false })
        .limit(8);
      const respList = ids.length
        ? await supabase
            .from("bid_supplier_responses")
            .select("bid_id, extraction_status")
            .in("bid_id", ids)
        : { data: [] as { bid_id: string; extraction_status: string }[] };
      if (cancel) return;
      setBids((bidsData as BidLite[]) || []);
      setItems((itemsRes.data as ItemLite[]) || []);
      setAlerts((alertsRes.data as AlertLite[]) || []);
      const respData = (respList.data || []) as { bid_id: string; extraction_status: string }[];
      const pendIds = new Set(respData.filter((r) => r.extraction_status === "processing").map((r) => r.bid_id));
      setPendingBidIds(pendIds);
      setPendingResp(pendIds.size);
      setBidsWithResp(new Set(respData.map((r) => r.bid_id)));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [allowed.join(",")]);

  const range = useMemo(
    () => getPeriodRange(periodKey, customStart, customEnd),
    [periodKey, customStart, customEnd]
  );

  const bidsWithItems = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => s.add(i.bid_id));
    return s;
  }, [items]);

  // Apenas bids com movimentação operacional e dentro do período
  const filteredBids = useMemo(() => {
    return bids.filter((b) => {
      if (segmentFilter !== "all" && b.segment_id !== segmentFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "em_andamento") {
          if (b.resultado || b.status === "cancelada") return false;
        } else if (statusFilter === "ganha") {
          if (b.resultado !== "ganha") return false;
        } else if (statusFilter === "perdida") {
          if (b.resultado !== "perdida") return false;
        } else if (statusFilter === "cancelada") {
          if (b.status !== "cancelada") return false;
        }
      }
      const created = new Date(b.created_at).getTime();
      if (created < range.start.getTime() || created > range.end.getTime()) return false;
      const hasMovement = !!b.resultado || bidsWithItems.has(b.id) || bidsWithResp.has(b.id) || b.status !== "rascunho";
      return hasMovement;
    });
  }, [bids, bidsWithItems, bidsWithResp, range, segmentFilter, statusFilter]);

  const filteredBidIds = useMemo(() => new Set(filteredBids.map((b) => b.id)), [filteredBids]);
  const filteredItems = useMemo(
    () => items.filter((i) => filteredBidIds.has(i.bid_id)),
    [items, filteredBidIds]
  );

  const totalCadastradas = filteredBids.length;
  const emAndamento = filteredBids.filter((b) => !b.resultado && b.status !== "cancelada" && b.status !== "finalizada").length;
  const finalizadas = filteredBids.filter((b) => !!b.resultado || b.status === "finalizada").length;
  const ganhas = filteredBids.filter((b) => b.resultado === "ganha").length;
  const perdidas = filteredBids.filter((b) => b.resultado === "perdida").length;
  const canceladas = filteredBids.filter((b) => b.status === "cancelada").length;
  const taxaGanho = finalizadas > 0 ? (ganhas / finalizadas) * 100 : 0;

  // 1. Total Licitação (Estimado) - Soma de todos os itens de todas as licitações filtradas
  const valorTotalLicitacao = useMemo(() => {
    return filteredBids.reduce((acc, b) => {
      const bidItems = items.filter(i => i.bid_id === b.id);
      const sumItems = bidItems.reduce((sum, it) => sum + (Number(it.quantidade) || 0) * (Number(it.estimated_value) || Number(it.valor_unitario) || Number(it.valor_maximo) || 0), 0);
      return acc + (sumItems > 0 ? sumItems : (Number(b.valor_total_estimado) || 0));
    }, 0);
  }, [filteredBids, items]);

  // 2. Valor em Disputa (Estimado) - Licitações que ainda estão acontecendo
  const valorEmDisputa = useMemo(() => {
    return filteredBids
      .filter(b => 
        ["EM DISPUTA", "AGUARDANDO", "EM ANDAMENTO", "GERADA"].includes(b.status?.toUpperCase()) && 
        !b.resultado && b.status !== "cancelada"
      )
      .reduce((acc, b) => {
        const bidItems = items.filter(i => i.bid_id === b.id && i.disputar);
        const v = bidItems.reduce((sum, it) => sum + (Number(it.quantidade) || 0) * (Number(it.estimated_value) || Number(it.valor_unitario) || Number(it.valor_maximo) || 0), 0);
        return acc + (v > 0 ? v : (Number(b.valor_total_estimado) || 0));
      }, 0);
  }, [filteredBids, items]);

  // 3. Itens Finalizados (Ganhos e Perdidos) - REGRA CRÍTICA: Somente bids com resultado
  const itemsFinalizados = useMemo(() => {
    return items.filter(i => {
      const bid = bids.find(b => b.id === i.bid_id);
      return bid && !!bid.resultado;
    });
  }, [items, bids]);

  const itemsGanhos = useMemo(() => {
    return itemsFinalizados.filter(i => {
      const bid = bids.find(b => b.id === i.bid_id);
      // REGRA: Só é considerado ganho se o RESULTADO da licitação for "ganha"
      // E o item individual tiver sido vencido/homologado
      if (!bid || bid.resultado !== "ganha") return false;
      
      const isWon = i.venceu === true || 
                   ['won', 'homologated', 'GANHO', 'HOMOLOGADO'].includes(i.status || '');
      return isWon;
    });
  }, [itemsFinalizados, bids]);

  // 4. Valor Ganho (Homologado Real)
  const valorGanho = useMemo(() => {
    return itemsGanhos.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.homologated_value) || Number(i.preco_homologado) || 0), 0);
  }, [itemsGanhos]);

  // 5. Resultado Real (Consolidado)
  const resultadoReal = useMemo(() => {
    const bidsFinalizadas = filteredBids.filter(b => b.status === "finalizada");
    return bidsFinalizadas.reduce((total, bid) => {
      // Prioridade 1: Valor de lucro real calculado no cabeçalho (apenas se bid foi GANHA)
      if (bid.resultado === "ganha" && bid.profit_value !== null && bid.profit_value !== 0) {
        return total + Number(bid.profit_value);
      }

      // Prioridade 2: Fallback para cálculo item a item (homologado - custo)
      // Somente para bids GANHAS (perdidas não geram lucro/prejuízo real de operação)
      if (bid.resultado === "ganha") {
        const bidItems = items.filter(i => i.bid_id === bid.id && (i.venceu === true || ['won', 'homologated', 'GANHO', 'HOMOLOGADO'].includes(i.status || '')));
        const resultadoBid = bidItems.reduce((acc, i) => {
          const custo = (Number(i.quoted_value) || Number(i.custo_unitario) || 0) * (Number(i.quantidade) || 0);
          const venda = (Number(i.homologated_value) || Number(i.preco_homologado) || 0) * (Number(i.quantidade) || 0);
          return acc + (venda - custo);
        }, 0);
        return total + resultadoBid;
      }
      
      return total;
    }, 0);
  }, [filteredBids, items]);

  // 6. Lucro Obtido (Mostra apenas se o resultado real total for positivo)
  const lucroObtido = resultadoReal > 0 ? resultadoReal : 0;

  // 7. Prejuízo (Mostra apenas se o resultado real total for negativo)
  const prejuizoReal = resultadoReal < 0 ? Math.abs(resultadoReal) : 0;

  // 8. Margem de lucro real sobre valor ganho consolidado
  const margemLucro = useMemo(() => {
    // A margem deve ser baseada no valor REAL das licitações finalizadas que compõem o lucro
    const faturamentoReal = filteredBids
      .filter(b => b.resultado === "ganha" && b.status === "finalizada")
      .reduce((acc, b) => acc + (Number(b.sold_total) || Number(b.total_homologated) || 0), 0);
    
    return faturamentoReal > 0 ? (resultadoReal / faturamentoReal) * 100 : 0;
  }, [resultadoReal, filteredBids]);

  // Perdido (valor estimado dos perdidos)
  const valorPerdido = useMemo(() => {
    return filteredBids.filter(b => b.resultado === "perdida").reduce((acc, b) => {
      const bidItems = items.filter(i => i.bid_id === b.id);
      const v = bidItems.reduce((sum, it) => sum + (Number(it.quantidade) || 0) * (Number(it.estimated_value) || Number(it.valor_unitario) || Number(it.valor_maximo) || 0), 0);
      return acc + (v > 0 ? v : (Number(b.valor_total_estimado) || 0));
    }, 0);
  }, [filteredBids, items]);

  // Função para abrir detalhes
  const handleViewDetails = () => {
    const data = itemsGanhos.map(i => {
      const bid = bids.find(b => b.id === i.bid_id);
      const vendaUn = Number(i.homologated_value) || Number(i.preco_homologado) || 0;
      const custoUn = Number(i.quoted_value) || Number(i.custo_unitario) || 0;
      const vendaTotal = (Number(i.quantidade) || 0) * vendaUn;
      const custoTotal = (Number(i.quantidade) || 0) * custoUn;
      return {
        id: i.bid_id + (i.descricao || ""),
        bid_id: i.bid_id,
        orgao: bid?.orgao || "N/A",
        descricao: i.descricao || "Sem descrição",
        quantidade: i.quantidade,
        venda_un: vendaUn,
        custo_un: custoUn,
        venda_total: vendaTotal,
        custo_total: custoTotal,
        lucro: vendaTotal - custoTotal,
        status: i.status || (i.venceu ? "GANHO" : "OK")
      };
    });
    setDetailData(data);
    setShowDetails(true);
  };

  const handleOpenBidsModal = (title: string, statusType: string) => {
    let filtered: BidLite[] = [];
    switch (statusType) {
      case "cadastradas":
        filtered = filteredBids;
        break;
      case "em_andamento":
        filtered = filteredBids.filter(b => !b.resultado && b.status !== "cancelada" && b.status !== "finalizada");
        break;
      case "finalizadas":
        filtered = filteredBids.filter(b => !!b.resultado || b.status === "finalizada");
        break;
      case "ganhas":
        filtered = filteredBids.filter(b => b.resultado === "ganha");
        break;
      case "perdidas":
        filtered = filteredBids.filter(b => b.resultado === "perdida");
        break;
      case "canceladas":
        filtered = filteredBids.filter(b => b.status === "cancelada");
        break;
    }
    setBidsModalTitle(title);
    setBidsModalData(filtered.map(b => {
      let profit = b.profit_value;
      
      // Fallback calculation if profit_value is not set but it's won
      if ((!profit || profit === 0) && b.resultado === "ganha") {
        const bidItems = items.filter(i => i.bid_id === b.id && (i.venceu === true || ['won', 'homologated', 'GANHO', 'HOMOLOGADO'].includes(i.status || '')));
        profit = bidItems.reduce((acc, i) => {
          const custo = (Number(i.quoted_value) || Number(i.custo_unitario) || 0) * (Number(i.quantidade) || 0);
          const venda = (Number(i.homologated_value) || Number(i.preco_homologado) || Number(b.sold_total) || 0) * (Number(i.quantidade) || 0);
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

  const recentes = filteredBids.slice(0, 5);

  const criticos = alerts.filter((a) => a.severity === "critico").length;

  return (
    <AppShell
      title="Painel da Diretoria"
      actions={
        <div className="flex items-center gap-2">
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          <SegmentFilter value={segmentFilter} onChange={setSegmentFilter} />
          <PeriodFilter
            value={periodKey}
            onChange={(k, s, e) => { setPeriodKey(k); setCustomStart(s); setCustomEnd(e); }}
          />
          <Button variant="outline" size="sm" onClick={handleViewDetails}>
            <Search className="mr-2 size-4" />VER DETALHAMENTO
          </Button>
          <Link to="/novo">
            <Button size="sm"><FileUp className="mr-2 size-4" />Nova Cotação</Button>
          </Link>
        </div>
      }
    >
      <KpiDetailsModal 
        isOpen={showDetails} 
        onClose={() => setShowDetails(false)} 
        title="Detalhamento Financeiro (Real)"
        description="Lista de itens homologados e ganhos que compõem o resultado real do período."
        data={detailData}
      />
      <KpiBidsModal 
        isOpen={showBidsModal}
        onClose={() => setShowBidsModal(false)}
        title={bidsModalTitle}
        description={`Lista de licitações classificadas como ${bidsModalTitle.toLowerCase()} no período selecionado.`}
        data={bidsModalData}
      />
      {/* TOPO ESTRATÉGICO — KPIs financeiros executivos */}

      <section aria-label="Topo estratégico" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <KpiTile label="Total Licitação" value={fmtBRL(valorTotalLicitacao)} hint="valor estimado" icon={<DollarSign className="size-4" />} />
        <KpiTile label="Valor em disputa" value={fmtBRL(valorEmDisputa)} hint="itens em disputa" icon={<Gavel className="size-4" />} />
        <KpiTile label="Valor ganho" value={fmtBRL(valorGanho)} hint="homologado" tone="success" icon={<CircleDollarSign className="size-4" />} />
        {prejuizoReal > 0 && (
          <KpiTile label="Prejuízo" value={fmtBRL(prejuizoReal)} hint="custo > venda" tone="destructive" icon={<AlertCircle className="size-4" />} />
        )}
        <KpiTile label="Lucro obtido" value={fmtBRL(lucroObtido)} hint="líquido real" tone="success" icon={<Trophy className="size-4" />} />
        <KpiTile label="Margem de lucro" value={`${margemLucro.toFixed(1)}%`} hint="lucro / vendido" tone={margemLucro >= 15 ? "success" : "warning"} icon={<TrendingUp className="size-4" />} />
      </section>

      {/* CONTAGEM DE LICITAÇÕES */}
      <section aria-label="Licitações" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <KpiTile label="Cadastradas" value={totalCadastradas} icon={<FileText className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Cadastradas", "cadastradas")} />
        <KpiTile label="Em andamento" value={emAndamento} tone="warning" icon={<Activity className="size-4" />} onClick={() => handleOpenBidsModal("Licitações em Andamento", "em_andamento")} />
        <KpiTile label="Finalizadas" value={finalizadas} tone="success" icon={<CheckCircle2 className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Finalizadas", "finalizadas")} />
        <KpiTile label="Ganhas" value={ganhas} tone="success" icon={<Trophy className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Ganhas", "ganhas")} />
        <KpiTile label="Perdidas" value={perdidas} tone="destructive" icon={<TrendingDown className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Perdidas", "perdidas")} />
        <KpiTile label="Canceladas" value={canceladas} tone="muted" icon={<AlertCircle className="size-4" />} onClick={() => handleOpenBidsModal("Licitações Canceladas", "canceladas")} />

      </section>

      {/* VISÃO POR NEGÓCIO */}
      <section aria-label="Visão por negócio" className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <SectionCard
          title="Licitação"
          description={`${totalCadastradas} processos no período`}
          actions={<Link to="/central" className="text-xs text-primary hover:underline inline-flex items-center gap-1">Central <ArrowRight className="size-3" /></Link>}
        >
          <div className="grid grid-cols-2 gap-2">
            <KpiTile label="Em disputa" value={fmtBRL(valorEmDisputa)} />
            <KpiTile label="Ganho" value={fmtBRL(valorGanho)} tone="success" />
            <KpiTile label="Perdido" value={fmtBRL(valorPerdido)} tone="destructive" />
            {prejuizoReal > 0 && <KpiTile label="Prejuízo" value={fmtBRL(prejuizoReal)} tone="destructive" />}
            <KpiTile label="Lucro obtido" value={fmtBRL(lucroObtido)} tone="success" />
            <KpiTile label="Margem real" value={`${margemLucro.toFixed(1)}%`} />
            <KpiTile label="Taxa de ganho" value={`${taxaGanho.toFixed(0)}%`} />
          </div>
        </SectionCard>

        <SectionCard
          title="Crédito"
          description="Em integração"
          actions={<Badge variant="secondary">Próxima fase</Badge>}
        >
          <div className="grid grid-cols-2 gap-2 opacity-70">
            <KpiTile label="Propostas" value="—" />
            <KpiTile label="Contratos aprovados" value="—" />
            <KpiTile label="Conversão" value="—" />
            <KpiTile label="Comissão estimada" value="—" />
          </div>
          <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-2">
            <Building2 className="size-3" /> Aguardando dados da operação de crédito.
          </p>
        </SectionCard>

        <SectionCard
          title="Posto"
          description="Em integração"
          actions={<Badge variant="secondary">Próxima fase</Badge>}
        >
          <div className="grid grid-cols-2 gap-2 opacity-70">
            <KpiTile label="Faturamento" value="—" />
            <KpiTile label="Produção" value="—" />
            <KpiTile label="Metas" value="—" />
            <KpiTile label="Desempenho" value="—" />
          </div>
          <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-2">
            <Activity className="size-3" /> Aguardando dados operacionais do posto.
          </p>
        </SectionCard>
      </section>

      {/* RANKING + ALERTAS + RECENTES */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 mb-4">
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectorRanking />
            <SupplierRanking />
          </div>

          <SectionCard
            title="Cotações recentes"
            actions={<Link to="/historico" className="text-xs text-primary hover:underline inline-flex items-center gap-1">Ver todas <ArrowRight className="size-3" /></Link>}
          >
            {loading ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>
            ) : recentes.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma cotação ainda. <Link to="/novo" className="text-primary underline">Criar a primeira</Link>.
              </div>
            ) : (
              <div className="divide-y">
                {recentes.map((b) => (
                  <Link
                    key={b.id}
                    to="/edital/$id"
                    params={{ id: b.id }}
                    className="flex items-center justify-between py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.orgao || "Sem órgão"}</div>
                      <div className="text-xs text-muted-foreground truncate">{b.processo || "-"}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={b.status} resultado={b.resultado} hasPendingResponses={pendingBidIds.has(b.id)} />
                      <span className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-4 min-w-0">
          <SectionCard
            title={
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className={`size-4 ${criticos > 0 ? "text-destructive" : "text-amber-600"}`} />
                Alertas críticos
              </span>
            }
            description={`${alerts.length} pendentes${criticos > 0 ? ` · ${criticos} críticos` : ""}`}
            className={criticos > 0 ? "border-destructive/40" : undefined}
          >
            {alerts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem alertas no momento.</div>
            ) : (
              <ul className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {alerts.map((a) => (
                  <li key={a.id} className="text-sm border-l-2 pl-2 py-1.5"
                      style={{ borderColor: a.severity === "critico" ? "hsl(var(--destructive))" : a.severity === "atencao" ? "rgb(217 119 6)" : "hsl(var(--muted-foreground))" }}>
                    <div className="text-foreground">{a.message}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="size-3" />
                      {new Date(a.reference_date).toLocaleDateString("pt-BR")} · {a.alert_type}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {isAdmin && (
            <SectionCard title="Atalhos" description="Aprovações e gestão">
              <div className="grid grid-cols-2 gap-2">
                <Link to="/equipe/performance-geral"><Button variant="outline" size="sm" className="w-full"><TrendingUp className="size-4 mr-1" />Performance</Button></Link>
                <Link to="/equipe/metas"><Button variant="outline" size="sm" className="w-full"><Target className="size-4 mr-1" />Metas</Button></Link>
                <Link to="/usuarios"><Button variant="outline" size="sm" className="w-full"><FileText className="size-4 mr-1" />Usuários</Button></Link>
                <Link to="/auditoria"><Button variant="outline" size="sm" className="w-full"><Activity className="size-4 mr-1" />Auditoria</Button></Link>
              </div>
            </SectionCard>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
