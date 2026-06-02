import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Upload, FileSignature, Trash2, FileDown, ArrowLeft, Loader2, ExternalLink, DollarSign, History as HistoryIcon } from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";
import { generateAcceptanceTermPdf } from "@/lib/acceptanceTermPdf";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/edital/$id/pos-entrega")({ component: PosEntregaPage });

const STATUS_OPTIONS = [
  { v: "aguardando_entrega", label: "Aguardando entrega", tone: "bg-slate-100 text-slate-700" },
  { v: "entregue", label: "Entregue", tone: "bg-blue-100 text-blue-800" },
  { v: "aguardando_aceite", label: "Aguardando aceite", tone: "bg-amber-100 text-amber-800" },
  { v: "aceite_parcial", label: "Aceite parcial", tone: "bg-amber-100 text-amber-800" },
  { v: "aceite_concluido", label: "Aceite concluído", tone: "bg-emerald-100 text-emerald-800" },
  { v: "em_analise", label: "Em análise do órgão", tone: "bg-blue-100 text-blue-800" },
  { v: "aguardando_pagamento", label: "Aguardando pagamento", tone: "bg-amber-100 text-amber-800" },
  { v: "pago", label: "Pago", tone: "bg-emerald-100 text-emerald-800" },
  { v: "finalizado", label: "Finalizado", tone: "bg-emerald-200 text-emerald-900" },
];

const CHECKLIST_FIELDS = [
  { k: "nfe_emitida", label: "NF-e emitida" },
  { k: "danfe_anexada", label: "DANFE anexada" },
  { k: "empenho_anexado", label: "Empenho anexado" },
  { k: "of_anexada", label: "Ordem de fornecimento anexada" },
  { k: "mercadoria_entregue", label: "Mercadoria entregue" },
  { k: "termo_assinado", label: "Termo assinado" },
  { k: "evidencias_anexadas", label: "Evidências anexadas" },
  { k: "confirmacao_orgao", label: "Confirmação do órgão recebida" },
] as const;

type ChecklistKey = typeof CHECKLIST_FIELDS[number]["k"];

interface Bid {
  id: string; orgao: string; processo: string; modalidade: string; objeto: string;
  uasg?: string; local_entrega?: string; tipo_cotacao: "empreendimentos" | "medicamentos";
}
interface Delivery {
  id: string; bid_id: string; delivery_date: string | null; delivery_time: string | null;
  responsavel: string; transportadora: string; nfe_numero: string; nfe_chave: string;
  empenho_numero: string; ordem_fornecimento: string; local_entrega: string;
  observacoes: string; status: string;
  paid_amount?: number | null; paid_at?: string | null;
}
interface Checklist extends Record<ChecklistKey, boolean> { id: string; delivery_id: string }
interface Evidence {
  id: string; tipo: string; nome: string; url: string; size_bytes: number; mime_type: string; uploaded_at: string;
}
interface Acceptance {
  id?: string; delivery_id?: string;
  servidor_nome: string; servidor_cargo: string; servidor_matricula: string; servidor_cpf: string;
  orgao_setor: string; signature_data_url: string; acceptance_date: string;
  pdf_url: string; observacoes: string;
}
interface Item { item_number: number; descricao: string; marca: string; modelo: string; unidade: string; quantidade: number; venceu: boolean }

const emptyAcceptance: Acceptance = {
  servidor_nome: "", servidor_cargo: "", servidor_matricula: "", servidor_cpf: "",
  orgao_setor: "", signature_data_url: "", acceptance_date: new Date().toISOString().slice(0, 10),
  pdf_url: "", observacoes: "",
};

