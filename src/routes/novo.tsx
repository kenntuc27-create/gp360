import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Sparkles, FileText, Archive } from "lucide-react";
import { extractEdital } from "@/lib/extract.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";
import { useAllowedTipos } from "@/hooks/useAllowedTipos";
import { ExtractionPreview } from "@/components/bid/ExtractionPreview";
import { ImportStatusTracker } from "@/components/bid/ImportStatusTracker";


export const Route = createFileRoute("/novo")({ component: NovoEdital });

function NovoEdital() {
  const navigate = useNavigate();
  const allowed = useAllowedTipos();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<string>("");
  const [tipo, setTipo] = useState<"empreendimentos" | "medicamentos">(allowed[0] || "empreendimentos");
  const [extractedData, setExtractedData] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [importId, setImportId] = useState<string | null>(null);


  async function handleZipFile(zipFile: File) {
    const zip = new JSZip();
    const contents = await zip.loadAsync(zipFile);
    const pdfFile = Object.values(contents.files).find(f => f.name.toLowerCase().endsWith(".pdf"));
    
    if (!pdfFile) throw new Error("Nenhum PDF encontrado dentro do arquivo ZIP.");
    
    const blob = await pdfFile.async("blob");
    return new File([blob], pdfFile.name, { type: "application/pdf" });
  }

  async function processFile() {
    if (!file) return;
    setBusy(true);
    try {
      let activeFile = file;

      if (file.name.toLowerCase().endsWith(".zip")) {
        setStep("Extraindo conteúdo do ZIP...");
        activeFile = await handleZipFile(file);
        toast.info(`PDF localizado: ${activeFile.name}`);
      }

      if (activeFile.size > 100 * 1024 * 1024) {
        toast.error("Arquivo muito grande (máx 100MB).");
        setBusy(false); return;
      }

      setStep("Enviando arquivo para nuvem...");
      const path = `${Date.now()}_${activeFile.name.replace(/\W+/g, "_")}`;
      const up = await supabase.storage.from("editais").upload(path, activeFile, { upsert: true });
      
      if (up.error) {
        throw new Error(`Falha no upload do arquivo: ${up.error.message}`);
      }
      
      const publicUrl = supabase.storage.from("editais").getPublicUrl(path).data.publicUrl;
      setFileUrl(publicUrl);

      setStep("Registrando importação...");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const { data: imp, error: impErr } = await supabase
        .from("edital_imports")
        .insert({
          user_id: userData.user.id,
          file_path: path,
          file_name: activeFile.name,
          status: "pending",
          metadata: { tipo_cotacao: tipo }
        })
        .select()
        .single();

      if (impErr || !imp) throw new Error(`Falha ao registrar importação: ${impErr?.message}`);

      setImportId(imp.id);
      setStep("Iniciando motor de OCR profissional...");

      // Trigger the edge function
      const { error: fnErr } = await supabase.functions.invoke("importar-edital", {
        body: { importId: imp.id }
      });

      if (fnErr) throw new Error(`Falha ao chamar motor de extração: ${fnErr.message}`);

      toast.info("Importação iniciada. Acompanhe o progresso abaixo.");
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao processar: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    } finally {
      setStep("");
    }
  }


  async function confirmAndSave() {
    if (!extractedData) return;
    setSaving(true);
    try {
      const ex = extractedData;
      const nz = (v: any) => (v === "" || v === undefined ? null : v);
      const { data: bid, error: bidErr } = await supabase.from("bids").insert({
        orgao: ex.orgao,
        uasg: nz(ex.uasg),
        processo: ex.processo,
        objeto: ex.objeto,
        modalidade: nz(ex.modalidade),
        data_abertura: ex.data_abertura || "",
        data_inicio_propostas: nz(ex.data_inicio_propostas),
        data_encerramento_propostas: nz(ex.data_encerramento_propostas),
        data_limite_entrega: nz(ex.data_limite_entrega),
        prazo_entrega: nz(ex.prazo_entrega),
        prazo_pagamento: nz(ex.prazo_pagamento),
        local_entrega: nz(ex.local_entrega),
        orgao_pagador: nz(ex.orgao_pagador),
        endereco_orgao: nz(ex.endereco_orgao),
        cidade_orgao: nz(ex.cidade_orgao),
        estado_orgao: nz(ex.estado_orgao),
        valor_total_estimado: Number(ex.valor_total_estimado) || 0,
        source_file_url: fileUrl,
        source_file_name: file?.name || "edital.pdf",
        status: "rascunho",
        tipo_cotacao: tipo,
        extraction_method: nz(ex.extraction_method),
        extraction_score: Number(ex.extraction_score) || 0,
        segment_id: nz(ex.detected_segment_id),
      } as any).select().single();

      if (bidErr || !bid) throw new Error(`Falha ao salvar cotação: ${bidErr?.message}`);

      const itemsPayload = (ex.items || []).map((it: any, i: number) => ({
        bid_id: bid.id,
        item_number: it.item_number || i + 1,
        descricao: it.descricao || "",
        unidade: it.unidade || "UN",
        quantidade: Number(it.quantidade) || 1,
        valor_unitario: Number(it.valor_unitario) || 0,
        estimated_value: Number(it.valor_unitario) || 0,
        valor_estimado_total:
          Number(it.valor_total) ||
          (Number(it.valor_unitario) || 0) * (Number(it.quantidade) || 1),
        marca: it.marca || "",
        needs_review: !it.valor_unitario,
        status: !it.valor_unitario ? "pendente" : "ok",
        lote: it.lote || null,
        catmat: it.catmat || null,
        me_epp: !!it.me_epp,
      }));

      if (itemsPayload.length === 0) {
        throw new Error("Nenhum item para salvar — a extração retornou lista vazia.");
      }

      const { error: itemsErr } = await supabase.from("bid_items").insert(itemsPayload);
      if (itemsErr) throw new Error(`Falha ao salvar itens: ${itemsErr.message}`);


      toast.success("Cotação salva com sucesso!");
      navigate({ to: "/edital/$id", params: { id: bid.id } });
    } catch (e) {
      toast.error(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Central de Cotação · Importar Edital">
      <div className="max-w-5xl mx-auto">
        {!extractedData && !importId ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                Motor de Importação Profissional (Backend OCR)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-2 block">Tipo de Cotação</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { v: "empreendimentos" as const, label: "Pará Empreendimentos", logo: "/logo-empreendimentos.png" },
                    { v: "medicamentos" as const, label: "Pará Medicamentos", logo: "/logo-medicamentos.png" },
                  ].filter((opt) => allowed.includes(opt.v)).map((opt) => {
                    const active = tipo === opt.v;
                    return (
                      <button key={opt.v} type="button" onClick={() => setTipo(opt.v)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all ${
                          active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                        }`}>
                        <img src={opt.logo} alt="" className="h-10 object-contain bg-white rounded px-2 py-1" />
                        <span className="font-medium text-sm text-left">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-2 border-dashed border-border rounded-lg p-10 text-center hover:border-primary/50 transition-colors bg-muted/30">
                <Upload className="size-12 mx-auto text-muted-foreground mb-3" />
                <Label htmlFor="file" className="cursor-pointer">
                  <div className="font-medium text-lg">Clique ou arraste o edital</div>
                  <div className="text-sm text-muted-foreground mt-1">PDF, ZIP ou DOCX (Até 100MB)</div>
                </Label>
                <Input id="file" type="file" accept=".pdf,.docx,.zip" className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
                {file && (
                  <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-card rounded-md border-2 border-primary/20 text-sm font-medium">
                    {file.name.toLowerCase().endsWith(".zip") ? <Archive className="size-4" /> : <FileText className="size-4" />}
                    {file.name}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground max-w-md">
                  O novo motor assíncrono utiliza OCR profissional e IA estruturadora de alto desempenho.
                  Ideal para editais extensos e tabelas complexas.
                </p>
                <Button disabled={!file || busy} onClick={processFile} size="lg" className="px-8">
                  {busy ? <><Loader2 className="size-4 animate-spin mr-2" />{step || "Iniciando…"}</> : <>Iniciar Processamento <Sparkles className="size-4 ml-2" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : importId && !extractedData ? (
          <div className="space-y-6">
            <ImportStatusTracker 
              importId={importId} 
              onComplete={(data) => {
                setExtractedData(data);
                toast.success("Extração finalizada com sucesso!");
              }}
              onCancel={() => {
                setImportId(null);
                setBusy(false);
              }}
            />
            <Button variant="outline" onClick={() => setImportId(null)}>
              Cancelar e Voltar
            </Button>
          </div>
        ) : (
          <ExtractionPreview 
            data={extractedData} 
            onConfirm={confirmAndSave} 
            onCancel={() => {
              setExtractedData(null);
              setImportId(null);
              setBusy(false);
            }} 
            busy={saving} 
          />
        )}

      </div>
    </AppShell>
  );
}
