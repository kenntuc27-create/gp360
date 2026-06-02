import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Save, X } from "lucide-react";
import { fmtBRL } from "@/lib/format";

interface ExtractedItem {
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  marca?: string;
  needs_review?: boolean;
  confidence?: number;
}


interface ExtractedData {
  orgao: string;
  uasg?: string;
  processo: string;
  objeto: string;
  modalidade?: string;
  numero_pregao?: string;
  portal_disputa?: string;
  data_abertura?: string;
  data_encerramento_propostas?: string;
  orgao_pagador?: string;
  endereco_orgao?: string;
  cidade_orgao?: string;
  estado_orgao?: string;
  prazo_entrega?: string;
  prazo_pagamento?: string;
  local_entrega?: string;
  items: ExtractedItem[];
  valor_total_estimado?: number;
}

interface ExtractionPreviewProps {
  data: ExtractedData;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{String(value)}</span>
    </div>
  );
}

export function ExtractionPreview({ data, onConfirm, onCancel, busy }: ExtractionPreviewProps) {
  const itemsWithReview = data.items.filter(i => i.needs_review).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Revisar Extração Inteligente</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            <X className="size-4 mr-2" /> Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Salvando..." : <><Save className="size-4 mr-2" /> Confirmar e Salvar</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Dados do Edital</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="Órgão Comprador" value={data.orgao} />
            <InfoRow label="UASG" value={data.uasg} />
            <InfoRow label="Processo" value={data.processo} />
            <InfoRow label="Modalidade / Nº" value={[data.modalidade, data.numero_pregao].filter(Boolean).join(" — ")} />
            <InfoRow label="Portal" value={data.portal_disputa} />
            <InfoRow label="Abertura" value={data.data_abertura} />
            <InfoRow label="Encerramento das Propostas" value={data.data_encerramento_propostas} />
            <InfoRow label="Órgão Pagador" value={data.orgao_pagador} />
            <InfoRow label="Endereço" value={data.endereco_orgao} />
            <InfoRow label="Cidade / UF" value={[data.cidade_orgao, data.estado_orgao].filter(Boolean).join(" / ")} />
            <InfoRow label="Prazo de Entrega" value={data.prazo_entrega} />
            <InfoRow label="Prazo de Pagamento" value={data.prazo_pagamento} />
            <InfoRow label="Local de Entrega" value={data.local_entrega} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Resumo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground uppercase">Valor Total Estimado</p>
            <p className="font-bold text-2xl text-primary">{fmtBRL(data.valor_total_estimado || 0)}</p>
            <p className="text-sm text-muted-foreground mt-3">{data.items.length} itens detectados</p>
            {data.objeto && (
              <>
                <p className="text-xs text-muted-foreground uppercase mt-4 mb-1">Objeto</p>
                <p className="text-xs line-clamp-6" title={data.objeto}>{data.objeto}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>


      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-base">Lista de Itens Extraídos</CardTitle>
          {itemsWithReview > 0 && (
            <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200 gap-1">
              <AlertTriangle className="size-3" /> {itemsWithReview} itens precisam de revisão
            </Badge>
          )}
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left w-16">#</th>
                  <th className="px-4 py-2 text-left">Descrição</th>
                  <th className="px-4 py-2 text-center w-16">Un.</th>
                  <th className="px-4 py-2 text-right w-24">Qtd.</th>
                  <th className="px-4 py-2 text-right w-32">Vlr. Unitário</th>
                  <th className="px-4 py-2 text-center w-24">Confiança</th>
                  <th className="px-4 py-2 text-center w-24">Status</th>

                </tr>
              </thead>
              <tbody>
                {data.items.map((it, idx) => (
                  <tr key={idx} className={`border-t ${it.needs_review ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-4 py-3 font-medium">{it.item_number}</td>
                    <td className="px-4 py-3">
                      <p className="line-clamp-2" title={it.descricao}>{it.descricao}</p>
                      {it.marca && <p className="text-[10px] text-muted-foreground mt-0.5">Marca sugerida: {it.marca}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">{it.unidade}</td>
                    <td className="px-4 py-3 text-right">{it.quantidade}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBRL(it.valor_unitario)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-bold ${it.confidence && it.confidence < 0.8 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {it.confidence ? `${(it.confidence * 100).toFixed(0)}%` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">

                      {it.needs_review ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-200">Revisar</Badge>
                      ) : (
                        <CheckCircle2 className="size-4 text-emerald-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-primary">Pronto para processar</p>
          <p className="text-muted-foreground">
            Ao confirmar, os dados acima serão salvos e você será redirecionado para a central de cotação para convocar fornecedores.
          </p>
        </div>
      </div>
    </div>
  );
}
