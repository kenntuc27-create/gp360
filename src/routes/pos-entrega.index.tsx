import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileCheck, Clock, CircleDollarSign, AlertTriangle, 
  ArrowRight, Search, Filter, Loader2, Building2,
  CalendarCheck
} from "lucide-react";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { PeriodFilter, getPeriodRange, type PeriodKey } from "@/components/dashboard/PeriodFilter";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { fmtBRL, fmtDate } from "@/lib/format";
import { useAllowedTipos } from "@/hooks/useAllowedTipos";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/pos-entrega/")({ component: PosEntregaDashboard });

interface DeliveryWithBid {
  id: string;
  bid_id: string;
  status: string;
  delivery_date: string | null;
  paid_at: string | null;
  paid_amount: number;
  nfe_numero: string;
  bid: {
    orgao: string;
    processo: string;
    objeto: string;
  };
  total_value: number;
}

function PosEntregaDashboard() {
  const allowed = useAllowedTipos();
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<DeliveryWithBid[]>([]);
  const [periodKey, setPeriodKey] = useState<PeriodKey>("30d");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [search, setSearch] = useState("");

  const load = async () => {
    if (allowed.length === 0) return;
    setLoading(true);
    try {
      // Carrega entregas com dados dos editais
      const { data, error } = await supabase
        .from("bid_deliveries")
        .select(`
          *,
          bid:bids(orgao, processo, objeto, tipo_cotacao)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filtra por tipo de cotação permitido
      const filtered = (data || []).filter((d: any) => 
        allowed.includes(d.bid?.tipo_cotacao)
      ) as unknown as DeliveryWithBid[];

      // Para cada entrega, vamos calcular o valor total dos itens vencedores se não tivermos
      // Em um sistema real, poderíamos ter um campo total_valor denormalizado em bid_deliveries
      // Para o MVP, vamos buscar os itens para cada uma ou assumir que o valor ganho é o que importa
      
      const deliveriesWithValues = await Promise.all(filtered.map(async (d) => {
        const { data: items } = await supabase
          .from("bid_items")
          .select("quantidade, preco_homologado")
          .eq("bid_id", d.bid_id)
          .eq("venceu", true);
        
        const total = (items || []).reduce((acc, item) => 
          acc + (item.quantidade * (item.preco_homologado || 0)), 0
        );
        
        return { ...d, total_value: total };
      }));

      setDeliveries(deliveriesWithValues);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [allowed.join(",")]);

  const range = useMemo(
    () => getPeriodRange(periodKey, customStart, customEnd),
    [periodKey, customStart, customEnd]
  );

  const filteredData = useMemo(() => {
    return deliveries.filter((d) => {
      const created = new Date(d.delivery_date || Date.now()).getTime();
      const inPeriod = created >= range.start.getTime() && created <= range.end.getTime();
      const matchesSearch = 
        d.bid.orgao.toLowerCase().includes(search.toLowerCase()) ||
        d.bid.processo.toLowerCase().includes(search.toLowerCase()) ||
        d.nfe_numero.toLowerCase().includes(search.toLowerCase());
      return inPeriod && matchesSearch;
    });
  }, [deliveries, range, search]);

  // KPIs
  const kpis = useMemo(() => {
    const aguardandoAceite = filteredData.filter(d => d.status === 'aguardando_aceite').length;
    const aguardandoPagamento = filteredData.filter(d => d.status === 'aguardando_pagamento').length;
    const valorAReceber = filteredData
      .filter(d => d.status !== 'pago' && d.status !== 'finalizado')
      .reduce((acc, d) => acc + d.total_value, 0);
    const valorRecebido = filteredData.reduce((acc, d) => acc + (d.paid_amount || 0), 0);
    
    // Atrasados: Status aguardando_pagamento há mais de 30 dias (exemplo)
    const hoje = new Date();
    const atrasadosCount = filteredData.filter(d => {
      if (d.status === 'aguardando_pagamento' && d.delivery_date) {
        const diff = hoje.getTime() - new Date(d.delivery_date).getTime();
        return diff > (30 * 24 * 60 * 60 * 1000); // 30 dias
      }
      return false;
    }).length;

    // Tempo médio de recebimento (dias entre entrega e pagamento)
    const paidDeliveries = filteredData.filter(d => d.paid_at && d.delivery_date);
    const avgTime = paidDeliveries.length > 0 
      ? paidDeliveries.reduce((acc, d) => {
          const start = new Date(d.delivery_date!).getTime();
          const end = new Date(d.paid_at!).getTime();
          return acc + (end - start);
        }, 0) / (paidDeliveries.length * 24 * 60 * 60 * 1000)
      : 0;

    return {
      aguardandoAceite,
      aguardandoPagamento,
      valorAReceber,
      valorRecebido,
      atrasadosCount,
      avgTime: Math.round(avgTime)
    };
  }, [filteredData]);

  // Ranking de órgãos com maior atraso
  const rankingOrgaos = useMemo(() => {
    const orgaos: Record<string, { name: string; count: number; value: number }> = {};
    filteredData.forEach(d => {
      if (d.status === 'aguardando_pagamento') {
        if (!orgaos[d.bid.orgao]) orgaos[d.bid.orgao] = { name: d.bid.orgao, count: 0, value: 0 };
        orgaos[d.bid.orgao].count++;
        orgaos[d.bid.orgao].value += d.total_value;
      }
    });
    return Object.values(orgaos).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [filteredData]);

  return (
    <AppShell 
      title="Dashboard Pós-Entrega" 
      actions={
        <div className="flex items-center gap-2">
          <PeriodFilter
            value={periodKey}
            onChange={(k, s, e) => { setPeriodKey(k); setCustomStart(s); setCustomEnd(e); }}
          />
        </div>
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* KPIs Section */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiTile 
            label="Aguardando Aceite" 
            value={kpis.aguardandoAceite} 
            icon={<Clock className="size-4" />} 
            tone="warning" 
          />
          <KpiTile 
            label="Aguardando Pgto" 
            value={kpis.aguardandoPagamento} 
            icon={<Clock className="size-4" />} 
            tone="warning" 
          />
          <KpiTile 
            label="Total a Receber" 
            value={fmtBRL(kpis.valorAReceber)} 
            icon={<CircleDollarSign className="size-4" />} 
          />
          <KpiTile 
            label="Total Recebido" 
            value={fmtBRL(kpis.valorRecebido)} 
            icon={<FileCheck className="size-4" />} 
            tone="success" 
          />
          <KpiTile 
            label="Pagos Atrasados" 
            value={kpis.atrasadosCount} 
            icon={<AlertTriangle className="size-4" />} 
            tone="destructive" 
            hint="Mais de 30 dias"
          />
          <KpiTile 
            label="T. Médio Receb." 
            value={`${kpis.avgTime} dias`} 
            icon={<CalendarCheck className="size-4" />} 
            tone="default"
          />
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main List */}
          <Card className="xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold">Acompanhamento de Entregas</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar órgão, processo, NF..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Órgão / Processo</th>
                      <th className="px-4 py-3 text-left font-medium">NF-e</th>
                      <th className="px-4 py-3 text-left font-medium">Data Entrega</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Valor Total</th>
                      <th className="px-4 py-3 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center">
                          <Loader2 className="size-6 animate-spin mx-auto text-primary" />
                          <p className="text-muted-foreground mt-2">Carregando entregas...</p>
                        </td>
                      </tr>
                    ) : filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhuma entrega encontrada para este período.
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((d) => (
                        <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium">{d.bid.orgao}</div>
                            <div className="text-xs text-muted-foreground">{d.bid.processo}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{d.nfe_numero || "—"}</td>
                          <td className="px-4 py-3">{d.delivery_date ? fmtDate(d.delivery_date) : "—"}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={d.status} />
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {fmtBRL(d.total_value)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link to="/edital/$id/pos-entrega" params={{ id: d.bid_id }}>
                                <ArrowRight className="size-4" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Side Info */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  Órgãos com maior atraso
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {rankingOrgaos.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sem dados de atraso.</p>
                  ) : (
                    rankingOrgaos.map((o, i) => (
                      <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{o.name}</p>
                          <p className="text-xs text-muted-foreground">{o.count} entregas pendentes</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-destructive">{fmtBRL(o.value)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Alertas de Pós-Entrega
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Aqui seriam alertas automáticos baseados em lógica */}
                {filteredData.filter(d => d.status === 'entregue' && !d.nfe_numero).map((d, i) => (
                  <div key={i} className="p-2 border-l-4 border-amber-500 bg-amber-50 rounded flex gap-2 text-xs">
                    <div className="flex-1">
                      <p className="font-bold">NF-e não informada</p>
                      <p>{d.bid.orgao}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                       <Link to="/edital/$id/pos-entrega" params={{ id: d.bid_id }}><ArrowRight className="size-3" /></Link>
                    </Button>
                  </div>
                ))}
                {filteredData.filter(d => d.status === 'aguardando_aceite' && d.delivery_date && (new Date().getTime() - new Date(d.delivery_date).getTime() > 5 * 24 * 60 * 60 * 1000)).map((d, i) => (
                  <div key={i} className="p-2 border-l-4 border-destructive bg-destructive/5 rounded flex gap-2 text-xs">
                    <div className="flex-1">
                      <p className="font-bold">Aceite pendente (5+ dias)</p>
                      <p>{d.bid.orgao}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                       <Link to="/edital/$id/pos-entrega" params={{ id: d.bid_id }}><ArrowRight className="size-3" /></Link>
                    </Button>
                  </div>
                ))}
                {filteredData.length === 0 && <p className="text-xs text-muted-foreground">Nenhum alerta crítico.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
