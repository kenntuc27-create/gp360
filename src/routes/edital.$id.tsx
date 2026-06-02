import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, FileSpreadsheet, FileDown, Save, AlertCircle, Loader2, Sparkles, Trophy } from "lucide-react";
import { exportXlsx, exportPdf } from "@/lib/exporters";
import { toast } from "sonner";
import { SupplierResponses } from "@/components/SupplierResponses";
import { PurchaseOrders } from "@/components/PurchaseOrders";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/edital/$id")({ component: EditalDetail });

interface Bid {
  id: string; orgao: string; processo: string; objeto: string; modalidade: string;
  data_abertura: string; prazo_entrega: string; local_entrega: string; status: string;
  uasg?: string;
  data_inicio_propostas?: string;
  data_encerramento_propostas?: string;
  data_limite_entrega?: string;
  tipo_cotacao: "empreendimentos" | "medicamentos";
  source_file_url?: string | null;
}
interface Item {
  id: string; item_number: number; descricao: string; unidade: string; quantidade: number;
  marca: string; valor_unitario: number; prazo: string; observacao: string; needs_review: boolean;
  extraction_page?: number;
  extraction_score?: number;
}

function EditalDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [bid, setBid] = useState<Bid | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: b }, { data: its }] = await Promise.all([
      supabase.from("bids").select("*").eq("id", id).single(),
      supabase.from("bid_items").select("*").eq("bid_id", id),
    ]);
    setBid(b as Bid);
    const list = ((its as Item[]) || []).sort((a, b) => {
      const na = Number(a.item_number) || 0;
      const nb = Number(b.item_number) || 0;
      return na - nb;
    });
    setItems(list);
    setLoading(false);
  }

  function patchBid<K extends keyof Bid>(k: K, v: Bid[K]) {
    setBid((p) => p ? { ...p, [k]: v } : p);
  }
  function itemNumberAt(it: Item, idx: number) {
    const n = Number(it.item_number);
    return Number.isFinite(n) && n > 0 ? n : idx + 1;
  }

  function patchItem(i: number, k: keyof Item, v: Item[keyof Item]) {
    setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  }
  function addItem() {
    const next = items.reduce((max, it, idx) => Math.max(max, itemNumberAt(it, idx)), 0) + 1;
    setItems((arr) => [...arr, {
      id: `tmp-${Date.now()}`, item_number: next, descricao: "", unidade: "UN",
      quantidade: 1, marca: "", valor_unitario: 0, prazo: "", observacao: "", needs_review: false,
    }]);
  }
  function removeItem(i: number) {
    let removed: typeof items[number] | undefined;
    setItems((arr) => {
      removed = arr[i];
      return arr.filter((_, idx) => idx !== i);
    });
    toast.success(`Item ${removed?.item_number ?? i + 1} removido`, {
      action: {
        label: "Desfazer",
        onClick: () => {
          if (!removed) return;
          setItems((arr) => {
            const next = [...arr];
            next.splice(i, 0, removed!);
            return next;
          });
        },
      },
    });
  }

  async function save() {
    if (!bid) return;
    setSaving(true);
    try {
      await supabase.from("bids").update({
        orgao: bid.orgao, uasg: bid.uasg || "", processo: bid.processo, objeto: bid.objeto, modalidade: bid.modalidade,
        data_abertura: bid.data_abertura,
        data_inicio_propostas: bid.data_inicio_propostas || "",
        data_encerramento_propostas: bid.data_encerramento_propostas || "",
        data_limite_entrega: bid.data_limite_entrega || "",
        prazo_entrega: bid.prazo_entrega, local_entrega: bid.local_entrega,
        tipo_cotacao: bid.tipo_cotacao || "empreendimentos",
      }).eq("id", id);

      // Estratégia: diff (update existentes, insert novos, delete removidos)
      // Preserva IDs para não quebrar bid_supplier_item_prices.bid_item_id
      const { data: currentRows } = await supabase
        .from("bid_items").select("id").eq("bid_id", id);
      const currentIds = new Set((currentRows || []).map((r) => r.id));
      const keptIds = new Set(items.filter((it) => !it.id.startsWith("tmp-")).map((it) => it.id));
      const toDelete = [...currentIds].filter((cid) => !keptIds.has(cid));
      if (toDelete.length > 0) {
        // Remover preços de fornecedores vinculados a itens removidos (sem FK cascade)
        await supabase.from("bid_supplier_item_prices").delete().in("bid_item_id", toDelete);
        await supabase.from("bid_items").delete().in("id", toDelete);
      }
      const toInsert = items.filter((it) => it.id.startsWith("tmp-"));
      const toUpdate = items.filter((it) => !it.id.startsWith("tmp-"));
      for (let i = 0; i < toUpdate.length; i++) {
        const it = toUpdate[i];
        const idx = items.indexOf(it);
        await supabase.from("bid_items").update({
          item_number: itemNumberAt(it, idx),
          descricao: it.descricao,
          unidade: it.unidade || "UN",
          quantidade: Number(it.quantidade) || 0,
          marca: it.marca,
          valor_unitario: Number(it.valor_unitario) || 0,
          prazo: it.prazo,
          observacao: it.observacao,
          needs_review: it.needs_review,
        }).eq("id", it.id);
      }
      if (toInsert.length > 0) {
        await supabase.from("bid_items").insert(toInsert.map((it) => ({
          bid_id: id,
          item_number: itemNumberAt(it, items.indexOf(it)),
          descricao: it.descricao,
          unidade: it.unidade || "UN",
          quantidade: Number(it.quantidade) || 0,
          marca: it.marca,
          valor_unitario: Number(it.valor_unitario) || 0,
          prazo: it.prazo,
          observacao: it.observacao,
          needs_review: it.needs_review,
        })));
      }
      toast.success("Cotação salva");
      await load();
    } catch (e) {
      console.error(e); toast.error("Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function generate(kind: "xlsx" | "pdf") {
    if (!bid) return;
    try {
      await save();
      const { data: c } = await supabase.from("company_settings").select("*").limit(1).single();
      const company = {
        company_name: c?.company_name || "Minha Empresa",
        phone: c?.phone || "",
        email: c?.email || "",
        city: c?.city || "",
        logo_url: c?.logo_url || "",
        primary_color: c?.primary_color || "#0F3460",
        proposal_validity_days: c?.proposal_validity_days || 10,
      };
      const exp = items.map((it, i) => ({
        item_number: itemNumberAt(it, i), descricao: it.descricao, unidade: it.unidade,
        quantidade: Number(it.quantidade) || 0, marca: it.marca,
        valor_unitario: Number(it.valor_unitario) || 0, prazo: it.prazo, observacao: it.observacao,
      }));
      console.log(`[generate] Iniciando ${kind}`, { itens: exp.length, bid });
      if (kind === "xlsx") await exportXlsx(bid, exp, company);
      else await exportPdf(bid, exp, company);
      await supabase.from("bids").update({ status: "gerada" }).eq("id", id);
      toast.success(`${kind.toUpperCase()} gerado`);
    } catch (e) {
      console.error("[generate] Falha ao gerar arquivo:", e);
      toast.error(`Erro ao gerar ${kind.toUpperCase()}: ${(e as Error)?.message || "verifique o console"}`);
    }
  }

  async function deleteBid() {
    if (!confirm("Excluir esta cotação? Todos os itens, respostas de fornecedores e arquivos vinculados serão removidos.")) return;
    try {
      // Buscar respostas de fornecedores para limpar arquivos e preços
      const { data: resps } = await supabase
        .from("bid_supplier_responses")
        .select("id, source_file_url")
        .eq("bid_id", id);
      const respIds = (resps || []).map((r) => r.id);

      if (respIds.length > 0) {
        await supabase.from("bid_supplier_item_prices").delete().in("response_id", respIds);
        const files = (resps || []).map((r) => r.source_file_url).filter((u): u is string => !!u);
        if (files.length > 0) {
          await supabase.storage.from("supplier-quotes").remove(files);
        }
        await supabase.from("bid_supplier_responses").delete().eq("bid_id", id);
      }

      await supabase.from("bid_items").delete().eq("bid_id", id);

      // Remover arquivo do edital se houver
      if (bid?.source_file_url) {
        try { await supabase.storage.from("editais").remove([bid.source_file_url]); } catch {}
      }

      const { error } = await supabase.from("bids").delete().eq("id", id);
      if (error) throw error;
      toast.success("Cotação excluída");
      navigate({ to: "/historico" });
    } catch (e) {
      console.error("[deleteBid]", e);
      toast.error("Erro ao excluir cotação");
    }
  }

  if (loading || !bid) return <AppShell title="Carregando…"><div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" /></div></AppShell>;

  const reviewCount = items.filter((i) => i.needs_review).length;

  return (
    <AppShell title="Revisão da Cotação" actions={
      <div className="flex gap-2 flex-wrap">
        <Button asChild variant="default" className="bg-primary">
          <Link to="/edital/$id/disputa" params={{ id: bid.id }}>
            <Trophy className="size-4 mr-2" />Registrar Resultado (Visão da Juliana)
          </Link>
        </Button>
        <Button variant="outline" onClick={save} disabled={saving}><Save className="size-4 mr-2" />Salvar</Button>
        <Button variant="outline" asChild>
          <Link to="/edital/$id/pos-entrega" params={{ id }}>
            <FileDown className="size-4 mr-2" />Pós-Entrega
          </Link>
        </Button>
        <Button variant="outline" onClick={() => generate("pdf")}><FileDown className="size-4 mr-2" />PDF</Button>
        <Button onClick={() => generate("xlsx")}><FileSpreadsheet className="size-4 mr-2" />Excel</Button>
      </div>
    }>
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">Dados do Edital</CardTitle>
              {(bid as { extraction_method?: string }).extraction_method && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  (bid as { extraction_method?: string }).extraction_method === "ia_fallback"
                    ? "bg-warning/10 text-warning border-warning/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  {(bid as { extraction_method?: string }).extraction_method === "ia_fallback" ? "IA (fallback)" : "Híbrido"}
                  {typeof (bid as { extraction_score?: number }).extraction_score === "number" && (
                    <> · score {Math.round((bid as { extraction_score?: number }).extraction_score!)}</>
                  )}
                </span>
              )}
              {reviewCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">
                  {reviewCount} {reviewCount === 1 ? "item para revisar" : "itens para revisar"}
                </span>
              )}
            </div>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={deleteBid} className="text-destructive"><Trash2 className="size-4 mr-1" />Excluir</Button>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <Label>Tipo de Cotação</Label>
              <div className="flex gap-2 mt-1">
                {([
                  { v: "empreendimentos", label: "Pará Empreendimentos" },
                  { v: "medicamentos", label: "Pará Medicamentos" },
                ] as const).map((opt) => {
                  const active = (bid.tipo_cotacao || "empreendimentos") === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => patchBid("tipo_cotacao", opt.v)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-md border text-sm transition-colors ${
                        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"
                      }`}
                    >
                      <img src={opt.v === "medicamentos" ? "/logo-medicamentos.png" : "/logo-empreendimentos.png"} alt="" className="h-6 object-contain bg-white rounded px-1" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div><Label>Órgão</Label><Input value={bid.orgao || ""} onChange={(e) => patchBid("orgao", e.target.value)} /></div>
            <div><Label>UASG / Unidade Compradora</Label><Input value={bid.uasg || ""} onChange={(e) => patchBid("uasg", e.target.value)} placeholder="Ex.: 925410" /></div>
            <div><Label>Processo</Label><Input value={bid.processo || ""} onChange={(e) => patchBid("processo", e.target.value)} /></div>
            <div><Label>Modalidade</Label><Input value={bid.modalidade || ""} onChange={(e) => patchBid("modalidade", e.target.value)} /></div>
            <div className="md:col-span-3"><Label>Objeto</Label><Textarea rows={2} value={bid.objeto || ""} onChange={(e) => patchBid("objeto", e.target.value)} /></div>
            <div><Label>Data de Abertura</Label><Input value={bid.data_abertura || ""} onChange={(e) => patchBid("data_abertura", e.target.value)} placeholder="DD/MM/AAAA" /></div>
            <div><Label>Início das Propostas</Label><Input value={bid.data_inicio_propostas || ""} onChange={(e) => patchBid("data_inicio_propostas", e.target.value)} placeholder="DD/MM/AAAA HH:mm" /></div>
            <div><Label>Encerramento das Propostas</Label><Input value={bid.data_encerramento_propostas || ""} onChange={(e) => patchBid("data_encerramento_propostas", e.target.value)} placeholder="DD/MM/AAAA HH:mm" /></div>
            <div><Label>Data Limite de Entrega</Label><Input value={bid.data_limite_entrega || ""} onChange={(e) => patchBid("data_limite_entrega", e.target.value)} placeholder="DD/MM/AAAA ou descrição" /></div>
            <div><Label>Prazo de Entrega</Label><Input value={bid.prazo_entrega || ""} onChange={(e) => patchBid("prazo_entrega", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Local de Entrega</Label><Input value={bid.local_entrega || ""} onChange={(e) => patchBid("local_entrega", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-base">Itens ({items.length})</CardTitle>
              {reviewCount > 0 && <Badge variant="outline" className="text-warning border-warning"><AlertCircle className="size-3 mr-1" />{reviewCount} para revisar</Badge>}
              <Badge variant="secondary" className="text-sm">
                Total: {(items.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={addItem}><Plus className="size-4 mr-1" />Adicionar</Button>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 1280 }}>
                <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left w-16 min-w-[64px]">#</th>
                    <th className="px-3 py-2 text-left min-w-[360px]">Descrição</th>
                    <th className="px-3 py-2 text-left w-24 min-w-[88px]">Un.</th>
                    <th className="px-3 py-2 text-right w-24 min-w-[88px]">Qtd.</th>
                    <th className="px-3 py-2 text-left w-32 min-w-[120px]">Marca</th>
                    <th className="px-3 py-2 text-right w-32 min-w-[120px]">V. Unit.</th>
                    <th className="px-3 py-2 text-right w-32 min-w-[120px]">Total</th>
                    <th className="px-3 py-2 text-left w-28 min-w-[112px]">Prazo</th>
                    <th className="px-3 py-2 text-left w-40 min-w-[160px]">Observação</th>
                    <th className="w-10 min-w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.id} className={`border-t ${it.needs_review ? "bg-warning/5" : ""}`}>
                      <td className="px-2 py-1 w-16 min-w-[64px] relative">
                        <Input className="h-8 text-center px-1 w-full" type="number" min={1} value={itemNumberAt(it, i)} onChange={(e) => patchItem(i, "item_number", Number(e.target.value))} />
                        {it.extraction_page && (
                          <div className="absolute -top-1 -left-1 text-[8px] px-1 bg-muted border rounded opacity-60 pointer-events-none" title={`Extraído da página ${it.extraction_page}`}>
                            p.{it.extraction_page}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 min-w-[360px]"><Input className="h-8 w-full" value={it.descricao} title={it.descricao} onChange={(e) => patchItem(i, "descricao", e.target.value)} /></td>
                      <td className="px-2 py-1 min-w-[88px]"><Input className="h-8 w-full" value={it.unidade} onChange={(e) => patchItem(i, "unidade", e.target.value)} /></td>
                      <td className="px-2 py-1 min-w-[88px]"><Input className="h-8 text-right w-full" type="number" value={it.quantidade} onChange={(e) => patchItem(i, "quantidade", Number(e.target.value))} /></td>
                      <td className="px-2 py-1 min-w-[120px]"><Input className="h-8 w-full" value={it.marca} onChange={(e) => patchItem(i, "marca", e.target.value)} /></td>
                      <td className="px-2 py-1 min-w-[120px]"><Input className="h-8 text-right w-full" type="number" step="0.01" value={it.valor_unitario} onChange={(e) => patchItem(i, "valor_unitario", Number(e.target.value))} /></td>
                      <td className="px-2 py-1 text-right tabular-nums font-medium min-w-[120px]">{((Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                      <td className="px-2 py-1 min-w-[112px]"><Input className="h-8 w-full" value={it.prazo} onChange={(e) => patchItem(i, "prazo", e.target.value)} /></td>
                      <td className="px-2 py-1 min-w-[160px]"><Input className="h-8 w-full" value={it.observacao} onChange={(e) => patchItem(i, "observacao", e.target.value)} /></td>
                      <td className="px-1 py-1"><Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="size-4 text-destructive" /></Button></td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">Nenhum item. Clique em "Adicionar".</td></tr>
                  )}
                </tbody>
                {items.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/40 font-semibold">
                      <td colSpan={6} className="px-3 py-2 text-right">Total geral</td>
                      <td className="px-2 py-2 text-right tabular-nums">{(items.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        <SupplierResponses bidId={id} items={items.filter((i) => !i.id.startsWith("tmp-"))} />

        <PurchaseOrders bidId={id} items={items.filter((i) => !i.id.startsWith("tmp-"))} />
      </div>
    </AppShell>
  );
}
