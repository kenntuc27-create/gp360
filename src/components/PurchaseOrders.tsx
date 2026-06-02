import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, FileDown, FileSpreadsheet, MessageCircle, Copy } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { openWhatsApp } from "@/lib/supplierQuoteXlsx";
import { loadCompany, type CompanyData } from "@/lib/proposalPdf";

interface BidItem {
  id: string;
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
}

interface Supplier {
  id: string;
  razao_social: string;
  cnpj: string | null;
  contato: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  cidade: string | null;
}

interface SupplierResponse {
  id: string;
  supplier_id: string;
  proposal_validity: string | null;
}

interface ItemPrice {
  id: string;
  response_id: string;
  bid_item_id: string;
  valor_unitario: number;
  frete_unitario: number | null;
  imposto_pct: number | null;
  marca: string | null;
  prazo: string | null;
  observacao: string | null;
}

function custoTotal(p: { valor_unitario: number; frete_unitario?: number | null; imposto_pct?: number | null }) {
  const base = Number(p.valor_unitario || 0);
  const frete = Number(p.frete_unitario || 0);
  const imp = Number(p.imposto_pct || 0);
  return base + frete + base * imp / 100;
}

interface BidInfo {
  id: string;
  tipo_cotacao: string;
  objeto: string | null;
  processo: string | null;
  prazo_entrega: string | null;
  local_entrega: string | null;
}

interface WinnerLine {
  item: BidItem;
  price: ItemPrice;
}

