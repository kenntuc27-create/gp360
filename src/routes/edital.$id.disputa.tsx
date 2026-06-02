import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, AlertTriangle, TrendingUp, Lock, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";
const brl = (n: number) => fmtBRL(n || 0);
const pct = (n: number) => `${(n || 0).toFixed(1)}%`;

const MARGEM_MINIMA = 15;

export const Route = createFileRoute("/edital/$id/disputa")({ component: DisputaPage });

type ItemRow = {
  id: string;
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number; // valor estimado do edital
  custo_unitario: number;
  preco_venda_manual: number;
  preco_modo: "margem" | "preco";
  margin_pct: number;
  disputar: boolean;
  needs_review: boolean;
  venceu: boolean;
  preco_homologado: number;
  // calculados em runtime
  best_supplier_cost: number; // menor cotação encontrada
};

function calcVenda(it: ItemRow): number {
  if (it.preco_modo === "preco") return it.preco_venda_manual || 0;
  return it.custo_unitario * (1 + (it.margin_pct || 0) / 100);
}
function calcMargem(it: ItemRow): number {
  const venda = calcVenda(it);
  if (!venda || !it.custo_unitario) return 0;
  return ((venda - it.custo_unitario) / venda) * 100;
}

function DisputaPage() {
  const { id } = useParams({ from: "/edital/$id/disputa" });
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [bid, setBid] = useState<{ orgao: string; processo: string; objeto: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [bidRes, itemsRes, respRes] = await Promise.all([
        supabase.from("bids").select("orgao, processo, objeto").eq("id", id).single(),
        supabase.from("bid_items").select("*").eq("bid_id", id).order("item_number"),
        supabase.from("bid_supplier_item_prices")
          .select("bid_item_id, valor_unitario, response_id, bid_supplier_responses!inner(bid_id)")
          .eq("bid_supplier_responses.bid_id", id),
      ]);
      if (bidRes.data) setBid({
        orgao: bidRes.data.orgao || "",
        processo: bidRes.data.processo || "",
        objeto: bidRes.data.objeto || "",
      });
      // mapeia menor preço por item
      const bestByItem = new Map<string, number>();
      for (const r of (respRes.data || []) as Array<{ bid_item_id: string; valor_unitario: number }>) {
        const cur = bestByItem.get(r.bid_item_id);
        const v = Number(r.valor_unitario || 0);
        if (v > 0 && (cur == null || v < cur)) bestByItem.set(r.bid_item_id, v);
      }
      const rows: ItemRow[] = (itemsRes.data || []).map((it) => {
        const best = bestByItem.get(it.id) || 0;
        return {
          id: it.id,
          item_number: it.item_number,
          descricao: it.descricao,
          unidade: it.unidade || "UN",
          quantidade: Number(it.quantidade || 0),
          valor_unitario: Number(it.valor_unitario || 0),
          custo_unitario: Number(it.custo_unitario || 0) || best, // auto-preenche se vazio
          preco_venda_manual: Number(it.preco_venda_manual || 0),
          preco_modo: (it.preco_modo as "margem" | "preco") || "margem",
          margin_pct: Number(it.margin_pct || 30),
          disputar: it.disputar !== false,
          needs_review: !!it.needs_review,
          venceu: !!it.venceu,
          preco_homologado: Number(it.preco_homologado || 0),
          best_supplier_cost: best,
        };
      });
      setItems(rows);
      setLoading(false);
    })();
  }, [id]);

  function patch(idItem: string, p: Partial<ItemRow>) {
    setItems((arr) => arr.map((it) => (it.id === idItem ? { ...it, ...p } : it)));
    setDirty((s) => new Set(s).add(idItem));
  }

  // ===== resumo só dos itens disputáveis e com valores válidos =====
  const ativos = useMemo(
    () => items.filter((i) => i.disputar && i.custo_unitario > 0 && calcVenda(i) > 0 && i.quantidade > 0),
    [items],
  );
  const resumo = useMemo(() => {
    let custo = 0, venda = 0, ganho = 0;
    for (const it of ativos) {
      custo += it.custo_unitario * it.quantidade;
      venda += calcVenda(it) * it.quantidade;
    }
    const vencedores = items.filter(i => i.venceu);
    for (const it of vencedores) {
      ganho += (it.preco_homologado || calcVenda(it)) * it.quantidade;
    }
    const lucro = venda - custo;
    const margem = venda > 0 ? (lucro / venda) * 100 : 0;
    return { custo, venda, lucro, margem, count: ativos.length, ganho, vencedoresCount: vencedores.length };
  }, [ativos, items]);

  const alertasMargem = items.filter((i) => i.disputar && calcMargem(i) > 0 && calcMargem(i) < MARGEM_MINIMA);
  const alertasSemCusto = items.filter((i) => i.disputar && i.custo_unitario <= 0);

  async function salvar() {
    setSaving(true);
    try {
      const updates = items.filter((i) => dirty.has(i.id));
      // bloqueio: não-admin não pode salvar item com margem < 15%
      if (!isAdmin) {
        const baixos = updates.filter(
          (i) => i.disputar && calcVenda(i) > 0 && calcMargem(i) < MARGEM_MINIMA,
        );
        if (baixos.length > 0) {
          toast.error(
            `${baixos.length} item(ns) com margem abaixo de ${MARGEM_MINIMA}%. Apenas administrador pode salvar.`,
            { duration: 7000 },
          );
          setSaving(false);
          return;
        }
      }
      for (const it of updates) {
        await supabase
          .from("bid_items")
          .update({
            disputar: it.disputar,
            custo_unitario: it.custo_unitario,
            preco_venda_manual: it.preco_venda_manual,
            preco_modo: it.preco_modo,
            margin_pct: it.margin_pct,
            venceu: it.venceu,
            preco_homologado: it.preco_homologado,
          })
          .eq("id", it.id);
      }
      setDirty(new Set());
      toast.success(`${updates.length} item(ns) salvos.`);
    } catch (e) {
      toast.error(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Visão da Juliana">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" /> Carregando…
        </div>
      </AppShell>
    );
  }

  function marcarTodosVencedores() {
    items.forEach(it => {
      if (it.disputar && !it.venceu) {
        patch(it.id, { venceu: true, preco_homologado: calcVenda(it) });
      }
    });
    toast.info("Itens em disputa marcados como vencedores.");
  }

  return (
    <AppShell title="Visão da Juliana · Disputa">
      <div className="space-y-4">
        {/* Header / breadcrumbs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link to="/edital/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="size-4" /> Voltar ao edital
            </Link>
            <h1 className="text-2xl font-semibold mt-1">{bid?.orgao || "Edital"}</h1>
            <p className="text-sm text-muted-foreground">{bid?.processo} · {bid?.objeto?.slice(0, 120)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={marcarTodosVencedores}>
              Marcar todos como vencedores
            </Button>
            <Button onClick={salvar} disabled={saving || dirty.size === 0}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              Salvar {dirty.size > 0 && `(${dirty.size})`}
            </Button>
            {resumo.vencedoresCount > 0 && (
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                <Link to="/edital/$id/pos-entrega" params={{ id }}>
                  Prosseguir para Pós-Entrega
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Resumo estratégico */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <ResumoCard label="Itens em disputa" value={`${resumo.count}/${items.length}`} />
          <ResumoCard label="Custo total" value={brl(resumo.custo)} />
          <ResumoCard label="Venda total" value={brl(resumo.venda)} />
          <ResumoCard label="Lucro" value={brl(resumo.lucro)} accent={resumo.lucro >= 0 ? "success" : "destructive"} />
          <ResumoCard
            label="Margem média"
            value={pct(resumo.margem)}
            accent={resumo.margem >= MARGEM_MINIMA ? "success" : resumo.margem > 0 ? "warning" : undefined}
            icon={<TrendingUp className="size-4" />}
          />
          <ResumoCard label="Vencido (Homologado)" value={brl(resumo.ganho)} accent="success" />
        </div>

        {/* Alertas */}
        {(alertasMargem.length > 0 || alertasSemCusto.length > 0) && (
          <Alert variant="default" className="border-warning/50 bg-warning/5">
            <AlertTriangle className="size-4 text-warning" />
            <AlertTitle>Atenção</AlertTitle>
            <AlertDescription className="space-y-1">
              {alertasMargem.length > 0 && (
                <div>
                  {alertasMargem.length} item(ns) com margem abaixo de {MARGEM_MINIMA}%.
                  {!isAdmin && <span className="ml-1 inline-flex items-center gap-1 text-xs"><Lock className="size-3" /> bloqueado para salvar</span>}
                </div>
              )}
              {alertasSemCusto.length > 0 && (
                <div>{alertasSemCusto.length} item(ns) marcados para disputa sem custo preenchido.</div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens — clique para ativar/desativar disputa</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Disputa</TableHead>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[60px]">Un</TableHead>
                  <TableHead className="w-[80px] text-right">Qtd</TableHead>
                  <TableHead className="w-[140px] text-right">Custo unit.</TableHead>
                  <TableHead className="w-[120px]">Modo preço</TableHead>
                  <TableHead className="w-[140px] text-right">Venda unit. / Margem</TableHead>
                  <TableHead className="w-[100px] text-right">Margem real</TableHead>
                  <TableHead className="w-[60px]">Venceu?</TableHead>
                  <TableHead className="w-[140px] text-right">Preço Homologado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const venda = calcVenda(it);
                  const margem = calcMargem(it);
                  const lucro = (venda - it.custo_unitario) * it.quantidade;
                  const baixa = it.disputar && margem > 0 && margem < MARGEM_MINIMA;
                  const semCusto = it.disputar && it.custo_unitario <= 0;
                  return (
                    <TableRow key={it.id} className={!it.disputar ? "opacity-50" : baixa ? "bg-warning/5" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={it.disputar}
                          onCheckedChange={(v) => patch(it.id, { disputar: !!v })}
                        />
                      </TableCell>
                      <TableCell>{it.item_number}</TableCell>
                      <TableCell>
                        <div className="text-sm">{it.descricao}</div>
                        {it.needs_review && <Badge variant="warning" className="mt-1 text-[10px]">revisar</Badge>}
                        {it.best_supplier_cost > 0 && it.custo_unitario === it.best_supplier_cost && (
                          <Badge variant="secondary" className="mt-1 ml-1 text-[10px]">custo da menor cotação</Badge>
                        )}
                      </TableCell>
                      <TableCell>{it.unidade}</TableCell>
                      <TableCell className="text-right">{it.quantidade}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" step="0.01" min={0}
                          value={it.custo_unitario || ""}
                          onChange={(e) => patch(it.id, { custo_unitario: parseFloat(e.target.value) || 0 })}
                          className={`h-8 text-right ${semCusto ? "border-destructive" : ""}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Tabs value={it.preco_modo} onValueChange={(v) => patch(it.id, { preco_modo: v as "margem" | "preco" })}>
                          <TabsList className="h-7">
                            <TabsTrigger value="margem" className="h-6 text-xs px-2">%</TabsTrigger>
                            <TabsTrigger value="preco" className="h-6 text-xs px-2">R$</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </TableCell>
                      <TableCell className="text-right">
                        {it.preco_modo === "margem" ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number" step="0.1" min={0}
                              value={it.margin_pct}
                              onChange={(e) => patch(it.id, { margin_pct: parseFloat(e.target.value) || 0 })}
                              className="h-8 w-20 text-right"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        ) : (
                          <Input
                            type="number" step="0.01" min={0}
                            value={it.preco_venda_manual || ""}
                            onChange={(e) => patch(it.id, { preco_venda_manual: parseFloat(e.target.value) || 0 })}
                            className="h-8 text-right"
                          />
                        )}
                        <div className="text-[11px] text-muted-foreground mt-0.5">venda: {brl(venda)}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={baixa ? "warning" : margem >= MARGEM_MINIMA ? "success" : "outline"}>
                          {pct(margem)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Checkbox
                          checked={it.venceu}
                          onCheckedChange={(v) => patch(it.id, { venceu: !!v, preco_homologado: v ? (it.preco_homologado || venda) : 0 })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" step="0.01" min={0}
                          disabled={!it.venceu}
                          value={it.preco_homologado || ""}
                          onChange={(e) => patch(it.id, { preco_homologado: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-right"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ResumoCard({
  label, value, accent, icon,
}: { label: string; value: string; accent?: "success" | "warning" | "destructive"; icon?: React.ReactNode }) {
  const color =
    accent === "success" ? "text-success"
    : accent === "warning" ? "text-warning"
    : accent === "destructive" ? "text-destructive"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
        <div className={`text-lg font-semibold mt-1 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
