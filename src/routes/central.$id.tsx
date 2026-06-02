import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FileSpreadsheet, Plus, Trash2, Send, Sparkles, FileDown, Loader2, Eye, ArrowRight, ArrowLeft, Trophy, ClipboardCheck, RefreshCw, FileUp, Wand2, MessageCircle, Mail, Copy, Lock, CheckCircle2, XCircle, Clock, Ban, Phone, Mail as MailIcon, Globe, MapPin, User, Building, Calculator, TrendingUp, DollarSign, ShieldCheck } from "lucide-react";
import { fmtBRL } from "@/lib/format";
import { importItemsFromExcel } from "@/lib/importItems";
import { extractTextFromFile } from "@/lib/parseDocs";
import { organizarItensIA } from "@/lib/organize.functions";
import { sugerirFornecedoresIA, sugerirMargensIA, analisarRiscoIA } from "@/lib/aiAssist.functions";
import { useServerFn } from "@tanstack/react-start";
import { exportProposalCatalogPdf } from "@/lib/proposalPdf";
import { exportProposalWithCatalogPdf } from "@/lib/proposalCatalogPdf";
import { exportApprovalXlsx } from "@/lib/approvalXlsx";
import { exportClovisXlsx } from "@/lib/clovisXlsx";
import { exportSupplierQuoteXlsx, shareSupplierQuote, buildSupplierMessage, buildWhatsAppUrl, copyToClipboard, openWhatsApp } from "@/lib/supplierQuoteXlsx";
import { QuickActionsBar, type QuickAction } from "@/components/QuickActionsBar";
import { PurchaseOrders } from "@/components/PurchaseOrders";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// Componentes Refatorados para Escalabilidade
import { BidHeaderData } from "@/components/bid/BidHeaderData";
import { BidMiniStats } from "@/components/bid/BidMiniStats";
import { NavSteps } from "@/components/bid/NavSteps";
import { SupplierPicker } from "@/components/bid/SupplierPicker";
import { StatCard } from "@/components/bid/StatCard";
import { BidTimeline } from "@/components/bid/BidTimeline";


export const Route = createFileRoute("/central/$id")({ component: CentralWizard });

interface Bid {
  id: string; orgao: string; processo: string; objeto: string;
  tipo_cotacao: "empreendimentos" | "medicamentos"; status: string;
  modalidade?: string; data_abertura?: string;
  uasg?: string;
  secretaria?: string;
  tipo_disputa?: string;
  criterio_julgamento?: string;
  portal_disputa?: string;
  cidade_uf?: string;
  contato_responsavel?: string;
  telefone_contato?: string;
  email_contato?: string;
  valor_total_estimado?: number;
  data_inicio_propostas?: string;
  data_encerramento_propostas?: string;
  data_limite_entrega?: string;
  prazo_entrega?: string; local_entrega?: string;
  resultado?: string | null;
  resultado_motivo?: string | null;
  finalizada_em?: string | null;
  segment_id?: string | null;
  total_estimated?: number;
  total_quoted?: number;
  total_dispute?: number;
  total_homologated?: number;
  total_profit_real?: number;
  total_margin_real_pct?: number;
}
interface Item {
  id: string; item_number: number; descricao: string; unidade: string; quantidade: number;
  marca: string; modelo: string; margin_pct: number; chosen_response_id: string | null; chosen_manual: boolean;
  categoria?: string;
  estimated_value?: number;
  quoted_value?: number;
  dispute_value?: number;
  homologated_value?: number;
  invoiced_value?: number;
  received_value?: number;
  profit_value?: number;
  profit_margin_pct?: number;
  venceu?: boolean;
  lote?: string;
  me_epp?: boolean;
  catmat?: string;
}

interface Supplier { 
  id: string; razao_social: string; segmento: string; tipo: string; whatsapp: string; email: string;
  segment_id?: string;
}
interface Response {
  id: string;
  supplier_id: string;
  observations: string;
  global_discount_type?: string;
  global_discount_value?: number;
  freight_value?: number;
}
interface Price {
  id: string; response_id: string; bid_item_id: string;
  valor_unitario: number; frete_unitario: number; imposto_pct: number;
  marca: string;
  supplier_discount_type?: string;
  supplier_discount_value?: number;
}


const STEPS = [
  { id: "itens", label: "1. Itens" },
  { id: "fornecedores", label: "2. Fornecedores" },
  { id: "envio", label: "3. Envio" },
  { id: "cotacoes", label: "4. Cotações" },
  { id: "planilha", label: "5. Planilha" },
  { id: "proposta", label: "6. Proposta" },
  { id: "finalizacao", label: "7. Finalização" },
];

type ResultadoStatus = "pendente" | "ganha" | "perdida" | "cancelada";