export function PurchaseOrders({ bidId, items }: { bidId: string; items: BidItem[] }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [responses, setResponses] = useState<SupplierResponse[]>([]);
  const [prices, setPrices] = useState<ItemPrice[]>([]);
  const [bid, setBid] = useState<BidInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: sup }, { data: resps }, { data: bidData }] = await Promise.all([
      supabase.from("suppliers").select("id, razao_social, cnpj, contato, email, telefone, whatsapp, cidade"),
      supabase.from("bid_supplier_responses").select("id, supplier_id, proposal_validity").eq("bid_id", bidId),
      supabase.from("bids").select("id, tipo_cotacao, objeto, processo, prazo_entrega, local_entrega").eq("id", bidId).single(),
    ]);
    setSuppliers((sup as Supplier[]) || []);
    setResponses((resps as SupplierResponse[]) || []);
    setBid((bidData as BidInfo) || null);
    if (resps && resps.length) {
      const ids = resps.map((r) => r.id);
      const { data: pr } = await supabase.from("bid_supplier_item_prices").select("*").in("response_id", ids);
      setPrices((pr as ItemPrice[]) || []);
    } else {
      setPrices([]);
    }
  }

  useEffect(() => { load(); }, [bidId]);

  // Agrupa vencedores (menor preço) por fornecedor
  const winners = useMemo(() => {
    const map = new Map<string, WinnerLine[]>(); // supplier_id -> linhas
    items.forEach((it) => {
      const candidates = prices.filter((p) => p.bid_item_id === it.id && p.valor_unitario > 0);
      if (!candidates.length) return;
      const best = candidates.reduce((m, c) => (custoTotal(c) < custoTotal(m) ? c : m));
      const resp = responses.find((r) => r.id === best.response_id);
      if (!resp) return;
      const arr = map.get(resp.supplier_id) || [];
      arr.push({ item: it, price: best });
      map.set(resp.supplier_id, arr);
    });
    return map;
  }, [items, prices, responses]);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.razao_social || "—";
  const supplierFull = (id: string) => suppliers.find((s) => s.id === id);
  const totalFor = (lines: WinnerLine[]) =>
    lines.reduce((s, l) => s + custoTotal(l.price) * Number(l.item.quantidade || 0), 0);

  function brandConfig() {
    const tipo = bid?.tipo_cotacao || "empreendimentos";
    return {
      tipo,
      logoUrl: tipo === "medicamentos" ? "/logo-medicamentos.png" : "/logo-empreendimentos.png",
      nome: tipo === "medicamentos" ? "Pará Medicamentos" : "Pará Empreendimentos",
      corHex: "#0F3460",
    };
  }

  async function fetchLogoBuffer(url: string): Promise<ArrayBuffer | null> {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.arrayBuffer();
    } catch { return null; }
  }

  async function exportPdf(supplierId: string, lines: WinnerLine[]) {
    const sup = supplierFull(supplierId);
    const brand = brandConfig();
    const company = await loadCompany(brand.tipo as "empreendimentos" | "medicamentos");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Logo
    const logoBuf = await fetchLogoBuffer(brand.logoUrl);
    if (logoBuf) {
      try {
        const uint8 = new Uint8Array(logoBuf);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < uint8.length; i += chunk) {
          binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
        }
        const b64 = btoa(binary);
        doc.addImage(`data:image/png;base64,${b64}`, "PNG", 14, 10, 28, 16);
      } catch { /* ignore */ }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(brand.corHex);
    doc.text(brand.nome, 46, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80);
    if (company?.razao_social) doc.text(company.razao_social, 46, 19);
    const linhaCnpj = [
      company?.cnpj ? `CNPJ: ${company.cnpj}` : null,
      company?.inscricao_estadual ? `IE: ${company.inscricao_estadual}` : null,
    ].filter(Boolean).join("  ·  ");
    if (linhaCnpj) doc.text(linhaCnpj, 46, 23);
    const linhaEnd = [company?.endereco, company?.bairro, company?.cidade && `${company.cidade}/${company.estado || ""}`, company?.cep && `CEP ${company.cep}`].filter(Boolean).join(", ");
    if (linhaEnd) doc.text(linhaEnd, 46, 27);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(brand.corHex);
    doc.text("PEDIDO DE COMPRA", pageW - 14, 16, { align: "right" });

    doc.setDrawColor(220);
    doc.line(14, 31, pageW - 14, 31);

    // Dados do fornecedor + pedido
    doc.setFontSize(9);
    doc.setTextColor(40);
    let y = 37;
    doc.setFont("helvetica", "bold");
    doc.text("FORNECEDOR", 14, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    doc.text(`${sup?.razao_social || "—"}`, 14, y); y += 4;
    if (sup?.cnpj) { doc.text(`CNPJ: ${sup.cnpj}`, 14, y); y += 4; }
    if (sup?.contato) { doc.text(`Contato: ${sup.contato}`, 14, y); y += 4; }
    const tel = sup?.whatsapp || sup?.telefone;
    if (tel) { doc.text(`Telefone: ${tel}`, 14, y); y += 4; }
    if (sup?.email) { doc.text(`E-mail: ${sup.email}`, 14, y); y += 4; }

    let yr = 37;
    doc.setFont("helvetica", "bold");
    doc.text("PEDIDO", pageW / 2 + 5, yr);
    doc.setFont("helvetica", "normal");
    yr += 5;
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageW / 2 + 5, yr); yr += 4;
    if (bid?.processo) { doc.text(`Processo: ${bid.processo}`, pageW / 2 + 5, yr); yr += 4; }
    if (bid?.prazo_entrega) { doc.text(`Prazo entrega: ${bid.prazo_entrega}`, pageW / 2 + 5, yr); yr += 4; }
    if (bid?.local_entrega) {
      const split = doc.splitTextToSize(`Local: ${bid.local_entrega}`, pageW / 2 - 20);
      doc.text(split, pageW / 2 + 5, yr); yr += 4 * split.length;
    }

    const startY = Math.max(y, yr) + 4;

    // Tabela de itens
    const total = totalFor(lines);
    autoTable(doc, {
      startY,
      head: [["#", "Descrição", "Marca", "Un.", "Qtd.", "V. Unit.", "Total"]],
      body: lines.map((l) => [
        l.item.item_number,
        l.item.descricao,
        l.price.marca || "—",
        l.item.unidade || "UN",
        Number(l.item.quantidade || 0).toLocaleString("pt-BR"),
        fmtBRL(custoTotal(l.price)),
        fmtBRL(custoTotal(l.price) * Number(l.item.quantidade || 0)),
      ]),
      foot: [["", "", "", "", "", "TOTAL", fmtBRL(total)]],
      headStyles: { fillColor: [15, 52, 96], textColor: 255, fontSize: 9 },
      footStyles: { fillColor: [238, 238, 238], textColor: 20, fontStyle: "bold" },
      bodyStyles: { fontSize: 8.5, valign: "middle" },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 22 },
        3: { cellWidth: 10, halign: "center" },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 24, halign: "right" },
        6: { cellWidth: 26, halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text("Observações:", 14, finalY);
    doc.setDrawColor(220);
    doc.rect(14, finalY + 2, pageW - 28, 22);

    // Rodapé com dados oficiais da empresa emitente
    const footerY = pageH - 14;
    doc.setDrawColor(200);
    doc.line(14, footerY - 2, pageW - 14, footerY - 2);
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    if (company?.razao_social) doc.text(company.razao_social, 14, footerY + 1);
    const rod = [
      company?.cnpj ? `CNPJ ${company.cnpj}` : null,
      company?.inscricao_estadual ? `IE ${company.inscricao_estadual}` : null,
      company?.endereco,
      company?.cidade && `${company.cidade}/${company.estado || ""}`,
      company?.telefone,
      company?.email,
    ].filter(Boolean).join("  ·  ");
    if (rod) doc.text(rod, 14, footerY + 5);
    doc.text(`Pedido gerado em ${new Date().toLocaleString("pt-BR")}`, pageW - 14, footerY + 5, { align: "right" });

    doc.save(`pedido_${(sup?.razao_social || "fornecedor").replace(/\s+/g, "_")}.pdf`);
  }

  async function exportExcel(supplierId: string, lines: WinnerLine[]) {
    const sup = supplierFull(supplierId);
    const brand = brandConfig();
    const company = await loadCompany(brand.tipo as "empreendimentos" | "medicamentos");

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Pedido", { views: [{ state: "frozen", ySplit: 8 }] });

    const logoBuf = await fetchLogoBuffer(brand.logoUrl);
    if (logoBuf) {
      try {
        const imgId = wb.addImage({ buffer: logoBuf, extension: "png" });
        ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 110, height: 60 } });
      } catch { /* ignore */ }
    }

    ws.getRow(1).height = 22;
    ws.getCell("B1").value = brand.nome;
    ws.getCell("B1").font = { bold: true, size: 16, color: { argb: "FF0F3460" } };
    ws.getCell("B2").value = company?.razao_social || "";
    ws.getCell("B2").font = { bold: true, size: 10, color: { argb: "FF333333" } };
    ws.getCell("B3").value = [
      company?.cnpj ? `CNPJ: ${company.cnpj}` : null,
      company?.inscricao_estadual ? `IE: ${company.inscricao_estadual}` : null,
    ].filter(Boolean).join("  ·  ");
    ws.getCell("B3").font = { size: 9, color: { argb: "FF555555" } };
    ws.getCell("F1").value = "PEDIDO DE COMPRA";
    ws.getCell("F1").font = { bold: true, size: 14, color: { argb: "FF0F3460" } };

    ws.getCell("A4").value = "Fornecedor:";
    ws.getCell("A4").font = { bold: true };
    ws.getCell("B4").value = sup?.razao_social || "";
    ws.getCell("A5").value = "CNPJ:";
    ws.getCell("A5").font = { bold: true };
    ws.getCell("B5").value = sup?.cnpj || "";
    ws.getCell("D4").value = "Data:";
    ws.getCell("D4").font = { bold: true };
    ws.getCell("E4").value = new Date().toLocaleDateString("pt-BR");
    ws.getCell("D5").value = "Processo:";
    ws.getCell("D5").font = { bold: true };
    ws.getCell("E5").value = bid?.processo || "";

    const headerRow = ws.getRow(7);
    headerRow.values = ["#", "Descrição", "Marca", "Un.", "Qtd.", "V. Unitário", "Total"];
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3460" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;

    lines.forEach((l) => {
      const qtd = Number(l.item.quantidade || 0);
      const r = ws.addRow([
        l.item.item_number,
        l.item.descricao,
        l.price.marca || "",
        l.item.unidade || "UN",
        qtd,
        custoTotal(l.price),
        custoTotal(l.price) * qtd,
      ]);
      r.getCell(5).numFmt = "#,##0.##";
      r.getCell(6).numFmt = '"R$" #,##0.00';
      r.getCell(7).numFmt = '"R$" #,##0.00';
      r.alignment = { vertical: "middle", wrapText: true };
    });

    const total = totalFor(lines);
    const tr = ws.addRow(["", "", "", "", "", "TOTAL", total]);
    tr.font = { bold: true };
    tr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    tr.getCell(7).numFmt = '"R$" #,##0.00';

    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 50;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 8;
    ws.getColumn(5).width = 10;
    ws.getColumn(6).width = 16;
    ws.getColumn(7).width = 16;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedido_${(sup?.razao_social || "fornecedor").replace(/\s+/g, "_")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildWhatsappMessage(supplierId: string, lines: WinnerLine[]) {
    const sup = supplierFull(supplierId);
    const brand = brandConfig();
    const total = totalFor(lines);
    const linhas = lines.map((l) => {
      const qtd = Number(l.item.quantidade || 0);
      const subtotal = custoTotal(l.price) * qtd;
      return `${l.item.item_number}. ${l.item.descricao}${l.price.marca ? ` (${l.price.marca})` : ""}\n   ${qtd} ${l.item.unidade || "UN"} × ${fmtBRL(custoTotal(l.price))} = ${fmtBRL(subtotal)}`;
    }).join("\n\n");

    return `*PEDIDO DE COMPRA — ${brand.nome}*\n\nOlá${sup?.contato ? ` ${sup.contato}` : ""}, segue nosso pedido conforme cotação aprovada:\n\n${linhas}\n\n*TOTAL: ${fmtBRL(total)}*\n${bid?.prazo_entrega ? `\nPrazo de entrega: ${bid.prazo_entrega}` : ""}${bid?.local_entrega ? `\nLocal: ${bid.local_entrega}` : ""}\n\nAguardamos confirmação. Obrigado!`;
  }

  async function copyWhatsapp(supplierId: string, lines: WinnerLine[]) {
    const msg = buildWhatsappMessage(supplierId, lines);
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensagem copiada para a área de transferência");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function openWhatsapp(supplierId: string, lines: WinnerLine[]) {
    const sup = supplierFull(supplierId);
    const phone = sup?.whatsapp || sup?.telefone || "";
    const msg = buildWhatsappMessage(supplierId, lines);
    await openWhatsApp(phone, msg);
  }

  // Ocultamos se não houver respostas, mas o usuário quer que apareça.
  // if (responses.length === 0) {
  //   return null;
  // }

  const winnerEntries = Array.from(winners.entries());

  async function exportAllPdfs() {
    setBusy(true);
    try {
      for (const [sid, lines] of winnerEntries) {
        await exportPdf(sid, lines);
      }
      toast.success(`${winnerEntries.length} pedido(s) gerado(s)`);
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="size-4 text-primary" />
            Pedidos de Compra ({winnerEntries.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Vencedor de cada item escolhido automaticamente pelo menor preço.
          </p>
        </div>
        {winnerEntries.length > 0 && (
          <Button size="sm" variant="outline" onClick={exportAllPdfs} disabled={busy}>
            <FileDown className="size-4 mr-1" />Baixar todos PDFs
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {winnerEntries.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Nenhum vencedor identificado ainda. Importe respostas com preços para gerar pedidos.
          </div>
        ) : (
          winnerEntries.map(([sid, lines]) => {
            const sup = supplierFull(sid);
            const total = totalFor(lines);
            return (
              <div key={sid} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{sup?.razao_social}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                      {sup?.cnpj && <span>CNPJ: {sup.cnpj}</span>}
                      {(sup?.whatsapp || sup?.telefone) && <span>Tel: {sup?.whatsapp || sup?.telefone}</span>}
                      <Badge variant="secondary" className="text-[10px] h-5">{lines.length} {lines.length === 1 ? "item" : "itens"}</Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total do pedido</div>
                    <div className="text-lg font-bold text-primary">{fmtBRL(total)}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left w-10">#</th>
                        <th className="px-3 py-2 text-left">Descrição</th>
                        <th className="px-3 py-2 text-left">Marca</th>
                        <th className="px-3 py-2 text-right">Qtd.</th>
                        <th className="px-3 py-2 text-right">V. Unit.</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.item.id} className="border-t">
                          <td className="px-3 py-1.5">{l.item.item_number}</td>
                          <td className="px-3 py-1.5">{l.item.descricao}</td>
                          <td className="px-3 py-1.5">{l.price.marca || "—"}</td>
                          <td className="px-3 py-1.5 text-right">{Number(l.item.quantidade || 0).toLocaleString("pt-BR")} {l.item.unidade}</td>
                          <td className="px-3 py-1.5 text-right">{fmtBRL(custoTotal(l.price))}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{fmtBRL(custoTotal(l.price) * Number(l.item.quantidade || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t bg-muted/20 px-4 py-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => exportPdf(sid, lines)}>
                    <FileDown className="size-4 mr-1" />PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportExcel(sid, lines)}>
                    <FileSpreadsheet className="size-4 mr-1" />Excel
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openWhatsapp(sid, lines)}>
                    <MessageCircle className="size-4 mr-1" />WhatsApp
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => copyWhatsapp(sid, lines)}>
                    <Copy className="size-4 mr-1" />Copiar mensagem
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