function PosEntregaPage() {
  const { id } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bid, setBid] = useState<Bid | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [acceptance, setAcceptance] = useState<Acceptance>(emptyAcceptance);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: its }, { data: d }] = await Promise.all([
      supabase.from("bids").select("id,orgao,processo,modalidade,objeto,uasg,local_entrega,tipo_cotacao").eq("id", id).single(),
      supabase.from("bid_items").select("item_number,descricao,marca,modelo,unidade,quantidade,venceu").eq("bid_id", id).order("item_number"),
      supabase.from("bid_deliveries").select("*").eq("bid_id", id).maybeSingle(),
    ]);
    setBid(b as Bid);
    setItems((its as Item[]) || []);
    if (d) {
      setDelivery(d as Delivery);
      const [{ data: ch }, { data: ev }, { data: ac }] = await Promise.all([
        supabase.from("bid_delivery_checklist").select("*").eq("delivery_id", d.id).maybeSingle(),
        supabase.from("bid_delivery_evidences").select("*").eq("delivery_id", d.id).order("uploaded_at", { ascending: false }),
        supabase.from("bid_delivery_acceptance").select("*").eq("delivery_id", d.id).maybeSingle(),
      ]);
      setChecklist((ch as Checklist) || null);
      setEvidences((ev as Evidence[]) || []);
      if (ac) setAcceptance({ ...emptyAcceptance, ...(ac as Acceptance) });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function patchDelivery<K extends keyof Delivery>(k: K, v: Delivery[K]) {
    setDelivery((p) => p ? { ...p, [k]: v } : ({
      id: "", bid_id: id, delivery_date: null, delivery_time: null, responsavel: "", transportadora: "",
      nfe_numero: "", nfe_chave: "", empenho_numero: "", ordem_fornecimento: "", local_entrega: bid?.local_entrega || "",
      observacoes: "", status: "aguardando_entrega", [k]: v,
    } as Delivery));
  }

  async function saveDelivery() {
    setSaving(true);
    try {
      const payload = {
        bid_id: id,
        delivery_date: delivery?.delivery_date || null,
        delivery_time: delivery?.delivery_time || null,
        responsavel: delivery?.responsavel || "",
        transportadora: delivery?.transportadora || "",
        nfe_numero: delivery?.nfe_numero || "",
        nfe_chave: delivery?.nfe_chave || "",
        empenho_numero: delivery?.empenho_numero || "",
        ordem_fornecimento: delivery?.ordem_fornecimento || "",
        local_entrega: delivery?.local_entrega || "",
        observacoes: delivery?.observacoes || "",
        status: delivery?.status || "aguardando_entrega",
        paid_amount: delivery?.paid_amount || null,
        paid_at: delivery?.paid_at || null,
      };
      let did = delivery?.id;
      if (did) {
        const { error } = await supabase.from("bid_deliveries").update(payload).eq("id", did);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("bid_deliveries").insert(payload).select("id").single();
        if (error) throw error;
        did = (data as { id: string }).id;
      }
      // garante checklist
      if (did && !checklist) {
        await supabase.from("bid_delivery_checklist").insert({ delivery_id: did });
      }
      toast.success("Entrega salva");
      await load();
    } catch (e) {
      toast.error("Erro ao salvar", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleCheck(k: ChecklistKey, v: boolean) {
    if (!delivery?.id || !checklist) return;
    const next = { ...checklist, [k]: v };
    setChecklist(next);
    const update: Record<string, boolean> = { [k]: v };
    const { error } = await supabase.from("bid_delivery_checklist").update(update as never).eq("delivery_id", delivery.id);
    if (error) toast.error("Erro ao atualizar checklist");
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !delivery?.id) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("delivery-evidences").upload(path, file);
        if (upErr) throw upErr;
        const { data: url } = await supabase.storage.from("delivery-evidences").createSignedUrl(path, 60 * 60 * 24 * 365);
        const tipo = guessType(file.name, file.type);
        await supabase.from("bid_delivery_evidences").insert({
          delivery_id: delivery.id, tipo, nome: file.name, url: path,
          size_bytes: file.size, mime_type: file.type,
        });
        // url variável usado apenas via signed url quando abrir
        void url;
      }
      toast.success("Arquivos enviados");
      await load();
    } catch (e) {
      toast.error("Falha no upload", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }

  async function deleteEvidence(ev: Evidence) {
    if (!confirm(`Excluir ${ev.nome}?`)) return;
    await supabase.storage.from("delivery-evidences").remove([ev.url]);
    await supabase.from("bid_delivery_evidences").delete().eq("id", ev.id);
    toast.success("Removido");
    await load();
  }

  async function openEvidence(ev: Evidence) {
    const { data } = await supabase.storage.from("delivery-evidences").createSignedUrl(ev.url, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function saveAcceptanceAndGenerate() {
    if (!delivery?.id || !bid) { toast.error("Salve a entrega antes"); return; }
    if (!acceptance.servidor_nome) { toast.error("Informe o nome do servidor"); return; }
    setGenerating(true);
    try {
      const blob = await generateAcceptanceTermPdf({
        tipo_cotacao: bid.tipo_cotacao,
        bid: { orgao: bid.orgao, processo: bid.processo, modalidade: bid.modalidade, objeto: bid.objeto, uasg: bid.uasg, local_entrega: bid.local_entrega },
        delivery: {
          delivery_date: delivery.delivery_date, nfe_numero: delivery.nfe_numero, nfe_chave: delivery.nfe_chave,
          empenho_numero: delivery.empenho_numero, ordem_fornecimento: delivery.ordem_fornecimento,
          transportadora: delivery.transportadora, responsavel: delivery.responsavel,
        },
        acceptance,
        items: items.filter((i) => i.venceu).length > 0 ? items.filter((i) => i.venceu) : items,
      });

      const path = `${id}/termo-aceite-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from("delivery-evidences").upload(path, blob, { contentType: "application/pdf" });
      if (upErr) throw upErr;

      const payload = { ...acceptance, delivery_id: delivery.id, pdf_url: path };
      delete (payload as { id?: string }).id;
      if (acceptance.id) {
        await supabase.from("bid_delivery_acceptance").update(payload).eq("id", acceptance.id);
      } else {
        await supabase.from("bid_delivery_acceptance").insert(payload);
      }
      // marca checklist termo assinado
      if (checklist) await toggleCheck("termo_assinado", true);

      // download local
      const localUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = localUrl; a.download = `termo-aceite-${bid.processo || bid.id}.pdf`; a.click();
      URL.revokeObjectURL(localUrl);

      toast.success("Termo gerado e arquivado");
      await load();
    } catch (e) {
      toast.error("Erro ao gerar termo", { description: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  const checklistComplete = checklist ? CHECKLIST_FIELDS.every((f) => checklist[f.k]) : false;
  const checklistDone = checklist ? CHECKLIST_FIELDS.filter((f) => checklist[f.k]).length : 0;
  const statusOpt = STATUS_OPTIONS.find((s) => s.v === (delivery?.status || "aguardando_entrega"))!;

  if (loading) return <AppShell><div className="p-8 text-center"><Loader2 className="size-6 animate-spin mx-auto" /></div></AppShell>;
  if (!bid) return <AppShell><div className="p-8 text-center text-muted-foreground">Licitação não encontrada</div></AppShell>;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <Link to="/edital/$id" params={{ id }} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"><ArrowLeft className="size-3" />Voltar ao edital</Link>
            <PageHeader title="Pós-Entrega e Aceite" description={`${bid.orgao || "Órgão"} • ${bid.processo || "Processo"}`} />
          </div>
          <Badge className={`${statusOpt.tone} text-sm px-3 py-1`}>{statusOpt.label}</Badge>
        </div>

        {/* Cadastro da entrega */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">1. Cadastro da Entrega</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Data da entrega</Label><Input type="date" value={delivery?.delivery_date || ""} onChange={(e) => patchDelivery("delivery_date", e.target.value || null)} /></div>
            <div><Label>Hora</Label><Input type="time" value={delivery?.delivery_time || ""} onChange={(e) => patchDelivery("delivery_time", e.target.value || null)} /></div>
            <div>
              <Label>Status</Label>
              <Select value={delivery?.status || "aguardando_entrega"} onValueChange={(v) => patchDelivery("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Responsável pela entrega</Label><Input value={delivery?.responsavel || ""} onChange={(e) => patchDelivery("responsavel", e.target.value)} /></div>
            <div><Label>Transportadora</Label><Input value={delivery?.transportadora || ""} onChange={(e) => patchDelivery("transportadora", e.target.value)} /></div>
            <div><Label>NF-e nº</Label><Input value={delivery?.nfe_numero || ""} onChange={(e) => patchDelivery("nfe_numero", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Chave da NF-e (44 dígitos)</Label><Input value={delivery?.nfe_chave || ""} onChange={(e) => patchDelivery("nfe_chave", e.target.value)} maxLength={44} /></div>
            <div><Label>Empenho nº</Label><Input value={delivery?.empenho_numero || ""} onChange={(e) => patchDelivery("empenho_numero", e.target.value)} /></div>
            <div><Label>Ordem de Fornecimento</Label><Input value={delivery?.ordem_fornecimento || ""} onChange={(e) => patchDelivery("ordem_fornecimento", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Local da entrega</Label><Input value={delivery?.local_entrega || ""} onChange={(e) => patchDelivery("local_entrega", e.target.value)} /></div>
            <div className="md:col-span-3"><Label>Observações</Label><Textarea rows={2} value={delivery?.observacoes || ""} onChange={(e) => patchDelivery("observacoes", e.target.value)} /></div>
            <div className="md:col-span-3 flex justify-end">
              <Button onClick={saveDelivery} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}Salvar entrega</Button>
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">2. Checklist de Entrega</CardTitle>
            <Badge variant={checklistComplete ? "default" : "secondary"}>{checklistDone}/{CHECKLIST_FIELDS.length}</Badge>
          </CardHeader>
          <CardContent>
            {!delivery?.id ? (
              <p className="text-sm text-muted-foreground">Salve a entrega para liberar o checklist.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {CHECKLIST_FIELDS.map((f) => (
                  <label key={f.k} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={!!checklist?.[f.k]} onCheckedChange={(v) => toggleCheck(f.k, !!v)} />
                    <span className="text-sm">{f.label}</span>
                  </label>
                ))}
              </div>
            )}
            {checklist && !checklistComplete && (
              <p className="text-xs text-amber-700 mt-3">⚠ A licitação não pode ser finalizada até que o checklist esteja 100%.</p>
            )}
          </CardContent>
        </Card>

        {/* Evidências */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">3. Evidências e Documentos</CardTitle></CardHeader>
          <CardContent>
            {!delivery?.id ? (
              <p className="text-sm text-muted-foreground">Salve a entrega para enviar arquivos.</p>
            ) : (
              <>
                <label
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition-colors block"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}
                >
                  <Upload className="size-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">Arraste arquivos ou clique para enviar (fotos, vídeos, NF-e XML/DANFE, PDFs, prints)</p>
                  <input type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} disabled={uploading} />
                </label>
                {evidences.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {evidences.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between p-2 border rounded text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{ev.nome}</div>
                          <div className="text-xs text-muted-foreground">{ev.tipo} • {(ev.size_bytes / 1024).toFixed(1)} KB • {fmtDate(ev.uploaded_at)}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEvidence(ev)}><ExternalLink className="size-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteEvidence(ev)}><Trash2 className="size-4 text-destructive" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Financeiro e Pagamento */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">5. Financeiro e Pagamento</CardTitle>
            {delivery?.status === 'pago' && <Badge className="bg-emerald-100 text-emerald-800">Pago</Badge>}
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!delivery?.id ? (
              <p className="text-sm text-muted-foreground col-span-2">Salve a entrega para gerenciar o pagamento.</p>
            ) : (
              <>
                <div>
                  <Label>Valor Recebido (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={delivery.paid_amount || 0} 
                    onChange={(e) => patchDelivery("paid_amount", Number(e.target.value))} 
                  />
                </div>
                <div>
                  <Label>Data do Pagamento</Label>
                  <Input 
                    type="date" 
                    value={delivery.paid_at?.slice(0, 10) || ""} 
                    onChange={(e) => patchDelivery("paid_at", e.target.value ? new Date(e.target.value).toISOString() : null)} 
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={saveDelivery} variant="outline" disabled={saving}>
                    <DollarSign className="size-4 mr-2" />
                    Registrar Pagamento
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Termo de aceite */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">4. Termo de Recebimento e Aceite</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!delivery?.id ? (
              <p className="text-sm text-muted-foreground">Salve a entrega para gerar o termo.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label>Nome do servidor</Label><Input value={acceptance.servidor_nome} onChange={(e) => setAcceptance({ ...acceptance, servidor_nome: e.target.value })} /></div>
                  <div><Label>Cargo</Label><Input value={acceptance.servidor_cargo} onChange={(e) => setAcceptance({ ...acceptance, servidor_cargo: e.target.value })} /></div>
                  <div><Label>Matrícula</Label><Input value={acceptance.servidor_matricula} onChange={(e) => setAcceptance({ ...acceptance, servidor_matricula: e.target.value })} /></div>
                  <div><Label>CPF</Label><Input value={acceptance.servidor_cpf} onChange={(e) => setAcceptance({ ...acceptance, servidor_cpf: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>Setor / Secretaria</Label><Input value={acceptance.orgao_setor} onChange={(e) => setAcceptance({ ...acceptance, orgao_setor: e.target.value })} /></div>
                  <div><Label>Data do recebimento</Label><Input type="date" value={acceptance.acceptance_date} onChange={(e) => setAcceptance({ ...acceptance, acceptance_date: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>Observações (opcional)</Label><Textarea rows={2} value={acceptance.observacoes} onChange={(e) => setAcceptance({ ...acceptance, observacoes: e.target.value })} /></div>
                </div>

                <div>
                  <Label>Assinatura digital</Label>
                  <SignaturePad value={acceptance.signature_data_url} onChange={(v) => setAcceptance({ ...acceptance, signature_data_url: v })} />
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveAcceptanceAndGenerate} disabled={generating}>
                    {generating ? <Loader2 className="size-4 animate-spin mr-2" /> : <FileSignature className="size-4 mr-2" />}
                    Gerar Termo de Aceite (PDF)
                  </Button>
                </div>

                {acceptance.pdf_url && (
                  <div className="p-2 border rounded flex items-center justify-between text-sm bg-muted/30">
                    <span>Termo arquivado</span>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const { data } = await supabase.storage.from("delivery-evidences").createSignedUrl(acceptance.pdf_url, 600);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    }}><FileDown className="size-4 mr-1" />Abrir</Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function guessType(name: string, mime: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xml")) return "xml_nfe";
  if (lower.includes("danfe")) return "danfe";
  if (lower.includes("empenho")) return "empenho";
  if (lower.includes("of") || lower.includes("ordem")) return "ordem_fornecimento";
  if (mime.startsWith("image/")) return "foto";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "outro";
}