function CentralWizard() {
  const { id } = Route.useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [bid, setBid] = useState<Bid | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<string>("itens");
  const [savingResultado, setSavingResultado] = useState(false);
  const [resultadoMotivo, setResultadoMotivo] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
  const [defaultMargin, setDefaultMargin] = useState(30);
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSupplierId, setAiSupplierId] = useState("");
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStep, setAiStep] = useState("");

  // Modo IA — organização de itens (etapa 1)
  const organizarFn = useServerFn(organizarItensIA);
  const sugerirFornFn = useServerFn(sugerirFornecedoresIA);
  const sugerirMargensFn = useServerFn(sugerirMargensIA);
  const analisarRiscoFn = useServerFn(analisarRiscoIA);
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgBusy, setOrgBusy] = useState(false);
  type OrgSuggestion = { id: string; descricao_padronizada: string; unidade_padronizada: string; categoria: string; duplicado_de_id: string | null };
  const [orgSuggestions, setOrgSuggestions] = useState<OrgSuggestion[]>([]);
  const [orgApply, setOrgApply] = useState<Record<string, { desc: boolean; un: boolean; cat: boolean }>>({});
  const [orgRemoveDup, setOrgRemoveDup] = useState<Record<string, boolean>>({});

  // IA — sugerir fornecedores (etapa 2)
  type SupSuggestion = { fornecedor_id: string; score: number; motivo: string; categorias_atendidas?: string[] };
  const [supAiOpen, setSupAiOpen] = useState(false);
  const [supAiBusy, setSupAiBusy] = useState(false);
  const [supAiResults, setSupAiResults] = useState<SupSuggestion[]>([]);

  // IA — sugerir margens (etapa 5)
  type MargemSuggestion = { id: string; margem_sugerida: number; motivo: string; risco: "baixo"|"medio"|"alto" };
  const [margAiOpen, setMargAiOpen] = useState(false);
  const [margAiBusy, setMargAiBusy] = useState(false);
  const [margAiResults, setMargAiResults] = useState<MargemSuggestion[]>([]);
  const [margAiApply, setMargAiApply] = useState<Record<string, boolean>>({});

  // IA — análise de risco (etapa 6)
  type RiskResult = { chance_vitoria: number; nivel_risco: "baixo"|"medio"|"alto"; resumo: string; pontos_fortes: string[]; pontos_atencao: string[]; recomendacoes: string[] };
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskBusy, setRiskBusy] = useState(false);
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null);

  async function rodarSugestaoFornecedores() {
    if (items.length === 0) { toast.error("Sem itens"); return; }
    if (suppliers.length === 0) { toast.error("Sem fornecedores cadastrados"); return; }
    setSupAiBusy(true);
    setSupAiOpen(true);
    try {
      const res = await sugerirFornFn({ data: {
        itens: items.map(i => ({ id: i.id, descricao: i.descricao, categoria: i.categoria || "" })),
        fornecedores: suppliers.map(s => ({ id: s.id, razao_social: s.razao_social, segmento: s.segmento || "", tipo: s.tipo || "" })),
      } });
      if (!res.ok) { toast.error(res.error || "Falha"); setSupAiResults([]); return; }
      const sorted = [...res.sugestoes].sort((a, b) => b.score - a.score);
      setSupAiResults(sorted);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSupAiBusy(false); }
  }

  function aplicarSugestaoFornecedores() {
    setSelectedSuppliers(prev => {
      const n = new Set(prev);
      supAiResults.filter(s => s.score >= 60).forEach(s => n.add(s.fornecedor_id));
      return n;
    });
    toast.success("Fornecedores sugeridos selecionados");
    setSupAiOpen(false);
  }

  async function rodarSugestaoMargens() {
    if (items.length === 0) { toast.error("Sem itens"); return; }
    setMargAiBusy(true);
    setMargAiOpen(true);
    try {
      const itensPayload = totals.rows.map(r => {
        const concorrentes = responses.filter(rsp => {
          const p = priceFor(r.it.id, rsp.id);
          return p && p.valor_unitario > 0;
        });
        const precos = concorrentes.map(rsp => custoTotal(priceFor(r.it.id, rsp.id))).filter(v => v > 0);
        return {
          id: r.it.id,
          descricao: r.it.descricao,
          categoria: r.it.categoria || "",
          quantidade: Number(r.it.quantidade) || 1,
          quoted_value: r.custo,
          margem_atual: Number(r.it.margin_pct) || 30,
          num_concorrentes: concorrentes.length,
          menor_preco_concorrente: precos.length ? Math.min(...precos) : 0,
        };
      });
      const res = await sugerirMargensFn({ data: { itens: itensPayload, contexto: { orgao: bid?.orgao || "", modalidade: "" } } });
      if (!res.ok) { toast.error(res.error || "Falha"); setMargAiResults([]); return; }
      setMargAiResults(res.itens);
      const apply: Record<string, boolean> = {};
      res.itens.forEach(m => { apply[m.id] = true; });
      setMargAiApply(apply);
    } catch (e) { toast.error((e as Error).message); }
    finally { setMargAiBusy(false); }
  }

  async function aplicarMargensIA() {
    setMargAiBusy(true);
    try {
      for (const m of margAiResults) {
        if (!margAiApply[m.id]) continue;
        await supabase.from("bid_items").update({ margin_pct: m.margem_sugerida }).eq("id", m.id);
      }
      toast.success("Margens aplicadas");
      setMargAiOpen(false);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setMargAiBusy(false); }
  }

  async function rodarAnaliseRisco() {
    if (items.length === 0) { toast.error("Sem itens"); return; }
    setRiskBusy(true);
    setRiskOpen(true);
    setRiskResult(null);
    try {
      const itensAlerta = totals.rows
        .filter(r => r.custo > 0 && (r.it.margin_pct < 10 || r.it.margin_pct > 60))
        .slice(0, 30)
        .map(r => ({ item_number: r.it.item_number, descricao: r.it.descricao, margem: Number(r.it.margin_pct) || 0, custo: r.custo, final: r.final }));
      const semCotacao = items.filter(it => !bestResponseFor(it.id)).length;
      const res = await analisarRiscoFn({ data: {
        bid: { orgao: bid?.orgao || "", objeto: bid?.objeto || "", modalidade: "" },
        resumo: {
          total_itens: items.length,
          custo_total: totals.totalCusto,
          preco_total: totals.totalFinal,
          lucro_estimado: totals.lucro,
          margem_media: totals.margemMedia,
          fornecedores_cotados: responses.length,
          itens_sem_cotacao: semCotacao,
        },
        itens_alerta: itensAlerta,
      } });
      if (!res.ok) { toast.error(res.error || "Falha"); return; }
      setRiskResult(res);
    } catch (e) { toast.error((e as Error).message); }
    finally { setRiskBusy(false); }
  }


  async function rodarOrganizacaoIA() {
    if (items.length === 0) { toast.error("Sem itens para organizar"); return; }
    setOrgBusy(true);
    try {
      const payload = items.map((it) => ({
        id: it.id,
        item_number: it.item_number,
        descricao: it.descricao,
        unidade: it.unidade,
        quantidade: it.quantidade,
      }));
      const res = await organizarFn({ data: { items: payload } });
      if (!res.ok) { toast.error(res.error || "Falha na IA"); return; }
      setOrgSuggestions(res.items);
      // Pré-seleciona aplicar quando houver mudança real
      const apply: Record<string, { desc: boolean; un: boolean; cat: boolean }> = {};
      const dup: Record<string, boolean> = {};
      for (const s of res.items) {
        const it = items.find((i) => i.id === s.id);
        if (!it) continue;
        apply[s.id] = {
          desc: !!s.descricao_padronizada && s.descricao_padronizada.trim() !== (it.descricao || "").trim(),
          un: !!s.unidade_padronizada && s.unidade_padronizada.trim().toUpperCase() !== (it.unidade || "").trim().toUpperCase(),
          cat: !!s.categoria && s.categoria.trim() !== (it.categoria || "").trim(),
        };
        if (s.duplicado_de_id) dup[s.id] = true;
      }
      setOrgApply(apply);
      setOrgRemoveDup(dup);
      setOrgOpen(true);
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setOrgBusy(false);
    }
  }

  async function aplicarOrganizacao() {
    setOrgBusy(true);
    try {
      // Atualiza individuais
      for (const s of orgSuggestions) {
        const flags = orgApply[s.id];
        if (!flags) continue;
        const patch: Record<string, string> = {};
        if (flags.desc && s.descricao_padronizada) patch.descricao = s.descricao_padronizada;
        if (flags.un && s.unidade_padronizada) patch.unidade = s.unidade_padronizada.toUpperCase();
        if (flags.cat) patch.categoria = s.categoria || "";
        if (Object.keys(patch).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await supabase.from("bid_items").update(patch as any).eq("id", s.id);
        }
      }
      // Remove duplicados marcados
      const toRemove = orgSuggestions.filter((s) => s.duplicado_de_id && orgRemoveDup[s.id]).map((s) => s.id);
      if (toRemove.length > 0) {
        await supabase.from("bid_supplier_item_prices").delete().in("bid_item_id", toRemove);
        await supabase.from("bid_items").delete().in("id", toRemove);
      }
      toast.success("Itens organizados pela IA");
      setOrgOpen(false);
      setOrgSuggestions([]);
      await load();
    } catch (e) {
      toast.error(`Erro ao aplicar: ${(e as Error).message}`);
    } finally {
      setOrgBusy(false);
    }
  }

  async function load() {
    setLoading(true);
    const [{ data: b }, { data: its }, { data: sup }, { data: resps }] = await Promise.all([
      supabase.from("bids").select("*").eq("id", id).single(),
      supabase.from("bid_items").select("*").eq("bid_id", id).order("item_number"),
      supabase.from("suppliers").select("id, razao_social, segmento, tipo, whatsapp, email").order("razao_social"),
      supabase.from("bid_supplier_responses").select("id, supplier_id, observations, global_discount_type, global_discount_value, freight_value").eq("bid_id", id),
    ]);
    setBid(b as Bid);
    setResultadoMotivo((b as Bid)?.resultado_motivo || "");
    setItems((its as Item[]) || []);
    setSuppliers((sup as Supplier[]) || []);
    setResponses((resps as Response[]) || []);
    if (resps && resps.length > 0) {
      const ids = resps.map((r) => r.id);
      const { data: pr } = await supabase
        .from("bid_supplier_item_prices")
        .select("id, response_id, bid_item_id, valor_unitario, frete_unitario, imposto_pct, marca, supplier_discount_type, supplier_discount_value")
        .in("response_id", ids);
      setPrices((pr as Price[]) || []);
    } else {
      setPrices([]);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // ============== ETAPA 1: IMPORTAR EXCEL ==============
  async function onUploadExcel(f: File) {
    try {
      toast.loading("Importando planilha…", { id: "imp" });
      const parsed = await importItemsFromExcel(f);
      if (parsed.length === 0) { toast.error("Nenhum item identificado", { id: "imp" }); return; }
      const startNum = items.reduce((m, it) => Math.max(m, it.item_number), 0);
      const rows = parsed.map((p, i) => ({
        bid_id: id,
        item_number: startNum + i + 1,
        descricao: p.descricao, unidade: p.unidade, quantidade: p.quantidade,
        margin_pct: defaultMargin,
      }));
      const { error } = await supabase.from("bid_items").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} itens importados`, { id: "imp" });
      await load();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao importar planilha", { id: "imp" });
    }
  }
  async function addItem() {
    const n = items.reduce((m, it) => Math.max(m, it.item_number), 0) + 1;
    await supabase.from("bid_items").insert({ bid_id: id, item_number: n, descricao: "", unidade: "UN", quantidade: 1, margin_pct: defaultMargin });
    load();
  }
  async function patchItem(itemId: string, patch: Partial<Item>) {
    setItems((arr) => arr.map((it) => it.id === itemId ? { ...it, ...patch } : it));
    await supabase.from("bid_items").update(patch).eq("id", itemId);
  }
  async function patchResponse(resId: string, patch: Partial<Response>) {
    setResponses((arr) => arr.map((r) => r.id === resId ? { ...r, ...patch } : r));
    await supabase.from("bid_supplier_responses").update(patch).eq("id", resId);
  }
  async function removeItem(itemId: string) {
    if (!confirm("Excluir item?")) return;
    await supabase.from("bid_supplier_item_prices").delete().eq("bid_item_id", itemId);
    await supabase.from("bid_items").delete().eq("id", itemId);
    load();
  }
  async function applyDefaultMargin() {
    await supabase.from("bid_items").update({ margin_pct: defaultMargin }).eq("bid_id", id);
    toast.success(`Margem ${defaultMargin}% aplicada a todos`);
    load();
  }

  // ============== ETAPA 3: ENVIO ==============
  async function enviarSolicitacoes() {
    if (!bid) return;
    const list = [...selectedSuppliers];
    if (list.length === 0) { toast.error("Selecione fornecedores"); return; }
    if (items.length === 0) { toast.error("A cotação não tem itens"); return; }

    const tid = toast.loading("Gerando planilha e preparando envios...");
    try {
      // Cria response vazio para cada um (se ainda não existir)
      const existing = new Set(responses.map((r) => r.supplier_id));
      const novos = list.filter((sid) => !existing.has(sid));
      if (novos.length > 0) {
        await supabase.from("bid_supplier_responses").insert(
          novos.map((sid) => ({ bid_id: id, supplier_id: sid, observations: "Solicitação enviada — aguardando preços" }))
        );
      }

      // Gera Excel UMA vez (download local) + reaproveita o Blob para anexar via Web Share quando disponível
      const company = await getCompany();
      const exportItems = buildExportItems();
      const { blob, filename } = await exportSupplierQuoteXlsx(bid, exportItems, company, { download: true });
      const message = buildSupplierMessage(bid, company);

      const alvos = suppliers.filter((s) => list.includes(s.id));
      const navAny = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      let anexados = 0;
      let abertos = 0;

      for (const s of alvos) {
        const file = new File([blob], filename, { type: blob.type });
        // Tenta anexar de fato (mobile/desktop com suporte a Web Share Files)
        if (s.whatsapp && navAny.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              text: `${message}\n\nFornecedor: ${s.razao_social || ""}`,
              title: `Cotação — ${bid.processo || bid.orgao || ""}`,
            });
            anexados++;
            continue;
          } catch { /* usuário cancelou ou falhou — cai no fallback */ }
        }
        // Fallback: tenta abrir o app nativo do WhatsApp (whatsapp://) — evita web/api.whatsapp.com bloqueados
        if (s.whatsapp) {
          const fullMsg = `${message}\n\n📎 Anexe a planilha: ${filename} (já baixada no seu computador).`;
          await openWhatsApp(s.whatsapp, fullMsg);
          abertos++;
        }
      }

      toast.success(
        `${novos.length} solicitação(ões) registrada(s). ${anexados ? `${anexados} com Excel anexado. ` : ""}${abertos ? `${abertos} via WhatsApp Web (anexar manualmente o ${filename}).` : ""}`,
        { id: tid }
      );
      setSelectedSuppliers(new Set());
      setStep("cotacoes");
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Falha ao enviar: ${msg}`, { id: tid });
    }
  }

  // ============== ETAPA 4: PREÇOS MANUAIS ==============
  async function setPrice(responseId: string, itemId: string, field: keyof Price, value: number | string) {
    const existing = prices.find((p) => p.response_id === responseId && p.bid_item_id === itemId);
    const patch: Record<string, number | string> = { [field]: value };
    if (existing) {
      setPrices((arr) => arr.map((p) => p.id === existing.id ? { ...p, [field]: value } as Price : p));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from("bid_supplier_item_prices").update(patch as any).eq("id", existing.id);
    } else {
      const insert: Record<string, number | string> = { response_id: responseId, bid_item_id: itemId, [field]: value };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await supabase.from("bid_supplier_item_prices").insert(insert as any).select().single();
      if (data) setPrices((arr) => [...arr, data as Price]);
    }
  }
  async function removeResponse(rid: string) {
    if (!confirm("Remover este fornecedor da cotação?")) return;
    await supabase.from("bid_supplier_item_prices").delete().eq("response_id", rid);
    await supabase.from("bid_supplier_responses").delete().eq("id", rid);
    load();
  }

  // ============== ETAPA 4: IMPORTAR COTAÇÃO POR IA (PDF/Excel) ==============
  async function importarCotacaoIA() {
    if (!aiSupplierId || !aiFile) { toast.error("Selecione fornecedor e arquivo"); return; }
    if (!items.length) { toast.error("A cotação não tem itens"); return; }
    setAiBusy(true);
    try {
      setAiStep("Lendo arquivo…");
      const rawText = await extractTextFromFile(aiFile);
      if (rawText.length < 20) throw new Error("Não consegui extrair texto do arquivo");

      setAiStep("Enviando arquivo…");
      const ext = aiFile.name.split(".").pop() || "bin";
      const path = `${id}/${aiSupplierId}/${Date.now()}.${ext}`;
      await supabase.storage.from("supplier-quotes").upload(path, aiFile);

      setAiStep("Preparando…");
      const { data: existing } = await supabase
        .from("bid_supplier_responses")
        .select("id").eq("bid_id", id).eq("supplier_id", aiSupplierId).maybeSingle();
      let responseId: string;
      if (existing?.id) {
        responseId = existing.id;
        await supabase.from("bid_supplier_responses").update({
          source_file_name: aiFile.name, source_file_url: path,
          extraction_status: "pending", extraction_progress: 0,
          extraction_total: items.length, extraction_error: "",
        }).eq("id", responseId);
      } else {
        const { data: created, error: cErr } = await supabase.from("bid_supplier_responses").insert({
          bid_id: id, supplier_id: aiSupplierId,
          source_file_name: aiFile.name, source_file_url: path,
          extraction_status: "pending", extraction_total: items.length,
        }).select("id").single();
        if (cErr) throw cErr;
        responseId = created!.id;
      }

      setAiStep("IA extraindo preços (em segundo plano)…");
      const itemsPayload = items.map((i) => ({
        id: i.id, item_number: i.item_number, descricao: i.descricao,
        unidade: i.unidade, quantidade: i.quantidade,
      }));
      const { data: aiRes, error: aiErr } = await supabase.functions.invoke("extract-supplier-quote", {
        body: { responseId, rawText, items: itemsPayload },
      });
      if (aiErr) throw aiErr;
      if ((aiRes as { error?: string })?.error) throw new Error((aiRes as { error: string }).error);

      // Polling — até 15 min
      const startedAt = Date.now();
      let lastP = -1;
      while (Date.now() - startedAt < 15 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data: st } = await supabase.from("bid_supplier_responses")
          .select("extraction_status, extraction_progress, extraction_total, extraction_error")
          .eq("id", responseId).maybeSingle();
        if (!st) continue;
        if (st.extraction_progress !== lastP) {
          lastP = st.extraction_progress || 0;
          setAiStep(`Extraindo: ${st.extraction_progress || 0}/${st.extraction_total || 0} itens…`);
        }
        if (st.extraction_status === "completed") break;
        if (st.extraction_status === "failed") throw new Error(st.extraction_error || "Falha");
      }

      const { count } = await supabase
        .from("bid_supplier_item_prices")
        .select("id", { count: "exact", head: true })
        .eq("response_id", responseId);
      toast.success(`Importado: ${count || 0} itens`);
      setAiOpen(false); setAiFile(null); setAiSupplierId("");
      await load();
    } catch (e) {
      console.error("[importarCotacaoIA]", e);
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setAiBusy(false); setAiStep("");
    }
  }

  // ============== ETAPA 5/6: CÁLCULOS ==============
  function priceFor(itemId: string, responseId: string): Price | undefined {
    return prices.find((p) => p.bid_item_id === itemId && p.response_id === responseId);
  }
  function custoTotal(p?: Price, respId?: string): number {
    if (!p) return 0;
    let v = Number(p.valor_unitario) || 0;
    
    // Desconto por item
    if (p.supplier_discount_value) {
      if (p.supplier_discount_type === "percentage") v = v * (1 - p.supplier_discount_value / 100);
      else v = Math.max(0, v - p.supplier_discount_value);
    }

    // Desconto Global (do Fornecedor/Resposta)
    const r = responses.find(res => res.id === (respId || p.response_id));
    if (r && r.global_discount_value) {
      if (r.global_discount_type === "percentage") v = v * (1 - r.global_discount_value / 100);
      else v = Math.max(0, v - (r.global_discount_value / items.length));
    }

    const f = Number(p.frete_unitario) || 0;
    const imp = (Number(p.imposto_pct) || 0) / 100;

    // Frete isolado do fornecedor (rateado por quantidade total)
    let freteRateado = 0;
    if (r && Number(r.freight_value) > 0) {
      const totalQtdResp = prices
        .filter(pp => pp.response_id === r.id && (Number(pp.valor_unitario) || 0) > 0)
        .reduce((sum, pp) => {
          const it = items.find(i => i.id === pp.bid_item_id);
          return sum + (Number(it?.quantidade) || 0);
        }, 0);
      if (totalQtdResp > 0) freteRateado = Number(r.freight_value) / totalQtdResp;
    }

    return v + f + freteRateado + (v * imp);
  }

  // sugestão = response com menor custo total
  function bestResponseFor(itemId: string): string | null {
    let bestId: string | null = null; let best = Infinity;
    for (const r of responses) {
      const p = priceFor(itemId, r.id);
      if (!p || !p.valor_unitario) continue;
      const c = custoTotal(p, r.id);
      if (c < best) { best = c; bestId = r.id; }
    }
    return bestId;
  }

  function resolveResponseForItem(item: Item): string | null {
    return item.chosen_response_id || bestResponseFor(item.id);
  }

  const derivedBidStatus = useMemo(() => {
    const hasImportedQuote = responses.length > 0;
    const hasQuotedPrices = prices.some((p) => (Number(p.valor_unitario) || 0) > 0);
    const hasProposal = bid?.status === "approved" || bid?.status === "gerada" || bid?.status === "finalizada";
    const hasWonItems = items.some((it) => !!it.venceu);
    const hasHomologated = items.some((it) => (Number(it.homologated_value) || 0) > 0);
    const hasInvoiced = items.some((it) => (Number(it.invoiced_value) || 0) > 0);
    const hasReceived = items.some((it) => (Number(it.received_value) || 0) > 0);

    if (bid?.status === "finalizada") {
      if (hasReceived) return "received";
      if (hasInvoiced) return "invoiced";
      if (hasHomologated) return "homologated";
      if (hasWonItems || bid?.resultado === "ganha") return "won";
      return "closed";
    }

    if (hasHomologated) return "homologated";
    if (hasWonItems || bid?.resultado === "ganha") return "won";
    if (hasProposal) return "approved";
    if (hasQuotedPrices) return "quoted";
    if (hasImportedQuote) return "pre_quoted";
    return "imported";
  }, [bid?.resultado, bid?.status, items, prices, responses]);

  async function autoChooseAll() {
    let count = 0;
    for (const it of items) {
      if (it.chosen_manual) continue;
      const best = bestResponseFor(it.id);
      if (best && best !== it.chosen_response_id) {
        await supabase.from("bid_items").update({ chosen_response_id: best, chosen_manual: false }).eq("id", it.id);
        count++;
      }
    }
    toast.success(`${count} fornecedores escolhidos automaticamente`);
    load();
  }

  async function chooseManual(itemId: string, responseId: string | null) {
    await supabase.from("bid_items").update({ chosen_response_id: responseId, chosen_manual: !!responseId }).eq("id", itemId);
    load();
  }

  // ============== TOTAIS - sempre calcula em tempo real a partir de items + prices ==============
  const totals = useMemo(() => {
    let totalCusto = 0, totalFinal = 0, lucro = 0, somaMargem = 0, n = 0, totalEdital = 0;
    const rows = items.map((it) => {
      const qtd = Number(it.quantidade) || 0;
      const editalUnit = Number(it.estimated_value) || 0;
      const totItemEdital = editalUnit * qtd;

      // Custo unitário: prioriza preço do fornecedor escolhido (chosen_response_id),
      // senão usa a melhor cotação disponível, depois quoted_value salvo no item, depois 0.
      let c = 0;
      const chosen = resolveResponseForItem(it);
      let selectedPrice: Price | undefined;
      if (chosen) {
        selectedPrice = priceFor(it.id, chosen);
        if (selectedPrice) c = custoTotal(selectedPrice, chosen);
      }
      if (!c) c = Number(it.quoted_value) || 0;

      const m = Number(it.margin_pct) || 0;
      const final = c * (1 + m / 100);
      const lucroItem = (final - c) * qtd;
      const totItemCusto = c * qtd;
      const totItemFinal = final * qtd;

      totalCusto += totItemCusto;
      totalFinal += totItemFinal;
      lucro += lucroItem;
      totalEdital += totItemEdital;
      somaMargem += m; n++;

      const supplier = chosen ? suppliers.find((s) => s.id === responses.find((r) => r.id === chosen)?.supplier_id) : null;
      return { it, chosen, p: selectedPrice, custo: c, final, lucroItem, totItemCusto, totItemFinal, editalUnit, totItemEdital, supplier };
    });
    return { rows, totalCusto, totalFinal, lucro, totalEdital, margemMedia: n ? somaMargem / n : 0 };
  }, [items, prices, suppliers, responses]);

  // ============== PROPOSTA PDF ==============
  async function gerarProposta() {
    if (!bid) return;
    const { data: c } = await supabase.from("company_settings").select("*").limit(1).single();
    const company = {
      company_name: c?.company_name || "Minha Empresa",
      phone: c?.phone || "", email: c?.email || "", city: c?.city || "",
      logo_url: c?.logo_url || "",
      primary_color: c?.primary_color || "#0F3460",
      proposal_validity_days: c?.proposal_validity_days || 10,
    };
    const rows = totals.rows.map((r) => ({
      item_number: r.it.item_number, descricao: r.it.descricao,
      marca: r.it.marca || "", modelo: r.it.modelo || "",
      unidade: r.it.unidade, quantidade: Number(r.it.quantidade) || 0,
      preco_final: r.final,
      estimated_value_edital: Number(r.it.estimated_value) || 0,
    }));
    await exportProposalCatalogPdf(bid, rows, company);
    await supabase.from("bids").update({ status: "approved" }).eq("id", id);
    toast.success("Proposta gerada");
  }

  async function gerarPropostaComCatalogo() {
    if (!bid) return;
    const rows = totals.rows.map((r) => ({
      item_number: r.it.item_number, descricao: r.it.descricao,
      marca: r.it.marca || "", modelo: r.it.modelo || "",
      unidade: r.it.unidade, quantidade: Number(r.it.quantidade) || 0,
      preco_final: r.final,
      estimated_value_edital: Number(r.it.estimated_value) || 0,
    }));
    const tid = toast.loading(`Gerando catálogo (0/${rows.length})…`, { duration: Infinity });
    try {
      await exportProposalWithCatalogPdf(bid, rows, (p) => {
        toast.loading(`Gerando catálogo (${p.current}/${p.total}) — ${p.item}`, { id: tid, duration: Infinity });
      });
      await supabase.from("bids").update({ status: "approved" }).eq("id", id);
      toast.success("Proposta com catálogo gerada", { id: tid });
    } catch (e: any) {
      console.error(e);
      toast.error(`Falha ao gerar catálogo: ${e?.message || e}`, { id: tid });
    }
  }


  async function getCompany() {
    const { data: c } = await supabase.from("company_settings").select("*").limit(1).single();
    return {
      company_name: c?.company_name || "Minha Empresa",
      phone: c?.phone || "", email: c?.email || "", city: c?.city || "",
      logo_url: c?.logo_url || "",
      primary_color: c?.primary_color || "#0F3460",
      proposal_validity_days: c?.proposal_validity_days || 10,
    };
  }

  function buildExportItems() {
    return items.map((it) => ({
      item_number: it.item_number,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: Number(it.quantidade) || 0,
      marca: it.marca || "",
    }));
  }

  async function exportarCotacaoFornecedor() {
    if (!bid) return;
    if (items.length === 0) { toast.error("Adicione itens antes de exportar."); return; }
    const tid = toast.loading("Gerando Excel da cotação...");
    try {
      const company = await getCompany();
      await exportSupplierQuoteXlsx(bid, buildExportItems(), company);
      toast.success("Excel da cotação gerado", { id: tid });
    } catch (e: any) {
      toast.error(`Falha: ${e?.message || e}`, { id: tid });
    }
  }

  async function enviarCotacaoFornecedor(channel: "whatsapp" | "email") {
    if (!bid) return;
    if (items.length === 0) { toast.error("Adicione itens antes de enviar."); return; }
    // Pega primeiro fornecedor selecionado, ou abre vazio
    const sup = suppliers.find((s) => selectedSuppliers.has(s.id));
    const company = await getCompany();
    await shareSupplierQuote(channel, { phone: sup?.whatsapp, email: sup?.email }, bid, buildExportItems(), company);
    toast.success(channel === "whatsapp" ? "Abrindo WhatsApp..." : "Abrindo e-mail...");
  }

  async function gerarAprovacao() {
    if (!bid) return;
    if (!totals?.rows || totals.rows.length === 0) {
      toast.error("Nenhum item com preço para gerar a planilha de aprovação.");
      return;
    }
    const tid = toast.loading("Gerando planilha de aprovação...");
    try {
      const company = await getCompany();
      const rows = totals.rows.map((row: any) => ({
        item_number: row.it.item_number,
        descricao: row.it.descricao,
        unidade: row.it.unidade,
        quantidade: Number(row.it.quantidade) || 0,
        marca: row.p?.marca || row.it.marca || "",
        modelo: row.it.modelo || "",
        supplier: row.supplier?.razao_social || "—",
        preco_fornecedor: Number(row.p?.valor_unitario) || 0,
        frete_unitario: Number(row.p?.frete_unitario) || 0,
        imposto_pct: Number(row.p?.imposto_pct) || 0,
        custo_unit: row.custo,
        margem_pct: Number(row.it.margin_pct) || 0,
        preco_final: row.final,
      }));
      await exportApprovalXlsx(bid as any, rows, company);

      toast.success("Planilha de aprovação gerada", { id: tid });
    } catch (e: any) {
      console.error("gerarAprovacao falhou:", e);
      toast.error(`Falha: ${e?.message || e}`, { id: tid });
    }
  }

  async function gerarRelatorioClovis() {
    if (!bid) return;
    if (!totals?.rows || totals.rows.length === 0) {
      toast.error("Nenhum item com preço para gerar o relatório Clovis.");
      return;
    }
    const tid = toast.loading("Gerando relatório Clovis...");
    try {
      const company = await getCompany();
      const rows = totals.rows.map((row: any) => {
        const editalUnit = Number(row.it.estimated_value) || 0;
        const margin = Number(row.it.margin_pct) || 0;
        const custo = row.custo > 0 ? row.custo : editalUnit;
        const final = row.final > 0 ? row.final : custo * (1 + margin / 100);
        return {
          descricao: row.it.descricao,
          quantidade: Number(row.it.quantidade) || 0,
          valor_unitario_edital: editalUnit,
          custo_unitario: custo,
          preco_final: final,
        };
      });
      await exportClovisXlsx(bid as any, rows, company);

      toast.success("Relatório Clovis gerado", { id: tid });
    } catch (e: any) {
      console.error("gerarRelatorioClovis falhou:", e);
      toast.error(`Falha: ${e?.message || e}`, { id: tid });
    }
  }

  const finalSummary = useMemo(() => {
    if (!bid) return null;
    const hasWonItems = items.some((it) => !!it.venceu);
    if ((bid.resultado as ResultadoStatus | null) !== "ganha" && !hasWonItems) return null;
    let faturamento = 0, custo = 0, vencidos = 0;
    let propostaEsperada = 0;
    for (const r of totals.rows) {
      const it = r.it as Item;
      if (!it.venceu) continue;
      vencidos++;
      const qtd = Number(it.quantidade) || 0;
      // USAR PREÇO HOMOLOGADO SE EXISTIR, CASO CONTRÁRIO USAR O PREÇO FINAL DA PROPOSTA
      const ph = Number(it.homologated_value) || r.final;
      faturamento += ph * qtd;
      custo += r.custo * qtd;
      propostaEsperada += r.final * qtd;
    }
    const lucro = faturamento - custo;
    const lucroPct = faturamento > 0 ? (lucro / faturamento) * 100 : 0;
    return { faturamento, custo, lucro, lucroPct, vencidos, propostaEsperada };
  }, [bid, items, totals.rows]);

  if (loading || !bid) return <AppShell title="Carregando…"><div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" /></div></AppShell>;

  const respByItemCount = (rid: string) => prices.filter((p) => p.response_id === rid && p.valor_unitario > 0).length;

  // ============== GATING DE ETAPAS ==============
  const itensValidos = items.length > 0 && items.every((it) => (it.descricao || "").trim().length > 0 && Number(it.quantidade) > 0);
  const temFornecedor = selectedSuppliers.size > 0 || responses.length > 0;
  const temCotacao = responses.some((r) => respByItemCount(r.id) > 0);
  const itensDisputar = items.filter((it) => (it as Item & { disputar?: boolean }).disputar !== false);
  const todosComPreco = itensDisputar.length > 0 && itensDisputar.every((it) => {
    const chosen = it.chosen_response_id || bestResponseFor(it.id);
    return chosen ? !!priceFor(it.id, chosen) : false;
  });
  const propostaGerada = bid.status === "approved" || bid.status === "gerada" || bid.status === "finalizada";

  function reqs(stepId: string): { ok: boolean; msg: string } {
    switch (stepId) {
      case "itens": return { ok: true, msg: "" };
      case "fornecedores": return itensValidos
        ? { ok: true, msg: "" }
        : { ok: false, msg: "Preencha descrição e quantidade de todos os itens." };
      case "envio":
      case "cotacoes": return temFornecedor
        ? { ok: true, msg: "" }
        : { ok: false, msg: "Selecione ao menos 1 fornecedor." };
      case "planilha": return temCotacao
        ? { ok: true, msg: "" }
        : { ok: false, msg: "Insira ao menos 1 cotação de fornecedor." };
      case "proposta": return todosComPreco
        ? { ok: true, msg: "" }
        : { ok: false, msg: "Defina preço para todos os itens da disputa." };
      case "finalizacao": return propostaGerada
        ? { ok: true, msg: "" }
        : { ok: false, msg: "Gere a proposta para liberar a finalização." };
      default: return { ok: true, msg: "" };
    }
  }
  const stepUnlocked = (s: string) => isAdmin || reqs(s).ok;
  const goNext = () => {
    const idx = STEPS.findIndex((s) => s.id === step);
    for (let i = idx + 1; i < STEPS.length; i++) {
      if (stepUnlocked(STEPS[i].id)) { setStep(STEPS[i].id); return; }
    }
  };
  const goPrev = () => {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  };

  // ============== FINALIZAÇÃO ==============
  const resultado = (bid.resultado as ResultadoStatus | null) || null;
  async function setResultado(novo: ResultadoStatus) {
    if (novo === "perdida" || novo === "cancelada") {
      await supabase.from("bid_items").update({ venceu: false }).eq("bid_id", id);
      setItems((arr) => arr.map((it) => ({ ...it, venceu: false })));
    }
    await supabase.from("bids").update({ resultado: novo }).eq("id", id);
    setBid((prev) => prev ? { ...prev, resultado: novo } : prev);
  }
  async function patchItemFinal(itemId: string, patch: { venceu?: boolean; homologated_value?: number }) {
    setItems((arr) => arr.map((it) => it.id === itemId ? { ...it, ...patch } : it));
    await supabase.from("bid_items").update(patch).eq("id", itemId);
  }
  async function salvarFinalizacao() {
    if (!resultado) { toast.error("Selecione um status."); return; }
    setSavingResultado(true);
    try {
      const data: any = {
        resultado,
        resultado_motivo: resultadoMotivo,
        finalizada_em: new Date().toISOString(),
        status: "finalizada",
      };

      if (resultado === "ganha" && finalSummary) {
        data.sold_total = finalSummary.faturamento;
        data.bought_total = finalSummary.custo;
        data.profit_value = finalSummary.lucro;
        data.margin_percentage = finalSummary.lucroPct;
        data.roi = finalSummary.custo > 0 ? (finalSummary.lucro / finalSummary.custo) * 100 : 0;
      } else if (resultado === "perdida") {
        // Registra perda potencial
        data.sold_total = 0;
        data.bought_total = 0;
        data.profit_value = 0;
        data.loss_reason = resultadoMotivo;
      }

      await supabase.from("bids").update(data).eq("id", id);
      toast.success("Resultado e indicadores financeiros salvos com sucesso.");
      await load();
    } catch (e) {
      toast.error(`Falha ao finalizar: ${(e as Error).message}`);
    } finally { setSavingResultado(false); }
  }


  // Context-aware quick actions per step
  const quickActions: QuickAction[] = (() => {
    const all: QuickAction[] = [];
    if (step === "itens") {
      all.push({ id: "import", label: "Importar Excel", icon: FileSpreadsheet, onClick: () => fileRef.current?.click(), variant: "outline" });
      all.push({ id: "organize", label: "Organizar com IA", icon: Wand2, onClick: rodarOrganizacaoIA, primary: true });
      all.push({ id: "add", label: "Novo item", icon: Plus, onClick: addItem });
    }
    if (step === "fornecedores") {
      all.push({ id: "ai-sup", label: "Sugerir fornecedores (IA)", icon: Wand2, onClick: rodarSugestaoFornecedores, primary: true });
    }
    if (step === "envio") {
      all.push({ id: "send", label: "Enviar solicitações", icon: Send, onClick: enviarSolicitacoes, primary: true });
    }
    if (step === "cotacoes" || step === "planilha") {
      all.push({ id: "auto", label: "Escolher melhor", icon: Sparkles, onClick: autoChooseAll, variant: "secondary" });
    }
    if (step === "planilha") {
      all.push({ id: "ai-marg", label: "Sugerir margens (IA)", icon: Wand2, onClick: rodarSugestaoMargens, primary: true });
    }
    if (step === "proposta") {
      all.push({ id: "ai-risk", label: "Análise de risco (IA)", icon: Wand2, onClick: rodarAnaliseRisco, primary: true });
    }
    // Sempre visíveis — exportação e envio para fornecedor
    all.push({ id: "export-xlsx", label: "Exportar Excel", icon: FileSpreadsheet, onClick: exportarCotacaoFornecedor, primary: true });
    all.push({ id: "send-wa", label: "Enviar WhatsApp", icon: MessageCircle, onClick: () => enviarCotacaoFornecedor("whatsapp"), variant: "secondary" });
    all.push({ id: "copy-msg", label: "Copiar mensagem", icon: Copy, onClick: async () => {
      const company = await getCompany();
      const msg = buildSupplierMessage(bid, company);
      const ok = await copyToClipboard(msg);
      if (ok) toast.success("Mensagem copiada para a área de transferência.");
      else toast.error("Não foi possível copiar.");
    }, variant: "outline" });
    all.push({ id: "send-mail", label: "Enviar E-mail", icon: Mail, onClick: () => enviarCotacaoFornecedor("email"), variant: "secondary" });
    all.push({ id: "ai-import", label: "Importar cotação (IA)", icon: Wand2, onClick: () => setAiOpen(true) });
    all.push({ id: "estrategica", label: "Visão Estratégica", icon: ShieldCheck, onClick: () => navigate({ to: "/central/estrategica/$id", params: { id } }), variant: "outline" });
    all.push({ id: "approval", label: "Excel Diretoria", icon: ClipboardCheck, onClick: gerarAprovacao, variant: "outline" });
    all.push({ id: "clovis", label: "Relatório Clovis", icon: FileSpreadsheet, onClick: gerarRelatorioClovis, variant: "outline" });
    all.push({ id: "pdf", label: "Proposta PDF", icon: FileDown, onClick: gerarProposta });
    all.push({ id: "pdf-cat", label: "Proposta + Catálogo", icon: FileDown, onClick: gerarPropostaComCatalogo, variant: "outline" });
    all.push({ id: "registrar-ganhos", label: "Registrar Ganhos", icon: Trophy, onClick: () => setStep("finalizacao"), variant: "outline" });
    all.push({ id: "pos-entrega", label: "Pós-Entrega", icon: FileDown, onClick: () => navigate({ to: "/edital/$id/pos-entrega", params: { id } }), variant: "outline" });
    all.push({ id: "refresh", label: "Atualizar", icon: RefreshCw, onClick: load, variant: "ghost" });
    return all;
  })();

  return (
    <AppShell title={`Cotação · ${bid.orgao || bid.processo || "Wizard"}`}>
      <div className="space-y-4">
        {/* Timeline Operacional Master */}
        <Card className="bg-slate-50/50">
          <CardContent className="p-0 px-2">
            <BidTimeline currentStatus={derivedBidStatus} />
          </CardContent>
        </Card>

        {/* Dados Estratégicos do Edital */}
        <BidHeaderData 
          bid={bid} 
          totalEdital={(() => {

            let v = totals.totalEdital || 0;
            if (v <= 0) {
              v = items.reduce((acc, it) => {
                const qtd = Number(it.quantidade) || 0;
                const unit = Number(it.estimated_value) || 0;
                const tot = unit * qtd;
                return acc + tot;
              }, 0);

            }
            if (v <= 0) v = Number(bid.valor_total_estimado) || 0;
            return v;
          })()} 
        />

        {/* Resumo estratégico de faturamento/lucro */}
        {(() => {
          const isGanha = bid?.resultado === "ganha";

          // Potencial = valor estimado do edital (teto) ou, se não houver, total da proposta atual
          const potentialTotal = totals.totalEdital || totals.totalFinal || 0;

          // Durante a fase de proposta usamos os totais calculados em tempo real
          // (preço final x qtd e custo x qtd). Quando a licitação já foi ganha,
          // priorizamos o resumo final (homologado).
          const winTotal = (isGanha || derivedBidStatus === "won" || derivedBidStatus === "homologated" || derivedBidStatus === "invoiced" || derivedBidStatus === "received" || derivedBidStatus === "closed") && finalSummary
            ? finalSummary.faturamento
            : (totals.totalFinal || bid?.total_homologated || 0);

          const winCost = (isGanha || derivedBidStatus === "won" || derivedBidStatus === "homologated" || derivedBidStatus === "invoiced" || derivedBidStatus === "received" || derivedBidStatus === "closed") && finalSummary
            ? finalSummary.custo
            : (totals.totalCusto || ((bid?.total_homologated || 0) - (bid?.total_profit_real || 0)));

          return (
            <BidMiniStats
              potentialTotal={potentialTotal}
              winTotal={winTotal}
              winCost={winCost}
            />
          );
        })()}


        <QuickActionsBar
          actions={quickActions}
          extraInfo={<>Etapa: <strong className="text-foreground">{STEPS.find((s) => s.id === step)?.label}</strong></>}
        />


        <Tabs value={step} onValueChange={setStep}>
          <TabsList className="flex flex-wrap h-auto">
            {STEPS.map((s) => {
              const unlocked = stepUnlocked(s.id);
              return (
                <TabsTrigger key={s.id} value={s.id} disabled={!unlocked} className="text-xs sm:text-sm gap-1" title={unlocked ? "" : reqs(s.id).msg}>
                  {!unlocked && <Lock className="size-3" />}{s.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* ===== ETAPA 1: ITENS ===== */}
          <TabsContent value="itens">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                <CardTitle className="text-base">Lista de itens</CardTitle>
                <div className="flex flex-wrap gap-2 items-center">
                  <Label className="text-xs">Margem padrão</Label>
                  <Input type="number" className="w-20 h-9" value={defaultMargin} onChange={(e) => setDefaultMargin(Number(e.target.value) || 0)} />
                  <Button size="sm" variant="ghost" onClick={applyDefaultMargin}>Aplicar a todos</Button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadExcel(f); e.target.value = ""; }} />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><FileSpreadsheet className="size-4 mr-1" />Importar Excel</Button>
                  <Button size="sm" variant="secondary" onClick={rodarOrganizacaoIA} disabled={orgBusy || items.length === 0}>
                    {orgBusy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Wand2 className="size-4 mr-1" />}Organizar com IA
                  </Button>
                  <Button size="sm" onClick={addItem}><Plus className="size-4 mr-1" />Novo item</Button>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 1100 }}>
                    <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left w-16">#</th>
                        <th className="px-3 py-2 text-left w-16">Lote</th>
                        <th className="px-3 py-2 text-left">Descrição</th>
                        <th className="px-3 py-2 text-left w-16">Un.</th>
                        <th className="px-3 py-2 text-right w-16">Qtd.</th>
                        <th className="px-3 py-2 text-left w-24">Marca</th>
                        <th className="px-3 py-2 text-left w-24">CATMAT</th>
                        <th className="px-3 py-2 text-right w-24">Vlr. edital</th>
                        <th className="px-3 py-2 text-center w-12">ME</th>
                        <th className="px-3 py-2 text-right w-16">Margem %</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className="border-t">
                          <td className="px-1 py-1"><Input className="h-8 w-12 text-center text-xs" type="number" value={it.item_number ?? ""} onChange={(e) => patchItem(it.id, { item_number: Number(e.target.value) })} /></td>
                          <td className="px-1 py-1"><Input className="h-8 w-14 text-xs" value={it.lote || ""} onChange={(e) => patchItem(it.id, { lote: e.target.value })} /></td>
                          <td className="px-1 py-1"><Input className="h-8 text-xs" value={it.descricao} onChange={(e) => patchItem(it.id, { descricao: e.target.value })} /></td>
                          <td className="px-1 py-1"><Input className="h-8 w-14 text-xs text-center" value={it.unidade} onChange={(e) => patchItem(it.id, { unidade: e.target.value })} /></td>
                          <td className="px-1 py-1"><Input className="h-8 w-16 text-right text-xs" type="number" value={it.quantidade} onChange={(e) => patchItem(it.id, { quantidade: Number(e.target.value) })} /></td>
                          <td className="px-1 py-1"><Input className="h-8 w-24 text-xs" value={it.marca || ""} onChange={(e) => patchItem(it.id, { marca: e.target.value })} /></td>
                          <td className="px-1 py-1"><Input className="h-8 w-24 text-xs" value={it.catmat || ""} onChange={(e) => patchItem(it.id, { catmat: e.target.value })} /></td>
                          <td className="px-1 py-1"><Input className="h-8 w-24 text-right text-xs" type="number" step="0.01" value={it.estimated_value ?? ""} onChange={(e) => patchItem(it.id, { estimated_value: Number(e.target.value) || 0 })} /></td>
                          <td className="px-1 py-1 text-center"><Checkbox checked={!!it.me_epp} onCheckedChange={(v) => patchItem(it.id, { me_epp: !!v })} /></td>
                          <td className="px-1 py-1"><Input className="h-8 w-16 text-right text-xs" type="number" value={it.margin_pct} onChange={(e) => patchItem(it.id, { margin_pct: Number(e.target.value) })} /></td>
                          <td className="px-0 py-1 text-center"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeItem(it.id)}><Trash2 className="size-3 text-destructive" /></Button></td>
                        </tr>
                      ))}
                      {items.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">Nenhum item — importe um Excel, clique em "Novo item" ou use "Organizar com IA".</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <NavSteps current="itens" onNext={goNext} nextDisabled={!stepUnlocked("fornecedores")} hint={reqs("fornecedores").msg} />
          </TabsContent>

          {/* ===== ETAPA 2: FORNECEDORES ===== */}
          <TabsContent value="fornecedores">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <CardTitle className="text-base">Selecione os fornecedores para cotar</CardTitle>
                <Button size="sm" variant="secondary" onClick={rodarSugestaoFornecedores} disabled={supAiBusy || items.length === 0}>
                  {supAiBusy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Wand2 className="size-4 mr-1" />}Sugerir com IA
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <SupplierPicker
                  suppliers={suppliers}
                  selected={selectedSuppliers}
                  onToggle={(sid, v) => setSelectedSuppliers((prev) => { const n = new Set(prev); if (v) n.add(sid); else n.delete(sid); return n; })}
                  onSelectAll={(ids, v) => setSelectedSuppliers((prev) => { const n = new Set(prev); ids.forEach((i) => v ? n.add(i) : n.delete(i)); return n; })}
                  bidSegmentId={bid.segment_id}
                />
              </CardContent>
            </Card>
            <NavSteps current="fornecedores" onPrev={goPrev} onNext={goNext} nextDisabled={!stepUnlocked("envio")} hint={reqs("envio").msg} />
          </TabsContent>

          {/* ===== ETAPA 3: ENVIO ===== */}
          <TabsContent value="envio">
            <Card>
              <CardHeader><CardTitle className="text-base">Mensagem padrão + Excel em anexo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Vamos registrar o envio para <b>{selectedSuppliers.size}</b> fornecedor(es). A planilha de cotação (Excel) será gerada automaticamente e anexada ao WhatsApp quando o navegador permitir; caso contrário, o arquivo é baixado e basta arrastá-lo na conversa.
                </div>
                <Textarea
                  readOnly
                  rows={8}
                  value={`Olá! Segue solicitação de cotação.\n\nÓrgão: ${bid.orgao || "-"}\nProcesso: ${bid.processo || "-"}${bid.objeto ? `\nObjeto: ${bid.objeto}` : ""}${bid.data_encerramento_propostas || bid.data_abertura ? `\nPrazo para envio: ${new Date(bid.data_encerramento_propostas || bid.data_abertura || "").toLocaleDateString("pt-BR")}` : ""}\n\nPedimos a gentileza de preencher a planilha em anexo (apenas as células em amarelo) e devolver por aqui.\n\n📎 Anexo: cotacao_${(bid.processo || bid.orgao || "edital").replace(/\W+/g, "_")}.xlsx (${items.length} ite${items.length === 1 ? "m" : "ns"})\n\nObrigado!`}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={enviarSolicitacoes} disabled={selectedSuppliers.size === 0}><Send className="size-4 mr-2" />Enviar solicitações com Excel</Button>
                  <Button variant="outline" onClick={exportarCotacaoFornecedor} disabled={items.length === 0}><FileSpreadsheet className="size-4 mr-2" />Baixar Excel da cotação</Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const company = await getCompany();
                      const msg = buildSupplierMessage(bid, company);
                      const ok = await copyToClipboard(msg);
                      if (ok) toast.success("Mensagem copiada — cole no WhatsApp e anexe o Excel.");
                      else toast.error("Não foi possível copiar — selecione e copie manualmente.");
                    }}
                  >
                    <Copy className="size-4 mr-2" />Copiar mensagem
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Se o WhatsApp Web for bloqueado pela rede, use <b>Copiar mensagem</b> + <b>Baixar Excel</b> e cole/anexe diretamente na conversa.
                </p>
              </CardContent>
            </Card>
            <NavSteps current="envio" onPrev={goPrev} onNext={goNext} nextDisabled={!stepUnlocked("cotacoes")} hint={reqs("cotacoes").msg} />
          </TabsContent>

          {/* ===== ETAPA 4: COTAÇÕES ===== */}
          <TabsContent value="cotacoes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <CardTitle className="text-base">Inserir preços recebidos</CardTitle>
                <Button size="sm" onClick={() => setAiOpen(true)}>
                  <Wand2 className="size-4 mr-1" />Importar por IA (PDF/Excel)
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {responses.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma cotação aberta. Volte à etapa "Envio" ou clique em "Importar por IA".</div>}
                {responses.map((r) => {
                  const sup = suppliers.find((s) => s.id === r.supplier_id);
                  return (
                    <div key={r.id} className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/60 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex-1 min-w-[200px]">
                          <div className="font-bold text-sm uppercase tracking-tight">{sup?.razao_social || "Fornecedor"}</div>
                          <div className="text-[11px] text-muted-foreground font-medium uppercase">{respByItemCount(r.id)} de {items.length} itens preenchidos</div>
                        </div>
                        <div className="flex items-center gap-3 bg-background/50 p-2 rounded-md border border-dashed">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Desconto do Fornecedor (Global)</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Select 
                                value={r.global_discount_type || "percentage"} 
                                onValueChange={(v) => patchResponse(r.id, { global_discount_type: v })}
                              >
                                <SelectTrigger className="h-7 w-10 p-1 text-[10px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percentage">%</SelectItem>
                                  <SelectItem value="fixed">R$</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input 
                                className="h-7 w-20 text-right text-xs font-bold" 
                                type="number" 
                                defaultValue={r.global_discount_value || 0}
                                onBlur={(e) => patchResponse(r.id, { global_discount_value: Number(e.target.value) || 0 })}
                              />
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeResponse(r.id)}><Trash2 className="size-4" /></Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm" style={{ minWidth: 900 }}>
                          <thead className="text-[10px] uppercase font-bold text-muted-foreground bg-muted/30">
                            <tr>
                              <th className="px-3 py-2 text-left w-14">#</th>
                              <th className="px-3 py-2 text-left">Item</th>
                              <th className="px-3 py-2 text-left w-28">Marca</th>
                              <th className="px-3 py-2 text-right w-24">P. Tabela un.</th>
                              <th className="px-3 py-2 text-center w-32">Desc. Item</th>
                              <th className="px-3 py-2 text-right w-24">Frete un.</th>
                              <th className="px-3 py-2 text-right w-20">Imp. %</th>
                              <th className="px-3 py-2 text-right w-28">Custo Liq.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it) => {
                              const p = priceFor(it.id, r.id);
                              return (
                                <tr key={it.id} className="border-t">
                                  <td className="px-3 py-1 font-medium">{it.item_number}</td>
                                  <td className="px-3 py-1 max-w-md truncate" title={it.descricao}>{it.descricao}</td>
                                  <td className="px-2 py-1"><Input className="h-8 text-xs" defaultValue={p?.marca || ""} onBlur={(e) => setPrice(r.id, it.id, "marca", e.target.value)} /></td>
                                  <td className="px-2 py-1"><Input className="h-8 text-right text-xs font-bold" type="number" step="0.01" defaultValue={p?.valor_unitario || ""} onBlur={(e) => setPrice(r.id, it.id, "valor_unitario", Number(e.target.value))} /></td>
                                  <td className="px-2 py-1">
                                    <div className="flex items-center gap-1">
                                      <Select 
                                        value={p?.supplier_discount_type || "percentage"} 
                                        onValueChange={(v) => setPrice(r.id, it.id, "supplier_discount_type", v)}
                                      >
                                        <SelectTrigger className="h-7 w-10 p-1 text-[9px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="percentage">%</SelectItem>
                                          <SelectItem value="fixed">R$</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input 
                                        className="h-8 text-right text-xs w-16" 
                                        type="number" 
                                        defaultValue={p?.supplier_discount_value || 0} 
                                        onBlur={(e) => setPrice(r.id, it.id, "supplier_discount_value", Number(e.target.value))} 
                                      />
                                    </div>
                                  </td>
                                  <td className="px-2 py-1"><Input className="h-8 text-right text-xs" type="number" step="0.01" defaultValue={p?.frete_unitario || ""} onBlur={(e) => setPrice(r.id, it.id, "frete_unitario", Number(e.target.value))} /></td>
                                  <td className="px-2 py-1"><Input className="h-8 text-right text-xs" type="number" step="0.1" defaultValue={p?.imposto_pct || ""} onBlur={(e) => setPrice(r.id, it.id, "imposto_pct", Number(e.target.value))} /></td>
                                  <td className="px-3 py-1 text-right tabular-nums font-bold text-primary">{fmtBRL(custoTotal(p, r.id))}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <div className="mt-6">
              <PurchaseOrders
                bidId={id}
                items={items.map((i) => ({
                  id: i.id,
                  item_number: i.item_number,
                  descricao: i.descricao,
                  unidade: i.unidade,
                  quantidade: i.quantidade,
                }))}
              />
            </div>
            <NavSteps current="cotacoes" onPrev={goPrev} onNext={goNext} nextDisabled={!stepUnlocked("planilha")} hint={reqs("planilha").msg} />
          </TabsContent>

          {/* ===== ETAPA 5: PLANILHA / ESCOLHA ===== */}
          <TabsContent value="planilha">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Comparativo e escolha</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={rodarSugestaoMargens} disabled={margAiBusy}>
                    {margAiBusy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Wand2 className="size-4 mr-1" />}Margens IA
                  </Button>
                  <Button size="sm" onClick={autoChooseAll}><Sparkles className="size-4 mr-1" />Sugerir melhor</Button>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 1100 }}>
                    <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left w-14">#</th>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-left w-56">Fornecedor escolhido</th>
                        <th className="px-3 py-2 text-right w-16" title="Quantidade do item">Qtd</th>
                        <th className="px-3 py-2 text-right w-28" title="Valor unitário do edital (referência)">Edital un.</th>
                        <th className="px-3 py-2 text-right w-28" title="Custo unitário do fornecedor escolhido">Custo un.</th>
                        <th className="px-3 py-2 text-right w-20">Margem %</th>
                        <th className="px-3 py-2 text-right w-28" title="Preço final unitário (custo + margem)">Final un.</th>
                        <th className="px-3 py-2 text-right w-28" title="Diferença unitária entre Edital e Final">Δ Edital→Final</th>
                        <th className="px-3 py-2 text-right w-28" title="Lucro por unidade (final − custo)">Lucro/un</th>
                        <th className="px-3 py-2 text-center w-20" title="Marcar item como ganho na licitação">Ganhou</th>
                        <th className="px-3 py-2 text-right w-32" title="Preço unitário homologado (ganho na licitação)">Preço ganho un.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {totals.rows.map((row) => {
                        const sugerido = bestResponseFor(row.it.id);
                        const diff = row.editalUnit > 0 ? row.editalUnit - row.final : 0;
                        const diffPct = row.editalUnit > 0 ? (diff / row.editalUnit) * 100 : 0;
                        return (
                          <tr key={row.it.id} className="border-t">
                            <td className="px-3 py-1">{row.it.item_number}</td>
                            <td className="px-3 py-1 max-w-md truncate" title={row.it.descricao}>{row.it.descricao}</td>
                            <td className="px-2 py-1">
                              <Select value={row.chosen || "auto"} onValueChange={(v) => chooseManual(row.it.id, v === "auto" ? null : v)}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">— Automático ({sugerido ? suppliers.find((s) => s.id === responses.find((r) => r.id === sugerido)?.supplier_id)?.razao_social : "sem dados"})</SelectItem>
                                  {responses.map((r) => {
                                    const sup = suppliers.find((s) => s.id === r.supplier_id);
                                    const p = priceFor(row.it.id, r.id);
                                    if (!p?.valor_unitario) return null;
                                    return <SelectItem key={r.id} value={r.id}>{sup?.razao_social} — {fmtBRL(custoTotal(p))}</SelectItem>;
                                  })}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">{Number(row.it.quantidade) || 0}</td>
                            <td className="px-3 py-1 text-right tabular-nums">{row.editalUnit > 0 ? fmtBRL(row.editalUnit) : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-1 text-right tabular-nums">{fmtBRL(row.custo)}</td>
                            <td className="px-2 py-1">
                              <Input className="h-8 text-right" type="number" value={row.it.margin_pct} onChange={(e) => patchItem(row.it.id, { margin_pct: Number(e.target.value) })} />
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{fmtBRL(row.final)}</td>
                            <td className={`px-3 py-1 text-right tabular-nums ${row.editalUnit > 0 ? (diff >= 0 ? "text-emerald-600" : "text-destructive") : "text-muted-foreground"}`}>
                              {row.editalUnit > 0 ? `${fmtBRL(diff)} (${diffPct.toFixed(1)}%)` : "—"}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums">{fmtBRL(row.final - row.custo)}</td>
                            <td className="px-2 py-1 text-center">
                              <Checkbox
                                checked={!!row.it.venceu}
                                onCheckedChange={(v) => patchItemFinal(row.it.id, { venceu: !!v, homologated_value: !!v && !Number(row.it.homologated_value) ? row.final : Number(row.it.homologated_value) || 0 })}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                className="h-8 text-right tabular-nums"
                                type="number"
                                step="0.01"
                                defaultValue={Number(row.it.homologated_value) || row.final || 0}
                                key={`ph-${row.it.id}-${row.it.homologated_value ?? ""}`}
                                onBlur={(e) => patchItemFinal(row.it.id, { homologated_value: Number(e.target.value) || 0 })}
                                disabled={!row.it.venceu}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/60 font-semibold">
                        <td colSpan={3} className="px-3 py-2 text-right uppercase text-xs text-muted-foreground">Totais (Σ qtd × un.)</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.rows.reduce((s, r) => s + (Number(r.it.quantidade) || 0), 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums" title="Soma de (qtd × edital un.)">{fmtBRL(totals.totalEdital)}</td>
                        <td className="px-3 py-2 text-right tabular-nums" title="Soma de (qtd × custo un.)">{fmtBRL(totals.totalCusto)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground" title="Margem média">{totals.margemMedia.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400" title="Soma de (qtd × final un.) — total da proposta">{fmtBRL(totals.totalFinal)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${totals.totalEdital > 0 ? (totals.totalEdital - totals.totalFinal >= 0 ? "text-emerald-600" : "text-destructive") : ""}`} title="Quanto a proposta total está abaixo (verde) ou acima (vermelho) do edital">
                          {totals.totalEdital > 0 ? fmtBRL(totals.totalEdital - totals.totalFinal) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums" title="Lucro total estimado: Σ (final − custo) × qtd">{fmtBRL(totals.lucro)}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-xs text-muted-foreground">
                          {totals.rows.filter((r) => r.it.venceu).length}/{totals.rows.length}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400" title="Faturamento total dos itens ganhos: Σ preço homologado × qtd">
                          {fmtBRL(totals.rows.reduce((s, r) => s + (r.it.venceu ? (Number(r.it.homologated_value) || r.final) * (Number(r.it.quantidade) || 0) : 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
            <NavSteps current="planilha" onPrev={goPrev} onNext={goNext} nextDisabled={!stepUnlocked("proposta")} hint={reqs("proposta").msg} />
          </TabsContent>

          {/* ===== ETAPA 6: PROPOSTA ===== */}
          <TabsContent value="proposta">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2"><Trophy className="size-5 text-amber-500" />Resultado final</CardTitle>
                <Button size="sm" variant="secondary" onClick={rodarAnaliseRisco} disabled={riskBusy}>
                  {riskBusy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Wand2 className="size-4 mr-1" />}Análise de risco IA
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <PurchaseOrders
                  bidId={id}
                  items={items.map((i) => ({
                    id: i.id,
                    item_number: i.item_number,
                    descricao: i.descricao,
                    unidade: i.unidade,
                    quantidade: i.quantidade,
                  }))}
                />

                <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard label="Itens" value={items.length.toString()} />
                  <StatCard label="Preço final" value={fmtBRL(totals.totalFinal)} highlight />
                  <StatCard label="Lucro estimado" value={fmtBRL(totals.lucro)} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-left">Marca</th>
                        <th className="px-3 py-2 text-left">Modelo</th>
                        <th className="px-3 py-2 text-left">Fornecedor</th>
                        <th className="px-3 py-2 text-right">Preço final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {totals.rows.map((row: any) => (
                        <tr key={row.it.id} className="border-t">
                          <td className="px-3 py-2">{row.it.item_number}</td>
                          <td className="px-3 py-2 max-w-md truncate">{row.it.descricao}</td>
                          <td className="px-3 py-2">{row.p?.marca || row.it.marca || "—"}</td>
                          <td className="px-3 py-2">{row.it.modelo || "—"}</td>
                          <td className="px-3 py-2 text-xs">{row.supplier?.razao_social || "—"}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtBRL(row.final)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="lg" variant="secondary" onClick={gerarAprovacao}><ClipboardCheck className="size-4 mr-2" />Planilha de Aprovação (Diretoria)</Button>
                  <Button size="lg" variant="secondary" onClick={gerarRelatorioClovis}><FileSpreadsheet className="size-4 mr-2" />Relatório Clovis (Excel)</Button>
                  <Button size="lg" onClick={gerarProposta}><FileDown className="size-4 mr-2" />Gerar Proposta em PDF</Button>
                  <Button size="lg" variant="outline" onClick={gerarPropostaComCatalogo}><FileDown className="size-4 mr-2" />Proposta com Catálogo (com imagens)</Button>
                </div>
              </div>
            </CardContent>
            </Card>
            <NavSteps current="proposta" onPrev={goPrev} onNext={goNext} nextDisabled={!stepUnlocked("finalizacao")} hint={reqs("finalizacao").msg} />
          </TabsContent>

          {/* ===== ETAPA 7: FINALIZAÇÃO ===== */}
          <TabsContent value="finalizacao">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="size-5 text-primary" />Resultado da disputa</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([
                    { v: "pendente" as const, label: "Pendente", icon: Clock, cls: "from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400" },
                    { v: "ganha" as const, label: "Ganha", icon: CheckCircle2, cls: "from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400" },
                    { v: "perdida" as const, label: "Perdida", icon: XCircle, cls: "from-red-500/10 to-red-500/5 text-red-600 dark:text-red-400" },
                    { v: "cancelada" as const, label: "Cancelada", icon: Ban, cls: "from-slate-500/10 to-slate-500/5 text-slate-600 dark:text-slate-400" },
                  ]).map((opt) => {
                    const active = resultado === opt.v;
                    return (
                      <button key={opt.v} type="button" onClick={() => setResultado(opt.v)}
                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all bg-gradient-to-br ${opt.cls} ${active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"}`}>
                        <opt.icon className="size-6" />
                        <span className="font-semibold text-sm">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                {resultado === "ganha" && (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">Marque os itens que você arrematou e ajuste o preço de homologação se for diferente do preço da proposta.</div>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm" style={{ minWidth: 800 }}>
                        <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 w-12">Venceu</th>
                            <th className="px-3 py-2 text-left w-14">#</th>
                            <th className="px-3 py-2 text-left">Item</th>
                            <th className="px-3 py-2 text-right w-20">Qtd</th>
                            <th className="px-3 py-2 text-right w-28">Custo un.</th>
                            <th className="px-3 py-2 text-right w-28">Proposta un.</th>
                            <th className="px-3 py-2 text-right w-32">Homologado un.</th>
                            <th className="px-3 py-2 text-right w-28">Lucro item</th>
                          </tr>
                        </thead>
                        <tbody>
                          {totals.rows.map((r) => {
                            const it = r.it as Item;
                            const venceu = !!it.venceu;
                            const ph = Number(it.homologated_value) || 0;
                            const phEff = ph || r.final;
                            const qtd = Number(it.quantidade) || 0;
                            const lucroItem = venceu ? (phEff - r.custo) * qtd : 0;
                            return (
                              <tr key={it.id} className="border-t">
                                <td className="px-3 py-1 text-center">
                                  <Checkbox checked={venceu} onCheckedChange={(v) => patchItemFinal(it.id, { venceu: !!v })} />
                                </td>
                                <td className="px-3 py-1">{it.item_number}</td>
                                <td className="px-3 py-1 max-w-md truncate" title={it.descricao}>{it.descricao}</td>
                                <td className="px-3 py-1 text-right tabular-nums">{qtd}</td>
                                <td className="px-3 py-1 text-right tabular-nums">{fmtBRL(r.custo)}</td>
                                <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">{fmtBRL(r.final)}</td>
                                <td className="px-2 py-1">
                                  <Input className="h-8 text-right" type="number" step="0.01"
                                    defaultValue={ph || r.final}
                                    onBlur={(e) => patchItemFinal(it.id, { homologated_value: Number(e.target.value) || 0 })}
                                    disabled={!venceu} />
                                </td>
                                <td className={`px-3 py-1 text-right tabular-nums font-medium ${lucroItem < 0 ? "text-red-600 dark:text-red-400" : venceu ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                                  {venceu ? fmtBRL(lucroItem) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {finalSummary && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard label={`Itens vencidos`} value={`${finalSummary.vencidos}/${items.length}`} />
                        <StatCard label="Faturamento" value={fmtBRL(finalSummary.faturamento)} />
                        <StatCard label="Custo total" value={fmtBRL(finalSummary.custo)} />
                        <StatCard label={`Lucro real (${finalSummary.lucroPct.toFixed(1)}%)`} value={fmtBRL(finalSummary.lucro)} highlight />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <Label className="text-xs">Observação / motivo (opcional)</Label>
                  <Textarea rows={3} value={resultadoMotivo} onChange={(e) => setResultadoMotivo(e.target.value)}
                    placeholder={resultado === "perdida" ? "Ex.: perdemos por preço, fornecedor X arrematou..." : resultado === "cancelada" ? "Ex.: edital cancelado pelo órgão" : ""} />
                </div>

                <div className="flex justify-end">
                  <Button size="lg" onClick={salvarFinalizacao} disabled={savingResultado || !resultado}>
                    {savingResultado ? <Loader2 className="size-4 mr-2 animate-spin" /> : <CheckCircle2 className="size-4 mr-2" />}
                    Salvar resultado
                  </Button>
                </div>
                {bid.finalizada_em && (
                  <div className="text-xs text-muted-foreground text-right">Finalizada em {new Date(bid.finalizada_em).toLocaleString("pt-BR")}</div>
                )}
              </CardContent>
            </Card>
            <NavSteps current="finalizacao" onPrev={goPrev} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={orgOpen} onOpenChange={(v) => !orgBusy && setOrgOpen(v)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Revisar organização sugerida pela IA</DialogTitle>
            <div className="text-xs text-muted-foreground">
              Marque o que deseja aplicar. Itens duplicados podem ser removidos automaticamente.
            </div>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background border-b">
                <tr className="text-left">
                  <th className="px-2 py-2 w-12">#</th>
                  <th className="px-2 py-2">Atual → Sugerido</th>
                  <th className="px-2 py-2 w-20">Un.</th>
                  <th className="px-2 py-2 w-32">Categoria</th>
                  <th className="px-2 py-2 w-28">Duplicado?</th>
                </tr>
              </thead>
              <tbody>
                {orgSuggestions.map((s) => {
                  const it = items.find((i) => i.id === s.id);
                  if (!it) return null;
                  const flags = orgApply[s.id] || { desc: false, un: false, cat: false };
                  const set = (patch: Partial<typeof flags>) => setOrgApply((p) => ({ ...p, [s.id]: { ...flags, ...patch } }));
                  const dupOf = s.duplicado_de_id ? items.find((i) => i.id === s.duplicado_de_id) : null;
                  return (
                    <tr key={s.id} className="border-b align-top">
                      <td className="px-2 py-2 tabular-nums">{it.item_number}</td>
                      <td className="px-2 py-2">
                        <div className="text-muted-foreground line-through text-[11px]">{it.descricao}</div>
                        <label className="flex items-start gap-2 mt-1">
                          <Checkbox checked={flags.desc} onCheckedChange={(v) => set({ desc: !!v })} disabled={!s.descricao_padronizada || s.descricao_padronizada === it.descricao} />
                          <span className="leading-snug">{s.descricao_padronizada || <em className="text-muted-foreground">sem sugestão</em>}</span>
                        </label>
                      </td>
                      <td className="px-2 py-2">
                        <div className="text-muted-foreground line-through text-[11px]">{it.unidade}</div>
                        <label className="flex items-center gap-1 mt-1">
                          <Checkbox checked={flags.un} onCheckedChange={(v) => set({ un: !!v })} disabled={!s.unidade_padronizada || s.unidade_padronizada.toUpperCase() === (it.unidade || "").toUpperCase()} />
                          <span className="font-medium">{s.unidade_padronizada}</span>
                        </label>
                      </td>
                      <td className="px-2 py-2">
                        <div className="text-muted-foreground line-through text-[11px]">{it.categoria || "—"}</div>
                        <label className="flex items-center gap-1 mt-1">
                          <Checkbox checked={flags.cat} onCheckedChange={(v) => set({ cat: !!v })} disabled={!s.categoria || s.categoria === it.categoria} />
                          <Badge variant="secondary" className="text-[10px]">{s.categoria || "—"}</Badge>
                        </label>
                      </td>
                      <td className="px-2 py-2">
                        {dupOf ? (
                          <label className="flex items-start gap-1">
                            <Checkbox checked={!!orgRemoveDup[s.id]} onCheckedChange={(v) => setOrgRemoveDup((p) => ({ ...p, [s.id]: !!v }))} />
                            <span className="text-[11px]">Remover (duplica #{dupOf.item_number})</span>
                          </label>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {orgSuggestions.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma sugestão.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" disabled={orgBusy} onClick={() => setOrgOpen(false)}>Cancelar</Button>
            <Button disabled={orgBusy} onClick={aplicarOrganizacao}>
              {orgBusy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}Aplicar selecionados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiOpen} onOpenChange={(v) => !aiBusy && setAiOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Importar cotação por IA</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Fornecedor</Label>
              <Select value={aiSupplierId} onValueChange={setAiSupplierId}>
                <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.razao_social}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Arquivo da proposta (PDF, Excel, imagem)</Label>
              <Input type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp" onChange={(e) => setAiFile(e.target.files?.[0] || null)} />
              {aiFile && <div className="text-xs text-muted-foreground mt-1">{aiFile.name}</div>}
            </div>
            <div className="text-xs text-muted-foreground">
              A IA vai ler o arquivo e casar os preços com os itens desta cotação. Se o fornecedor já tiver resposta, os preços serão substituídos.
            </div>
            {aiBusy && <div className="text-sm flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{aiStep}</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={aiBusy} onClick={() => setAiOpen(false)}>Cancelar</Button>
            <Button disabled={aiBusy || !aiSupplierId || !aiFile} onClick={importarCotacaoIA}>
              {aiBusy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <FileUp className="size-4 mr-1" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sugestão de fornecedores IA */}
      <Dialog open={supAiOpen} onOpenChange={(v) => !supAiBusy && setSupAiOpen(v)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Fornecedores sugeridos pela IA</DialogTitle>
            <div className="text-xs text-muted-foreground">Baseado nas categorias dos itens. Score ≥ 60 será selecionado automaticamente.</div>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            {supAiBusy && <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Analisando…</div>}
            {!supAiBusy && supAiResults.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma sugestão.</div>}
            {!supAiBusy && supAiResults.map(s => {
              const sup = suppliers.find(x => x.id === s.fornecedor_id);
              if (!sup) return null;
              return (
                <div key={s.fornecedor_id} className="flex items-start gap-3 p-3 border-b">
                  <Badge variant={s.score >= 80 ? "default" : s.score >= 60 ? "secondary" : "outline"}>{s.score}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{sup.razao_social}</div>
                    <div className="text-xs text-muted-foreground">{s.motivo}</div>
                    {s.categorias_atendidas && s.categorias_atendidas.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.categorias_atendidas.map((c, i) => <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSupAiOpen(false)}>Fechar</Button>
            <Button disabled={supAiBusy || supAiResults.length === 0} onClick={aplicarSugestaoFornecedores}>
              <Sparkles className="size-4 mr-1" />Selecionar sugeridos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Margens IA */}
      <Dialog open={margAiOpen} onOpenChange={(v) => !margAiBusy && setMargAiOpen(v)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Margens sugeridas pela IA</DialogTitle>
            <div className="text-xs text-muted-foreground">Baseado em concorrência e categoria. Marque o que deseja aplicar.</div>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            {margAiBusy && <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Calculando…</div>}
            {!margAiBusy && (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-left">
                    <th className="px-2 py-2 w-10"></th>
                    <th className="px-2 py-2 w-12">#</th>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2 w-20 text-right">Atual</th>
                    <th className="px-2 py-2 w-20 text-right">Sugerido</th>
                    <th className="px-2 py-2 w-16">Risco</th>
                    <th className="px-2 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {margAiResults.map(m => {
                    const it = items.find(i => i.id === m.id);
                    if (!it) return null;
                    return (
                      <tr key={m.id} className="border-b align-top">
                        <td className="px-2 py-2"><Checkbox checked={!!margAiApply[m.id]} onCheckedChange={v => setMargAiApply(p => ({ ...p, [m.id]: !!v }))} /></td>
                        <td className="px-2 py-2 tabular-nums">{it.item_number}</td>
                        <td className="px-2 py-2 max-w-md truncate" title={it.descricao}>{it.descricao}</td>
                        <td className="px-2 py-2 text-right text-muted-foreground">{Number(it.margin_pct).toFixed(0)}%</td>
                        <td className="px-2 py-2 text-right font-semibold">{m.margem_sugerida.toFixed(0)}%</td>
                        <td className="px-2 py-2">
                          <Badge variant={m.risco === "alto" ? "destructive" : m.risco === "medio" ? "secondary" : "outline"} className="text-[10px] capitalize">{m.risco}</Badge>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{m.motivo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={margAiBusy} onClick={() => setMargAiOpen(false)}>Cancelar</Button>
            <Button disabled={margAiBusy || margAiResults.length === 0} onClick={aplicarMargensIA}>
              {margAiBusy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}Aplicar margens
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Análise de risco IA */}
      <Dialog open={riskOpen} onOpenChange={(v) => !riskBusy && setRiskOpen(v)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Análise de risco da proposta</DialogTitle>
          </DialogHeader>
          {riskBusy && <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Analisando proposta…</div>}
          {!riskBusy && riskResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase text-muted-foreground">Chance de vitória</div>
                    <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{riskResult.chance_vitoria}%</div>
                  </CardContent>
                </Card>
                <Card className={
                  riskResult.nivel_risco === "alto" ? "bg-gradient-to-br from-red-500/10 to-red-500/5" :
                  riskResult.nivel_risco === "medio" ? "bg-gradient-to-br from-amber-500/10 to-amber-500/5" :
                  "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5"
                }>
                  <CardContent className="p-4">
                    <div className="text-xs uppercase text-muted-foreground">Nível de risco</div>
                    <div className="text-3xl font-bold mt-1 capitalize">{riskResult.nivel_risco}</div>
                  </CardContent>
                </Card>
              </div>
              <div className="text-sm leading-relaxed bg-muted/50 p-3 rounded-md">{riskResult.resumo}</div>
              {riskResult.pontos_fortes.length > 0 && (
                <div>
                  <div className="font-semibold text-sm mb-2 text-emerald-600 dark:text-emerald-400">✓ Pontos fortes</div>
                  <ul className="space-y-1 text-sm list-disc pl-5">{riskResult.pontos_fortes.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {riskResult.pontos_atencao.length > 0 && (
                <div>
                  <div className="font-semibold text-sm mb-2 text-amber-600 dark:text-amber-400">⚠ Pontos de atenção</div>
                  <ul className="space-y-1 text-sm list-disc pl-5">{riskResult.pontos_atencao.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {riskResult.recomendacoes.length > 0 && (
                <div>
                  <div className="font-semibold text-sm mb-2 text-primary">💡 Recomendações</div>
                  <ul className="space-y-1 text-sm list-disc pl-5">{riskResult.recomendacoes.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRiskOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}


