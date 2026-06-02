import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, Calculator, TrendingUp, DollarSign, Layers, Eye, FileUp, Trash2, ShieldCheck, History as HistoryIcon } from "lucide-react";
import { fmtBRL } from "@/lib/format";
import { useAllowedTipos } from "@/hooks/useAllowedTipos";
import { useAuth } from "@/hooks/useAuth";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { toast } from "sonner";

export const Route = createFileRoute("/central/")({ component: CentralIndex });

interface Bid {
  id: string; orgao: string; processo: string; objeto: string;
  status: string; created_at: string; updated_at?: string; tipo_cotacao: "empreendimentos" | "medicamentos";
  uasg?: string;
  resultado?: string | null;
  data_encerramento_propostas?: string;
  data_limite_entrega?: string;
}
interface ItemAgg { bid_id: string; quantidade: number; valor_unitario: number; margin_pct: number; chosen_response_id: string | null; id: string; }
interface PriceAgg { bid_item_id: string; valor_unitario: number; frete_unitario: number; imposto_pct: number; }

function CentralIndex() {
  const navigate = useNavigate();
  const allowed = useAllowedTipos();
  const { isAdmin } = useAuth();
  const [bids, setBids] = useState<Bid[]>([]);
  const [items, setItems] = useState<ItemAgg[]>([]);
  const [prices, setPrices] = useState<PriceAgg[]>([]);
  const [pendingBidIds, setPendingBidIds] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"todos" | "empreendimentos" | "medicamentos">("todos");
  const [openNew, setOpenNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"ativas" | "historico" | "canceladas">("ativas");
  const [novo, setNovo] = useState({
    orgao: "", processo: "", objeto: "",
    tipo_cotacao: (allowed[0] || "empreendimentos") as "empreendimentos" | "medicamentos",
  });

  async function load() {
    if (allowed.length === 0) return;
    const { data: b } = await supabase
      .from("bids").select("id, orgao, processo, objeto, status, resultado, created_at, updated_at, tipo_cotacao, uasg, data_encerramento_propostas, data_limite_entrega")
      .in("tipo_cotacao", allowed)
      .order("created_at", { ascending: false });
    const list = (b || []) as Bid[];
    setBids(list);
    if (list.length === 0) return;
    const ids = list.map((x) => x.id);
    const { data: its } = await supabase
      .from("bid_items")
      .select("id, bid_id, quantidade, valor_unitario, margin_pct, chosen_response_id")
      .in("bid_id", ids);
    setItems((its as ItemAgg[]) || []);
    const itemIds = (its || []).map((x: { id: string }) => x.id);
    if (itemIds.length > 0) {
      const { data: pr } = await supabase
        .from("bid_supplier_item_prices")
        .select("bid_item_id, response_id, valor_unitario, frete_unitario, imposto_pct")
        .in("bid_item_id", itemIds);
      setPrices((pr as PriceAgg[]) || []);
    }
    const { data: pend } = await supabase
      .from("bid_supplier_responses")
      .select("bid_id")
      .in("bid_id", ids)
      .eq("extraction_status", "processing");
    setPendingBidIds(new Set((pend || []).map((p: { bid_id: string }) => p.bid_id)));
  }
  useEffect(() => { load(); }, [allowed.join(",")]);

  const stats = useMemo(() => {
    let totalCotado = 0, lucroTotal = 0, margemSoma = 0, margemN = 0;
    for (const it of items) {
      const qt = Number(it.quantidade) || 0;
      const editalUnit = Number(it.valor_unitario) || 0;
      // Custo escolhido: do preço do response selecionado (se houver)
      let custo = editalUnit;
      if (it.chosen_response_id) {
        const p = prices.find((x) => x.bid_item_id === it.id && (x as unknown as { response_id: string }).response_id === it.chosen_response_id);
        if (p) custo = (Number(p.valor_unitario) || 0) + (Number(p.frete_unitario) || 0) + ((Number(p.valor_unitario) || 0) * (Number(p.imposto_pct) || 0) / 100);
      }
      const margem = Number(it.margin_pct) || 0;
      // Total cotado = valor estimado do edital (qtd × unit do edital), sem aplicar margem
      totalCotado += editalUnit * qt;
      // Lucro estimado = margem aplicada sobre o custo escolhido
      lucroTotal += custo * (margem / 100) * qt;
      margemSoma += margem; margemN++;
    }
    return {
      totalCotado, lucroTotal,
      margemMedia: margemN ? margemSoma / margemN : 0,
      cotacoes: bids.length,
    };
  }, [items, prices, bids]);

  // Total simples (qtd × valor_unitario do item) por bid — usado no Histórico
  const totalsByBid = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const t = (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0);
      m.set(it.bid_id, (m.get(it.bid_id) || 0) + t);
    }
    return m;
  }, [items]);

  const ATIVOS = new Set(["rascunho", "em_cotacao", "cotado", "em_analise"]);
  const baseList = bids.filter((r) => {
    const s = q.toLowerCase().trim();
    if (tipo !== "todos" && r.tipo_cotacao !== tipo) return false;
    if (!s) return true;
    return (
      r.uasg?.toLowerCase().includes(s) ||
      r.processo?.toLowerCase().includes(s) ||
      r.orgao?.toLowerCase().includes(s) ||
      r.objeto?.toLowerCase().includes(s)
    );
  });
  
  const ativas = baseList.filter((r) => ATIVOS.has(r.status) && r.status !== "cancelada");
  const historico = baseList.filter((r) => !ATIVOS.has(r.status) && r.status !== "cancelada");
  const canceladas = baseList.filter((r) => r.status === "cancelada");

  const filteredRows = useMemo(() => {
    if (tab === "ativas") return ativas;
    if (tab === "historico") return historico;
    return canceladas;
  }, [tab, ativas, historico, canceladas]);

  async function criar() {
    if (!novo.orgao && !novo.processo) { toast.error("Informe órgão ou processo"); return; }
    const { data, error } = await supabase.from("bids").insert({
      orgao: novo.orgao, processo: novo.processo, objeto: novo.objeto,
      tipo_cotacao: novo.tipo_cotacao, status: "rascunho",
    }).select().single();
    if (error || !data) { toast.error("Erro ao criar"); return; }
    setOpenNew(false);
    navigate({ to: "/central/$id", params: { id: data.id } });
  }

  async function handleDelete(row: Bid) {
    if (!confirm(`Excluir a cotação "${row.orgao || row.processo || "sem título"}"? Itens, respostas e arquivos serão removidos.`)) return;
    setDeletingId(row.id);
    try {
      const { data: resps } = await supabase.from("bid_supplier_responses").select("id, source_file_url").eq("bid_id", row.id);
      const respIds = (resps || []).map((r) => r.id);
      if (respIds.length > 0) {
        await supabase.from("bid_supplier_item_prices").delete().in("response_id", respIds);
        const files = (resps || []).map((r) => r.source_file_url).filter((u): u is string => !!u);
        if (files.length > 0) await supabase.storage.from("supplier-quotes").remove(files);
        await supabase.from("bid_supplier_responses").delete().eq("bid_id", row.id);
      }
      await supabase.from("bid_items").delete().eq("bid_id", row.id);
      const { data: bidRow } = await supabase.from("bids").select("source_file_url").eq("id", row.id).maybeSingle();
      if (bidRow?.source_file_url) { try { await supabase.storage.from("editais").remove([bidRow.source_file_url]); } catch { /* ignore */ } }
      const { error } = await supabase.from("bids").delete().eq("id", row.id);
      if (error) throw error;
      setBids((arr) => arr.filter((r) => r.id !== row.id));
      toast.success("Cotação excluída");
    } catch (e) {
      console.error("[handleDelete]", e);
      toast.error("Erro ao excluir cotação");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell title="Central de Cotação e Proposta" actions={
      <div className="flex gap-2">
        <Link to="/novo"><Button variant="outline"><FileUp className="size-4 mr-2" />Importar Edital (IA)</Button></Link>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4 mr-2" />Nova Cotação Manual</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova cotação manual</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Órgão</Label><Input value={novo.orgao} onChange={(e) => setNovo({ ...novo, orgao: e.target.value })} /></div>
              <div><Label>Processo</Label><Input value={novo.processo} onChange={(e) => setNovo({ ...novo, processo: e.target.value })} /></div>
              <div><Label>Objeto</Label><Input value={novo.objeto} onChange={(e) => setNovo({ ...novo, objeto: e.target.value })} /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={novo.tipo_cotacao} onValueChange={(v) => setNovo({ ...novo, tipo_cotacao: v as "empreendimentos" | "medicamentos" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowed.includes("empreendimentos") && <SelectItem value="empreendimentos">Pará Empreendimentos</SelectItem>}
                    {allowed.includes("medicamentos") && <SelectItem value="medicamentos">Pará Medicamentos</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={criar}>Criar e abrir wizard</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

    }>
      <div className="space-y-6">
        {/* Dashboard */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<Layers className="size-5" />} label="Cotações" value={stats.cotacoes.toString()} tone="primary" />
          <StatCard icon={<DollarSign className="size-5" />} label="Total cotado" value={fmtBRL(stats.totalCotado)} tone="emerald" />
          <StatCard icon={<TrendingUp className="size-5" />} label="Margem média" value={`${stats.margemMedia.toFixed(1)}%`} tone="violet" />
          <StatCard icon={<Calculator className="size-5" />} label="Lucro estimado" value={fmtBRL(stats.lucroTotal)} tone="amber" />
        </div>

        <Card>
          <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="ativas"><Calculator className="size-4 mr-1" />Ativas <Badge variant="secondary" className="ml-2">{ativas.length}</Badge></TabsTrigger>
                <TabsTrigger value="historico"><HistoryIcon className="size-4 mr-1" />Finalizadas <Badge variant="secondary" className="ml-2">{historico.length}</Badge></TabsTrigger>
                <TabsTrigger value="canceladas"><Trash2 className="size-4 mr-1" />Canceladas <Badge variant="secondary" className="ml-2">{canceladas.length}</Badge></TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar por UASG, processo ou órgão…" className="pl-9 w-72" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="empreendimentos">Empreendimentos</SelectItem>
                  <SelectItem value="medicamentos">Medicamentos</SelectItem>
                </SelectContent>
              </Select>
              <Select 
                value={tab === "ativas" ? "ativa" : "finalizada"} 
                onValueChange={(v) => setTab(v === "ativa" ? "ativas" : "historico")}
              >
                <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativas / Pendentes</SelectItem>
                  <SelectItem value="finalizada">Finalizadas / Histórico</SelectItem>
                  <SelectItem value="cancelada">Canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <BidsTable
              rows={filteredRows}
              totalsByBid={totalsByBid}
              pendingBidIds={pendingBidIds}
              isAdmin={isAdmin}
              deletingId={deletingId}
              onDelete={handleDelete}
              emptyText={
                tab === "ativas" 
                  ? "Nenhuma cotação ativa ou pendente." 
                  : tab === "historico" 
                  ? "Nenhuma cotação finalizada." 
                  : "Nenhuma cotação cancelada."
              }
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary" | "emerald" | "violet" | "amber" }) {
  const tones: Record<string, string> = {
    primary: "from-primary/15 to-primary/5 text-primary",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    violet: "from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
  };
  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${tones[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
          {icon}
        </div>
        <div className="text-2xl font-bold mt-2 text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function BidsTable({ rows, totalsByBid, pendingBidIds, isAdmin, deletingId, onDelete, emptyText }: {
  rows: Bid[]; totalsByBid: Map<string, number>; pendingBidIds: Set<string>;
  isAdmin: boolean; deletingId: string | null; onDelete: (r: Bid) => void; emptyText: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-6 py-3 text-left">Atualizado</th>
            <th className="px-4 py-3 text-left">Tipo</th>
            <th className="px-4 py-3 text-left">UASG</th>
            <th className="px-4 py-3 text-left">Órgão / Processo</th>
            <th className="px-4 py-3 text-left">Encerramento / Entrega</th>
            <th className="px-4 py-3 text-right">Valor estimado</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = totalsByBid.get(r.id) || 0;
            const updated = r.updated_at || r.created_at;
            return (
              <tr key={r.id} className="border-t hover:bg-muted/40">
                <td className="px-6 py-3 whitespace-nowrap text-xs">
                  <div>{new Date(updated).toLocaleDateString("pt-BR")}</div>
                  <div className="text-muted-foreground">{new Date(updated).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                </td>
                <td className="px-4 py-3"><Badge variant="outline" className="capitalize text-xs">{r.tipo_cotacao}</Badge></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.uasg ? <span className="font-mono font-semibold text-primary">{r.uasg}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3">
                  <Link to="/central/$id" params={{ id: r.id }} className="font-medium hover:underline hover:text-primary">
                    {r.orgao || "Sem órgão"}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    <Link to="/central/$id" params={{ id: r.id }} className="hover:underline hover:text-primary">
                      {r.processo || "—"}
                    </Link>
                    {r.objeto ? ` · ${r.objeto}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  {r.data_encerramento_propostas && <div><span className="text-muted-foreground">Encerra:</span> <span className="font-medium">{r.data_encerramento_propostas}</span></div>}
                  {r.data_limite_entrega && <div><span className="text-muted-foreground">Entrega:</span> <span className="font-medium">{r.data_limite_entrega}</span></div>}
                  {!r.data_encerramento_propostas && !r.data_limite_entrega && <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-6 py-3 text-right whitespace-nowrap tabular-nums font-medium">
                  {total > 0 ? fmtBRL(total) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-6 py-3">
                  <StatusBadge status={r.status} resultado={r.resultado} hasPendingResponses={pendingBidIds.has(r.id)} />
                </td>
                <td className="px-6 py-3 text-right space-x-1">
                  <Link to="/central/$id" params={{ id: r.id }}><Button size="sm" variant="outline">Abrir</Button></Link>
                  <Link to="/central/estrategica/$id" params={{ id: r.id }}><Button size="sm" variant="ghost" className="text-primary hover:text-primary hover:bg-primary/10"><ShieldCheck className="size-4 mr-1" />Visão Estratégica</Button></Link>
                  {isAdmin && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={deletingId === r.id} onClick={() => onDelete(r)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
