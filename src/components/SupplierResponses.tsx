import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileUp, Trash2, Sparkles, Trophy, Download, AlertTriangle, Check, Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { extractTextFromFile } from "@/lib/parseDocs";
import { fmtBRL } from "@/lib/format";
import ExcelJS from "exceljs";

interface BidItem {
  id: string;
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
}

interface Supplier { id: string; razao_social: string; }

interface SupplierResponse {
  id: string;
  supplier_id: string;
  response_date: string;
  proposal_validity: string;
  observations: string;
  source_file_name: string;
  freight_value?: number;
}

interface ItemPrice {
  id: string;
  response_id: string;
  bid_item_id: string;
  valor_unitario: number;
  marca: string;
  prazo: string;
  observacao: string;
  unidade_fornecedor?: string;
  preco_embalagem_fornecedor?: number;
  fator_conversao?: number;
  needs_review?: boolean;
  divergence_reason?: string;
}

export function SupplierResponses({ bidId, items }: { bidId: string; items: BidItem[] }) {
  const { isAdmin } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [responses, setResponses] = useState<SupplierResponse[]>([]);
  const [prices, setPrices] = useState<ItemPrice[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    const [{ data: sup }, { data: resps }] = await Promise.all([
      supabase.from("suppliers").select("id, razao_social").order("razao_social"),
      supabase.from("bid_supplier_responses").select("*").eq("bid_id", bidId).order("created_at"),
    ]);
    setSuppliers((sup as Supplier[]) || []);
    setResponses((resps as SupplierResponse[]) || []);
    if (resps && resps.length) {
      const ids = resps.map((r) => r.id);
      const { data: pr } = await supabase.from("bid_supplier_item_prices").select("*").in("response_id", ids);
      setPrices((pr as ItemPrice[]) || []);
    } else {
      setPrices([]);
    }
  }

  useEffect(() => { load(); }, [bidId]);

  async function importResponse() {
    if (!supplierId || !file) {
      toast.error("Selecione fornecedor e arquivo");
      return;
    }
    if (!items.length) {
      toast.error("A cotação não tem itens");
      return;
    }
    setBusy(true);
    try {
      setStep("Lendo arquivo…");
      const rawText = await extractTextFromFile(file);
      if (rawText.length < 20) throw new Error("Não consegui extrair texto do arquivo");

      setStep("Enviando arquivo…");
      const ext = file.name.split(".").pop() || "bin";
      const path = `${bidId}/${supplierId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("supplier-quotes").upload(path, file);
      if (upErr) throw upErr;

      // Cria/atualiza response ANTES de chamar a IA — extração roda em background
      setStep("Preparando…");
      const { data: existing } = await supabase
        .from("bid_supplier_responses")
        .select("id")
        .eq("bid_id", bidId).eq("supplier_id", supplierId).maybeSingle();

      let responseId: string;
      if (existing?.id) {
        responseId = existing.id;
        await supabase.from("bid_supplier_responses").update({
          source_file_name: file.name,
          source_file_url: path,
          raw_text: rawText.slice(0, 20000),
          response_date: new Date().toISOString().slice(0, 10),
          extraction_status: "pending",
          extraction_progress: 0,
          extraction_total: items.length,
          extraction_error: "",
        }).eq("id", responseId);
      } else {
        const { data: created, error: cErr } = await supabase.from("bid_supplier_responses").insert({
          bid_id: bidId,
          supplier_id: supplierId,
          source_file_name: file.name,
          source_file_url: path,
          raw_text: rawText.slice(0, 20000),
          extraction_status: "pending",
          extraction_total: items.length,
        }).select("id").single();
        if (cErr) throw cErr;
        responseId = created!.id;
      }

      setStep("IA extraindo preços (em segundo plano)…");
      const itemsPayload = items.map((i) => ({
        id: i.id, item_number: i.item_number, descricao: i.descricao,
        unidade: i.unidade, quantidade: i.quantidade,
      }));
      const { data: aiRes, error: aiErr } = await supabase.functions.invoke("extract-supplier-quote", {
        body: { responseId, rawText, items: itemsPayload },
      });
      if (aiErr) throw aiErr;
      if ((aiRes as { error?: string })?.error) throw new Error((aiRes as { error: string }).error);

      // Polling do status — até 15 minutos
      const startedAt = Date.now();
      const MAX_WAIT_MS = 15 * 60 * 1000;
      let lastProgress = -1;
      while (Date.now() - startedAt < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data: status } = await supabase
          .from("bid_supplier_responses")
          .select("extraction_status, extraction_progress, extraction_total, extraction_error")
          .eq("id", responseId).maybeSingle();
        if (!status) continue;
        if (status.extraction_progress !== lastProgress) {
          lastProgress = status.extraction_progress || 0;
          setStep(`Extraindo: ${status.extraction_progress || 0}/${status.extraction_total || 0} itens…`);
        }
        if (status.extraction_status === "completed") break;
        if (status.extraction_status === "failed") {
          throw new Error(status.extraction_error || "Falha na extração");
        }
      }

      // Recalcula divergências comparando com pares já importados
      setStep("Analisando divergências…");
      const { data: peerPrices } = await supabase
        .from("bid_supplier_item_prices")
        .select("bid_item_id, valor_unitario, response_id")
        .in("bid_item_id", items.map((i) => i.id));
      const peersByItem = new Map<string, number[]>();
      (peerPrices || []).forEach((p) => {
        if (p.response_id === responseId) return;
        const arr = peersByItem.get(p.bid_item_id) || [];
        if (Number(p.valor_unitario) > 0) arr.push(Number(p.valor_unitario));
        peersByItem.set(p.bid_item_id, arr);
      });
      const median = (arr: number[]) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      };

      const { data: myPrices } = await supabase
        .from("bid_supplier_item_prices")
        .select("id, bid_item_id, valor_unitario, preco_embalagem_fornecedor, fator_conversao, unidade_fornecedor, needs_review, divergence_reason")
        .eq("response_id", responseId);

      for (const p of myPrices || []) {
        const reasons: string[] = [];
        const fator = Number(p.fator_conversao || 1);
        const precoEmb = Number(p.preco_embalagem_fornecedor || 0);
        const vu = Number(p.valor_unitario || 0);
        if (fator > 1 && precoEmb > 0 && Math.abs(vu - precoEmb) < 0.01) {
          reasons.push(`Possível conversão de embalagem não aplicada (${p.unidade_fornecedor} fator ${fator}).`);
        }
        const med = median(peersByItem.get(p.bid_item_id) || []);
        if (med > 0 && vu > 0) {
          const ratio = vu / med;
          if (ratio >= 3) reasons.push(`Preço ${ratio.toFixed(1)}× acima da mediana (R$ ${med.toFixed(2)}).`);
          else if (ratio <= 0.33) reasons.push(`Preço ${(1 / ratio).toFixed(1)}× abaixo da mediana (R$ ${med.toFixed(2)}).`);
        }
        const needs = reasons.length > 0 || p.needs_review;
        const reason = reasons.join(" ");
        if (needs !== p.needs_review || reason !== (p.divergence_reason || "")) {
          await supabase.from("bid_supplier_item_prices")
            .update({ needs_review: needs, divergence_reason: reason })
            .eq("id", p.id);
        }
      }

      const total = (myPrices || []).length;
      const flagged = (myPrices || []).filter((p) => p.needs_review).length;
      toast.success(`Importado: ${total} itens` + (flagged ? ` — ${flagged} para revisar` : ""));
      setOpen(false);
      setFile(null);
      setSupplierId("");
      await load();
    } catch (e) {
      console.error("[importResponse]", e);
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  async function removeResponse(id: string) {
    if (!confirm("Remover esta resposta? Todos os preços importados deste fornecedor para esta cotação serão apagados.")) return;
    try {
      // 1) buscar resposta para pegar arquivo
      const resp = responses.find((r) => r.id === id);

      // 2) remover preços filhos primeiro (não há FK cascade)
      const { error: delPricesErr } = await supabase
        .from("bid_supplier_item_prices")
        .delete()
        .eq("response_id", id);
      if (delPricesErr) throw delPricesErr;

      // 3) remover a resposta
      const { error: delRespErr } = await supabase
        .from("bid_supplier_responses")
        .delete()
        .eq("id", id);
      if (delRespErr) throw delRespErr;

      // 4) tentar remover arquivo do storage (não bloqueia)
      if (resp?.source_file_name) {
        const path = (resp as SupplierResponse & { source_file_url?: string }).source_file_url;
        if (path) {
          await supabase.storage.from("supplier-quotes").remove([path]).catch(() => {});
        }
      }

      // 5) atualizar UI imediatamente (sem esperar reload)
      setPrices((prev) => prev.filter((p) => p.response_id !== id));
      setResponses((prev) => prev.filter((r) => r.id !== id));

      toast.success("Cotação do fornecedor removida");
      await load();
    } catch (e) {
      console.error("[removeResponse]", e);
      toast.error(`Erro ao remover: ${(e as Error).message}`);
    }
  }

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  async function savePriceEdit(price: ItemPrice) {
    const novo = Number(editValue.replace(",", "."));
    if (!Number.isFinite(novo) || novo < 0) {
      toast.error("Valor inválido");
      return;
    }
    await supabase.from("bid_supplier_item_prices").update({
      valor_unitario: novo,
      needs_review: false,
      divergence_reason: "",
    }).eq("id", price.id);
    setPrices((prev) => prev.map((p) => p.id === price.id ? { ...p, valor_unitario: novo, needs_review: false, divergence_reason: "" } : p));
    setEditing(null);
    toast.success("Preço corrigido");
  }

  async function acceptPrice(price: ItemPrice) {
    await supabase.from("bid_supplier_item_prices").update({
      needs_review: false,
      divergence_reason: "",
    }).eq("id", price.id);
    setPrices((prev) => prev.map((p) => p.id === price.id ? { ...p, needs_review: false, divergence_reason: "" } : p));
  }

  function priceFor(responseId: string, itemId: string) {
    return prices.find((p) => p.response_id === responseId && p.bid_item_id === itemId);
  }

  function bestForItem(itemId: string): string | null {
    const candidates = prices.filter((p) => p.bid_item_id === itemId && p.valor_unitario > 0);
    if (!candidates.length) return null;
    return candidates.reduce((min, c) => (c.valor_unitario < min.valor_unitario ? c : min)).response_id;
  }

  function supplierName(id: string) {
    return suppliers.find((s) => s.id === id)?.razao_social || "—";
  }

  async function exportComparativo() {
    if (!responses.length) {
      toast.error("Nenhuma resposta para exportar");
      return;
    }
    // Buscar tipo_cotacao para escolher o logo certo
    const { data: bidData } = await supabase.from("bids").select("tipo_cotacao").eq("id", bidId).single();
    const tipo = (bidData?.tipo_cotacao as string) || "empreendimentos";
    const logoUrl = tipo === "medicamentos" ? "/logo-medicamentos.png" : "/logo-empreendimentos.png";
    const nomeEmpresa = tipo === "medicamentos" ? "Pará Medicamentos" : "Pará Empreendimentos";

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Comparativo", { views: [{ state: "frozen", xSplit: 4, ySplit: 4 }] });

    // Inserir logo (tolerante a falhas)
    try {
      const r = await fetch(logoUrl);
      if (r.ok) {
        const buf = await r.arrayBuffer();
        const imgId = wb.addImage({ buffer: buf, extension: "png" });
        ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 110, height: 60 } });
      }
    } catch (err) {
      console.warn("Logo não pôde ser inserida no comparativo:", err);
    }

    // Cabeçalho da empresa
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 16;
    ws.getRow(3).height = 8;
    ws.getCell("B1").value = nomeEmpresa;
    ws.getCell("B1").font = { bold: true, size: 16, color: { argb: "FF0F3460" } };
    ws.getCell("B2").value = "Comparativo de Fornecedores";
    ws.getCell("B2").font = { size: 11, color: { argb: "FF555555" } };

    const header = ["#", "Descrição", "Un.", "Qtd."];
    responses.forEach((r) => {
      const name = supplierName(r.supplier_id);
      header.push(`${name} - V. Unit.`, `${name} - V. Total`, `${name} - Marca`, `${name} - Prazo`, `${name} - Obs.`);
    });
    ws.getRow(4).values = header;
    const headerRow = ws.getRow(4);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3460" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 28;

    items.forEach((it) => {
      const bestRespId = bestForItem(it.id);
      const row: (string | number)[] = [it.item_number, it.descricao, it.unidade, Number(it.quantidade) || 0];
      responses.forEach((r) => {
        const p = priceFor(r.id, it.id);
        const vu = p?.valor_unitario || 0;
        row.push(vu, vu * (Number(it.quantidade) || 0), p?.marca || "", p?.prazo || "", p?.observacao || "");
      });
      const added = ws.addRow(row);
      // destacar melhor preço
      responses.forEach((r, idx) => {
        if (bestRespId === r.id) {
          const colVU = 5 + idx * 5;
          const colVT = colVU + 1;
          [colVU, colVT].forEach((c) => {
            const cell = added.getCell(c);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
            cell.font = { bold: true, color: { argb: "FF065F46" } };
          });
        }
      });
      added.getCell(4).numFmt = "#,##0.##";
      responses.forEach((_, idx) => {
        added.getCell(5 + idx * 5).numFmt = '"R$" #,##0.00';
        added.getCell(6 + idx * 5).numFmt = '"R$" #,##0.00';
      });
      added.alignment = { vertical: "middle", wrapText: true };
    });

    // Totais
    const totalRow: (string | number)[] = ["", "TOTAL", "", ""];
    responses.forEach((r) => {
      const total = items.reduce((s, it) => {
        const p = priceFor(r.id, it.id);
        return s + (p ? p.valor_unitario * it.quantidade : 0);
      }, 0);
      totalRow.push("", total, "", "", "");
    });
    const tr = ws.addRow(totalRow);
    tr.font = { bold: true };
    tr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    responses.forEach((_, idx) => {
      tr.getCell(6 + idx * 5).numFmt = '"R$" #,##0.00';
    });

    // Larguras
    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 45;
    ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 8;
    responses.forEach((_, idx) => {
      ws.getColumn(5 + idx * 5).width = 14;
      ws.getColumn(6 + idx * 5).width = 14;
      ws.getColumn(7 + idx * 5).width = 16;
      ws.getColumn(8 + idx * 5).width = 12;
      ws.getColumn(9 + idx * 5).width = 24;
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comparativo_fornecedores_${bidId.slice(0, 8)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Comparativo exportado");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Respostas dos Fornecedores ({responses.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">A IA lê PDF/Excel e preenche os preços automaticamente.</p>
        </div>
        <div className="flex items-center gap-2">
          {responses.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportComparativo}>
              <Download className="size-4 mr-1" />Exportar Excel
            </Button>
          )}
          <Button size="sm" onClick={() => setOpen(true)}>
            <FileUp className="size-4 mr-1" />Importar resposta
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {responses.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhuma resposta importada. Clique em "Importar resposta" para anexar um PDF ou Excel de fornecedor.
          </div>
        ) : (
          <>
          {prices.some((p) => p.needs_review) && (
            <div className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
              <div>
                <strong>{prices.filter((p) => p.needs_review).length} preço(s) com possível divergência</strong> de embalagem ou fora da faixa dos demais fornecedores. Passe o mouse no ícone para ver o motivo, edite o valor (✏️) ou clique em "Aceitar valor" antes de gerar o resultado.
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left min-w-[240px]">Descrição</th>
                  {responses.map((r) => (
                    <th key={r.id} className="px-3 py-2 text-left border-l">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold normal-case">{supplierName(r.supplier_id)}</span>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeResponse(r.id)}>
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                      {r.proposal_validity && (
                        <div className="text-[10px] font-normal text-muted-foreground normal-case mt-0.5">
                          Validade: {r.proposal_validity}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-1 normal-case">
                        <Label className="text-[10px] font-normal text-muted-foreground">Frete R$:</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-6 w-20 text-[11px] px-1"
                          defaultValue={r.freight_value || ""}
                          onBlur={async (e) => {
                            const v = Number(e.target.value) || 0;
                            await supabase.from("bid_supplier_responses").update({ freight_value: v }).eq("id", r.id);
                            setResponses((prev) => prev.map((x) => x.id === r.id ? { ...x, freight_value: v } : x));
                          }}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const bestRespId = bestForItem(it.id);
                  return (
                    <tr key={it.id} className="border-t align-top">
                      <td className="px-3 py-2">{it.item_number}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{it.descricao}</div>
                        <div className="text-muted-foreground text-[11px]">{it.quantidade} {it.unidade}</div>
                      </td>
                      {responses.map((r) => {
                        const p = priceFor(r.id, it.id);
                        const isBest = bestRespId === r.id;
                        return (
                          <td key={r.id} className={`px-3 py-2 border-l ${p?.needs_review ? "bg-warning/10" : isBest ? "bg-success/10" : ""}`}>
                            {p ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 font-semibold">
                                  {p.needs_review && (
                                    <TooltipProvider><Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertTriangle className="size-3.5 text-warning shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        <div className="font-semibold mb-1">Possível divergência</div>
                                        <div>{p.divergence_reason}</div>
                                        {p.unidade_fornecedor && (
                                          <div className="mt-1 text-muted-foreground">
                                            Embalagem fornecedor: {p.unidade_fornecedor} • bruto {fmtBRL(p.preco_embalagem_fornecedor || 0)} ÷ {p.fator_conversao || 1}
                                          </div>
                                        )}
                                      </TooltipContent>
                                    </Tooltip></TooltipProvider>
                                  )}
                                  {isBest && !p.needs_review && <Trophy className="size-3 text-success" />}
                                  {editing === p.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        className="h-6 w-20 text-xs px-1"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        autoFocus
                                      />
                                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => savePriceEdit(p)}>
                                        <Check className="size-3 text-success" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <span>{fmtBRL(p.valor_unitario)}</span>
                                      <Button size="icon" variant="ghost" className="h-5 w-5 opacity-50 hover:opacity-100"
                                        onClick={() => { setEditing(p.id); setEditValue(String(p.valor_unitario)); }}>
                                        <Pencil className="size-3" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                                {p.needs_review && editing !== p.id && (
                                  <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5"
                                    onClick={() => acceptPrice(p)}>
                                    Aceitar valor
                                  </Button>
                                )}
                                {p.marca && <div className="text-muted-foreground">{p.marca}</div>}
                                {p.prazo && <Badge variant="outline" className="text-[10px] h-4">{p.prazo}</Badge>}
                                {p.observacao && <div className="text-[10px] text-muted-foreground italic">{p.observacao}</div>}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Totais por fornecedor */}
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td colSpan={2} className="px-3 py-2 text-right">Total (com frete):</td>
                  {responses.map((r) => {
                    const total = items.reduce((sum, it) => {
                      const p = priceFor(r.id, it.id);
                      return sum + (p ? p.valor_unitario * it.quantidade : 0);
                    }, 0);
                    const totalComFrete = total + (Number(r.freight_value) || 0);
                    return (
                      <td key={r.id} className="px-3 py-2 border-l">{fmtBRL(totalComFrete)}</td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Observações gerais */}
        {responses.some((r) => r.observations) && (
          <div className="border-t mt-2 px-4 py-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase">Observações gerais</div>
            {responses.filter((r) => r.observations).map((r) => (
              <div key={r.id} className="text-xs">
                <span className="font-medium">{supplierName(r.supplier_id)}:</span>{" "}
                <span className="text-muted-foreground">{r.observations}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Importar resposta de fornecedor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Fornecedor</Label>
              <select
                className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.razao_social}</option>)}
              </select>
              {suppliers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Cadastre fornecedores em <strong>Fornecedores</strong>.</p>
              )}
            </div>
            <div>
              <Label>Arquivo (PDF ou Excel)</Label>
              <Input
                type="file"
                accept=".pdf,.xlsx,.xls,.docx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name}</p>}
            </div>
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />{step}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={importResponse} disabled={busy || !supplierId || !file}>
              <Sparkles className="size-4 mr-2" />Extrair com IA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
