import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  ArrowLeft, 
  AlertTriangle, 
  Zap, 
  ShieldCheck, 
  XCircle, 
  EyeOff, 
  LayoutList, 
  Play, 
  History,
  Target,
  Loader2,
  TrendingUp,
  DollarSign,
  Briefcase,
  Crosshair,
  BarChart3,
  Flame
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";

const brl = (n: number) => fmtBRL(n || 0);

export const Route = createFileRoute("/central/estrategica/$id")({ component: VisaoEstrategica });

type ItemRow = {
  id: string;
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  estimated_value: number; // Edital Unit
  quoted_value: number;    // Cost Unit
  dispute_value: number;   // Current Bid Unit
  homologated_value: number;
  profit_value: number;
  profit_margin_pct: number;
  disputar: boolean;
  needs_review: boolean;
  marca: string;
  modelo: string;
  status: string;
  prazo: string;
  me_epp: boolean;
  lote: string;
  catmat: string;
};

type BidData = {
  orgao: string;
  processo: string;
  objeto: string;
  total_estimated: number;
  total_quoted: number;
  total_dispute: number;
  total_homologated: number;
  total_profit_real: number;
  total_margin_real_pct: number;
};


function VisaoEstrategica() {
  const { id } = useParams({ from: "/central/estrategica/$id" });
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [bid, setBid] = useState<BidData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modoDisputa, setModoDisputa] = useState(false);
  const [itemExclusao, setItemExclusao] = useState<ItemRow | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [simuladorPrecos, setSimuladorPrecos] = useState<Record<string, number>>({});

  const fetchData = async () => {
    const [bidRes, itemsRes] = await Promise.all([
      supabase.from("bids").select("orgao, processo, objeto, total_estimated, total_quoted, total_dispute, total_homologated, total_profit_real, total_margin_real_pct").eq("id", id).single(),
      supabase.from("bid_items").select("*").eq("bid_id", id).order("item_number"),
    ]);
    
    if (bidRes.data) setBid(bidRes.data as any);
    
    if (itemsRes.data) {
      setItems(itemsRes.data as any);
      const initialSim: Record<string, number> = {};
      itemsRes.data.forEach(it => {
        initialSim[it.id] = Number(it.dispute_value) || Number(it.estimated_value) || 0;
      });
      setSimuladorPrecos(initialSim);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [id]);


  const patchLocal = (itemId: string, patch: Partial<ItemRow>) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...patch } : it));
  };

  const handleExcluir = async () => {
    if (!itemExclusao) return;
    try {
      const { error } = await supabase
        .from("bid_items")
        .update({ 
          disputar: false, 
          status: 'inviavel',
          observacao: `Excluído da disputa: ${motivoExclusao}`
        })
        .eq("id", itemExclusao.id);
      
      if (error) throw error;
      
      patchLocal(itemExclusao.id, { disputar: false, status: 'inviavel' });
      toast.success("Item removido da disputa");
      setItemExclusao(null);
      setMotivoExclusao("");
    } catch (e) {
      toast.error("Erro ao remover item");
    }
  };

  const updateSimPreco = async (itemId: string, val: number) => {
    setSimuladorPrecos(prev => ({ ...prev, [itemId]: val }));
    // Persist to engine
    const { error } = await supabase.from("bid_items").update({ dispute_value: val }).eq("id", itemId);
    if (!error) {
      // Re-fetch bid header to get updated consolidated KPIs from trigger
      const { data } = await supabase.from("bids").select("total_estimated, total_quoted, total_dispute, total_homologated, total_profit_real, total_margin_real_pct").eq("id", id).single();
      if (data) setBid(prev => prev ? { ...prev, ...data } : data as any);
    }
  };

  const calcItemStats = (it: ItemRow) => {
    const custo = Number(it.quoted_value) || 0;
    const editalUnit = Number(it.estimated_value) || 0;
    
    const initialMargin = 40;
    const minSafeMargin = 15;
    
    const initialPrice = custo * (1 + initialMargin / 100);
    const minSafePrice = custo * (1 + minSafeMargin / 100);
    const recommendedPrice = editalUnit * 0.98;
    
    const currentSimPrice = simuladorPrecos[it.id] ?? it.dispute_value;
    const marginAtSim = currentSimPrice > 0 ? ((currentSimPrice - custo) / currentSimPrice) * 100 : 0;
    
    let color: "success" | "warning" | "destructive" = "success";
    let statusTxt = "Margem Ideal";
    
    if (currentSimPrice < minSafePrice) {
      color = "destructive";
      statusTxt = "Margem Crítica";
    } else if (currentSimPrice < custo * (1 + (minSafeMargin + 5) / 100)) {
      color = "warning";
      statusTxt = "Margem Mínima";
    }

    return { custo, initialPrice, minSafePrice, recommendedPrice, color, statusTxt, marginAtSim };
  };

  const updateCusto = async (itemId: string, val: number) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, quoted_value: val } : it));
    await supabase.from("bid_items").update({ quoted_value: val }).eq("id", itemId);
    // Refresh to trigger consolidated KPIs update
    const { data } = await supabase.from("bids").select("total_estimated, total_quoted, total_dispute, total_homologated, total_profit_real, total_margin_real_pct").eq("id", id).single();
    if (data) setBid(prev => prev ? { ...prev, ...data } : data as any);
  };


  // Cálculo em tempo real a partir dos itens + simulador (lance) — não depende de header consolidado
  const TAX_RATE = 0.24; // 24% sobre o lucro bruto = imposto sobre lucro
  const executiveStats = useMemo(() => {
    let totalEdital = 0, totalDisputa = 0, totalGanhando = 0, totalCusto = 0;
    items.forEach((it) => {
      if (!it.disputar || it.status === 'inviavel') return;
      const qtd = Number(it.quantidade) || 0;
      const editalUnit = Number(it.estimated_value) || 0;
      const custo = Number(it.quoted_value) || 0;
      const lance = Number(simuladorPrecos[it.id] ?? it.dispute_value) || 0;
      totalEdital += editalUnit * qtd;
      if (lance > 0) {
        totalDisputa += lance * qtd;
        totalGanhando += lance * qtd;
        totalCusto += custo * qtd;
      }
    });
    const lucroBruto = totalGanhando - totalCusto;
    const imposto = lucroBruto > 0 ? lucroBruto * TAX_RATE : 0;
    const lucroLiquido = lucroBruto - imposto;
    const margem = totalGanhando > 0 ? (lucroLiquido / totalGanhando) * 100 : 0;
    return {
      totalEdital,
      totalDisputa,
      totalGanhando,
      totalVenda: totalGanhando,
      lucroGanhando: lucroLiquido,
      lucroBruto,
      imposto,
      margemGanhando: margem,
      statusRisco: (margem < 10 ? 'critico' : margem < 18 ? 'atencao' : 'seguro') as 'critico' | 'atencao' | 'seguro',
    };
  }, [items, simuladorPrecos]);


  if (loading) {
    return (
      <AppShell title="Visão Estratégica">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Carregando painel estratégico...</p>
        </div>
      </AppShell>
    );
  }

  const filteredItems = items.filter(it => it.disputar && it.status !== 'inviavel');


  return (
    <AppShell
      title="Painel Estratégico de Disputa"
      actions={
        <div className="flex items-center gap-2">
          <Button 
            variant={modoDisputa ? "secondary" : "outline"} 
            size="sm" 
            onClick={() => setModoDisputa(!modoDisputa)}
            className="hidden sm:flex"
          >
            {modoDisputa ? <LayoutList className="size-4 mr-2" /> : <Play className="size-4 mr-2" />}
            {modoDisputa ? "Ver Completo" : "Modo Disputa"}
          </Button>
          <Link to="/central/$id" params={{ id }}>
            <Button size="sm" variant="outline"><ArrowLeft className="size-4 mr-2" />Voltar</Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* CABEÇALHO EXECUTIVO DINÂMICO */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Briefcase className="size-4 text-slate-500 mb-2" />
              <p className="text-[10px] uppercase font-bold text-slate-500 leading-none mb-1">Total Edital</p>
              <p className="text-lg font-black text-slate-900 tabular-nums">{brl(executiveStats.totalEdital)}</p>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Crosshair className="size-4 text-blue-600 mb-2" />
              <p className="text-[10px] uppercase font-bold text-blue-600 leading-none mb-1">Total em Disputa</p>
              <p className="text-lg font-black text-blue-900 tabular-nums">{brl(executiveStats.totalDisputa)}</p>
            </CardContent>
          </Card>

          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Zap className="size-4 text-emerald-600 mb-2" />
              <p className="text-[10px] uppercase font-bold text-emerald-600 leading-none mb-1">Total Ganhando</p>
              <p className="text-lg font-black text-emerald-900 tabular-nums">{brl(executiveStats.totalGanhando)}</p>
            </CardContent>
          </Card>

          <Card className="bg-indigo-50 border-indigo-200">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <DollarSign className="size-4 text-indigo-600 mb-2" />
              <p className="text-[10px] uppercase font-bold text-indigo-600 leading-none mb-1">Valor de Venda</p>
              <p className="text-lg font-black text-indigo-900 tabular-nums">{brl(executiveStats.totalVenda)}</p>
            </CardContent>
          </Card>

          <Card className="bg-cyan-50 border-cyan-200">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <TrendingUp className="size-4 text-cyan-600 mb-2" />
              <p className="text-[10px] uppercase font-bold text-cyan-600 leading-none mb-1">Lucro Líquido</p>
              <p className="text-lg font-black text-cyan-900 tabular-nums">{brl(executiveStats.lucroGanhando)}</p>
              <p className="text-[9px] text-cyan-700 mt-1">Após imposto 24% ({brl(executiveStats.imposto)})</p>
            </CardContent>
          </Card>

          <Card className={`${
            executiveStats.statusRisco === 'seguro' ? 'bg-green-50 border-green-200' : 
            executiveStats.statusRisco === 'atencao' ? 'bg-amber-50 border-amber-200' : 
            'bg-red-50 border-red-200'
          }`}>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <BarChart3 className={`size-4 mb-2 ${
                executiveStats.statusRisco === 'seguro' ? 'text-green-600' : 
                executiveStats.statusRisco === 'atencao' ? 'text-amber-600' : 
                'text-red-600'
              }`} />
              <p className={`text-[10px] uppercase font-bold leading-none mb-1 ${
                executiveStats.statusRisco === 'seguro' ? 'text-green-600' : 
                executiveStats.statusRisco === 'atencao' ? 'text-amber-600' : 
                'text-red-600'
              }`}>Margem (Ganhos)</p>
              <p className={`text-lg font-black tabular-nums ${
                executiveStats.statusRisco === 'seguro' ? 'text-green-900' : 
                executiveStats.statusRisco === 'atencao' ? 'text-amber-900' : 
                'text-red-900'
              }`}>{executiveStats.margemGanhando.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>

        {/* ALERTAS EXECUTIVOS */}
        {(executiveStats.margemGanhando < 25 || executiveStats.statusRisco !== 'seguro') && (
          <div className="flex flex-col gap-2">
            {executiveStats.margemGanhando < 15 && (
              <Alert variant="destructive" className="animate-pulse">
                <Flame className="size-4" />
                <AlertTitle className="font-bold uppercase text-xs">Risco Operacional Crítico</AlertTitle>
                <AlertDescription className="text-xs font-medium">A margem dos itens ganhos está abaixo de 15%. Revise os lances imediatamente para evitar prejuízos.</AlertDescription>
              </Alert>
            )}
            {executiveStats.margemGanhando >= 15 && executiveStats.margemGanhando < 25 && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                <AlertTriangle className="size-4 text-amber-600" />
                <AlertTitle className="font-bold uppercase text-xs text-amber-700">Margem em Alerta</AlertTitle>
                <AlertDescription className="text-xs font-medium text-amber-600">A rentabilidade dos itens ganhos está diminuindo. Monitore os próximos lances com cautela.</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="flex items-end justify-between border-b pb-4 mt-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
              <ShieldCheck className="size-6" /> Itens em Disputa
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {bid?.orgao} <span className="mx-2 opacity-30">|</span> {bid?.processo}
            </p>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Itens Ativos</p>
                <p className="text-xl font-bold tabular-nums leading-none">{filteredItems.length}</p>
             </div>
             <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 h-10 px-4 text-sm font-bold">
                MODO ESTRATÉGICO ATIVO
             </Badge>
          </div>
        </div>

        <div className="grid gap-4">
          {filteredItems.map((it) => {
            const stats = calcItemStats(it);
            
            if (modoDisputa) {
              const colorCls = stats.color === 'success' ? 'border-l-emerald-500' : stats.color === 'warning' ? 'border-l-amber-500' : 'border-l-red-500';
              return (
                <div key={it.id} className={`p-4 border rounded-lg shadow-sm bg-card border-l-4 ${colorCls} flex items-center justify-between gap-4 animate-in fade-in slide-in-from-right-2 duration-300`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="bg-primary text-primary-foreground size-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                        {it.item_number}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold truncate text-base leading-none mb-1">{it.descricao}</p>
                        <p className="text-[10px] text-muted-foreground truncate font-bold uppercase tracking-tight">{it.marca} | {it.modelo}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right">
                        <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Preço Inicial (40%)</p>
                        <p className="text-sm font-bold text-primary tabular-nums leading-none">{brl(stats.initialPrice)}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Mínimo (15%)</p>
                        <p className="text-sm font-bold text-destructive tabular-nums leading-none">{brl(stats.minSafePrice)}</p>
                      </div>
                      
                      <div className="w-28">
                         <p className="text-[9px] uppercase font-bold text-primary mb-0.5 text-center">Lance Atual</p>
                         <Input 
                           type="number" 
                           step="0.01"
                           className="h-9 text-center font-black text-base bg-primary/5 border-primary/20"
                           value={simuladorPrecos[it.id] || ""}
                           onChange={(e) => updateSimPreco(it.id, parseFloat(e.target.value) || 0)}
                         />
                      </div>

                      <div className="text-center w-24">
                        <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Margem</p>
                        <p className={`text-sm font-black leading-none ${stats.color === 'success' ? 'text-emerald-600' : stats.color === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                          {stats.marginAtSim.toFixed(1)}%
                        </p>
                      </div>

                      <div className="text-center w-28">
                        <Badge variant="outline" className={`w-full py-1.5 justify-center font-bold text-[10px] uppercase tracking-tighter ${stats.color === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : stats.color === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                           {stats.statusTxt}
                        </Badge>
                      </div>
                    </div>
                </div>
              );
            }

            return (
              <div key={it.id} className="bg-card rounded-xl border shadow-sm overflow-hidden group hover:border-primary/30 transition-all">
                <div className="flex flex-col md:flex-row">
                  <div className="p-4 md:w-1/3 border-b md:border-b-0 md:border-r bg-muted/20">
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground size-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                        {it.item_number}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-base leading-tight mb-1">{it.descricao}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                           <Badge variant="secondary" className="text-[10px] uppercase">{it.marca || "Marca não def."}</Badge>
                           <Badge variant="secondary" className="text-[10px] uppercase">{it.modelo || "Modelo não def."}</Badge>
                           {it.me_epp && <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">ME/EPP EXCLUSIVO</Badge>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 grid grid-cols-2 gap-2">
                       <div className="bg-background/60 rounded-md p-2 border border-dashed text-center">
                          <p className="text-[9px] uppercase font-bold text-muted-foreground leading-none mb-1">Prazo Entrega</p>
                          <p className="text-xs font-semibold">{it.prazo || "N/A"}</p>
                       </div>
                       <div className="bg-background/60 rounded-md p-2 border border-dashed text-center">
                          <p className="text-[9px] uppercase font-bold text-muted-foreground leading-none mb-1">Referência</p>
                          <p className="text-xs font-semibold">{it.catmat || "Sem CATMAT"}</p>
                       </div>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                       <div>
                          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Preço Edital</p>
                          <p className="text-base font-bold tabular-nums text-muted-foreground/80">{brl(it.estimated_value)}</p>
                       </div>
                       <div>
                          <p className="text-[10px] uppercase font-bold text-primary mb-1">Custo Unit.</p>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 font-bold text-sm bg-amber-50/50 border-amber-200"
                            value={it.quoted_value || ""}
                            placeholder="0,00"
                            onChange={(e) => updateCusto(it.id, parseFloat(e.target.value) || 0)}
                          />
                       </div>
                       <div>
                          <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Inicial (40%)</p>
                          <p className="text-base font-black text-emerald-700 tabular-nums">{brl(stats.initialPrice)}</p>
                       </div>
                       <div>
                          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1 flex items-center gap-1">
                             Mínimo (15%) <Target className="size-3 text-destructive" />
                          </p>
                          <p className="text-base font-black text-destructive tabular-nums">{brl(stats.minSafePrice)}</p>
                       </div>
                       <div className="relative">
                          <p className="text-[10px] uppercase font-bold text-primary mb-1 flex items-center gap-1">
                             Lance <Zap className="size-3" />
                          </p>
                          <Input 
                            type="number" 
                            step="0.01"
                            className="h-8 font-bold text-sm bg-primary/5 border-primary/20"
                            value={simuladorPrecos[it.id] ?? ""}
                            onChange={(e) => updateSimPreco(it.id, parseFloat(e.target.value) || 0)}
                          />
                          <p className={`text-[10px] font-bold mt-1 ${stats.color === 'success' ? 'text-emerald-600' : stats.color === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                            Margem: {stats.marginAtSim.toFixed(1)}%
                          </p>
                       </div>
                    </div>


                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <Badge variant="outline" className={`h-7 px-3 flex items-center gap-1.5 ${stats.color === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : stats.color === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                            <div className={`size-1.5 rounded-full ${stats.color === 'success' ? 'bg-emerald-500' : stats.color === 'warning' ? 'bg-amber-500' : 'bg-red-500'} animate-pulse`} />
                            {stats.statusTxt}
                         </Badge>
                         
                         {stats.marginAtSim < 5 && (
                           <span className="text-[11px] font-bold text-destructive uppercase animate-bounce flex items-center gap-1">
                              <AlertTriangle className="size-3" /> Risco de Prejuízo
                           </span>
                         )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground">
                          <History className="size-4 mr-1" /> Histórico
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setItemExclusao(it)}
                            >
                              <EyeOff className="size-4 mr-1" /> Remover Item
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Remover do Pregão: Item #{itemExclusao?.item_number}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                               <div>
                                  <label className="text-xs font-bold uppercase text-muted-foreground">Motivo da Desistência</label>
                                  <Select value={motivoExclusao} onValueChange={setMotivoExclusao}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Selecione o motivo..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="preco_alto">Preço do fornecedor inviável</SelectItem>
                                      <SelectItem value="sem_estoque">Fornecedor sem estoque</SelectItem>
                                      <SelectItem value="marca_indesejada">Exigência de marca específica</SelectItem>
                                      <SelectItem value="risco_logistico">Risco logístico / Prazo curto</SelectItem>
                                      <SelectItem value="outro">Outro motivo</SelectItem>
                                    </SelectContent>
                                  </Select>
                               </div>
                               <div>
                                  <label className="text-xs font-bold uppercase text-muted-foreground">Observação Adicional</label>
                                  <Textarea 
                                    className="mt-1" 
                                    placeholder="Detalhes sobre a remoção deste item..."
                                    value={motivoExclusao === 'outro' ? motivoExclusao : ""}
                                    onChange={(e) => setMotivoExclusao(e.target.value)}
                                  />
                               </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setItemExclusao(null)}>Cancelar</Button>
                              <Button variant="destructive" onClick={handleExcluir}>Confirmar Exclusão</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="py-20 text-center space-y-4">
              <XCircle className="size-12 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground font-medium">Nenhum item ativo na disputa.</p>
              <Button variant="outline" onClick={() => navigate({ to: '/central/$id', params: { id } })}>
                Voltar ao Wizard para ativar itens
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {filteredItems.some(it => calcItemStats(it).color === 'destructive') && (
        <div className="fixed bottom-20 right-8 animate-in fade-in slide-in-from-bottom-4 duration-500 z-50">
           <Alert variant="destructive" className="shadow-2xl border-2 w-80 bg-background/95 backdrop-blur">
              <AlertTriangle className="size-5" />
              <AlertTitle className="font-bold">DISPUTA CRÍTICA</AlertTitle>
              <AlertDescription className="text-xs">
                Existem itens com lance simulado abaixo do limite mínimo seguro. Verifique os cards em vermelho.
              </AlertDescription>
           </Alert>
        </div>
      )}
    </AppShell>
  );
}

export default VisaoEstrategica;
