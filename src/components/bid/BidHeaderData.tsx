import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Globe, Lock, FileUp, FileSpreadsheet, RefreshCw, Calculator, MapPin, User, Phone, Mail as MailIcon, Clock, DollarSign, Truck, CreditCard, Home, LucideIcon } from "lucide-react";
import { fmtBRL } from "@/lib/format";

interface Bid {
  orgao?: string;
  secretaria?: string;
  uasg?: string;
  modalidade?: string;
  processo?: string;
  tipo_disputa?: string;
  criterio_julgamento?: string;
  portal_disputa?: string;
  data_abertura?: string;
  cidade_uf?: string;
  contato_responsavel?: string;
  telefone_contato?: string;
  email_contato?: string;
  valor_total_estimado?: number;
  orgao_pagador?: string;
  prazo_entrega?: string;
  prazo_pagamento?: string;
  local_entrega?: string;
}

interface BidHeaderDataProps {
  bid: Bid;
  totalEdital: number;
}

function HeaderField({ label, value, icon: Icon, bold }: { label: string; value?: string | number; icon: LucideIcon; bold?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-border/40 last:border-0 lg:border-0">
      <div className="mt-0.5 size-7 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
        <Icon className="size-4 text-primary/70" />
      </div>
      <div className="space-y-0.5 min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
        <p className={`text-sm truncate leading-tight ${bold ? "font-bold text-primary" : "text-foreground font-medium"}`}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export function BidHeaderData({ bid, totalEdital }: BidHeaderDataProps) {
  return (
    <Card className="border-primary/20 bg-muted/20 shadow-sm overflow-hidden">
      <CardHeader className="py-2 px-4 border-b bg-primary/5">
        <CardTitle className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-primary/80">
          <Building className="size-3.5" /> Dados Estratégicos do Edital
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-2">
        <HeaderField label="Órgão" value={bid.orgao} icon={Building} />
        <HeaderField label="Secretaria" value={bid.secretaria} icon={Globe} />
        <HeaderField label="UASG" value={bid.uasg} icon={Lock} />
        <HeaderField label="Modalidade" value={bid.modalidade} icon={FileUp} />
        <HeaderField label="Processo" value={bid.processo} icon={FileSpreadsheet} />
        <HeaderField label="Tipo da Disputa" value={bid.tipo_disputa} icon={RefreshCw} />
        <HeaderField label="Critério" value={bid.criterio_julgamento} icon={Calculator} />
        <HeaderField label="Portal" value={bid.portal_disputa} icon={Globe} />
        <HeaderField label="Sessão" value={bid.data_abertura} icon={Clock} />
        <HeaderField label="Cidade/UF" value={bid.cidade_uf} icon={MapPin} />
        <HeaderField label="Responsável" value={bid.contato_responsavel} icon={User} />
        <HeaderField label="Telefone" value={bid.telefone_contato} icon={Phone} />
        <HeaderField label="E-mail" value={bid.email_contato} icon={MailIcon} />
        <HeaderField label="Órgão Pagador" value={bid.orgao_pagador} icon={Building} />
        <HeaderField label="Prazo de Entrega" value={bid.prazo_entrega} icon={Truck} />
        <HeaderField label="Prazo de Pagamento" value={bid.prazo_pagamento} icon={CreditCard} />
        <HeaderField label="Local de Entrega" value={bid.local_entrega} icon={Home} />
        <HeaderField 
          label="Estimativa Total" 
          value={totalEdital > 0 ? fmtBRL(totalEdital) : "—"} 
          icon={DollarSign} 
          bold 
        />
      </CardContent>
    </Card>
  );
}
