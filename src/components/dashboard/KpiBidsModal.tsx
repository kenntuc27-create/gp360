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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { fmtBRL } from "@/lib/format";

interface KpiBidItem {
  id: string;
  orgao: string | null;
  processo: string | null;
  status: string;
  resultado: string | null;
  created_at: string;
  profit?: number | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  data: KpiBidItem[];
}

export function KpiBidsModal({ isOpen, onClose, title, description, data }: Props) {
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
                  <TableHead>Processo</TableHead>
                  <TableHead>Órgão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead className="text-right">Lucro/Prejuízo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[100px] text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      Nenhuma licitação encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((bid) => (
                    <TableRow key={bid.id}>
                      <TableCell className="font-medium text-xs truncate max-w-[150px]">
                        {bid.processo || "—"}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[200px]" title={bid.orgao || ""}>
                        {bid.orgao || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {bid.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {bid.resultado ? (
                          <Badge 
                            variant={bid.resultado === "ganha" ? "success" : "destructive"} 
                            className="text-[10px] uppercase"
                          >
                            {bid.resultado}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs">
                        {bid.profit !== undefined && bid.profit !== null ? (
                          <span className={bid.profit > 0 ? "text-emerald-600" : bid.profit < 0 ? "text-red-600" : ""}>
                            {fmtBRL(bid.profit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(bid.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link to="/central/$id" params={{ id: bid.id }}>
                          <Button size="icon" variant="ghost" className="size-8">
                            <ExternalLink className="size-4" />
                          </Button>
                        </Link>
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
