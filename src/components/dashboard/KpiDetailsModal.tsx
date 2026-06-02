import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtBRL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface KpiDetailItem {
  id: string;
  bid_id: string;
  orgao: string;
  descricao: string;
  quantidade: number;
  venda_un: number;
  custo_un: number;
  venda_total: number;
  custo_total: number;
  lucro: number;
  status: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  data: KpiDetailItem[];
}

export function KpiDetailsModal({ isOpen, onClose, title, description, data }: Props) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[200px]">Órgão / Licitação</TableHead>
                  <TableHead>Item / Descrição</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Venda Un.</TableHead>
                  <TableHead className="text-right">Custo Un.</TableHead>
                  <TableHead className="text-right">Venda Total</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      Nenhum registro encontrado para este indicador.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item, idx) => (
                    <TableRow key={`${item.id}-${idx}`}>
                      <TableCell className="font-medium text-xs">
                        <div className="truncate max-w-[180px]" title={item.orgao}>
                          {item.orgao}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="truncate max-w-[200px]" title={item.descricao}>
                          {item.descricao}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs">{item.quantidade}</TableCell>
                      <TableCell className="text-right text-xs">{fmtBRL(item.venda_un)}</TableCell>
                      <TableCell className="text-right text-xs">{fmtBRL(item.custo_un)}</TableCell>
                      <TableCell className="text-right font-medium text-xs">{fmtBRL(item.venda_total)}</TableCell>
                      <TableCell className={`text-right font-medium text-xs ${item.lucro >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {fmtBRL(item.lucro)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.status === 'HOMOLOGADO' || item.status === 'GANHO' ? "success" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
