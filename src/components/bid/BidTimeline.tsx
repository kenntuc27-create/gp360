
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const LICITATION_STATUS_STEPS = [
  { id: 'imported', label: 'Importado', desc: 'Edital importado no sistema.' },
  { id: 'pre_quoted', label: 'Pré-Cotação', desc: 'Itens em pré-cotação interna.' },
  { id: 'quoted', label: 'Cotado', desc: 'Cotações de fornecedores recebidas.' },
  { id: 'approved', label: 'Aprovado', desc: 'Proposta aprovada pela diretoria.' },
  { id: 'dispute', label: 'Em Disputa', desc: 'Licitação em fase de disputa/lance.' },
  { id: 'won', label: 'Ganho', desc: 'Licitação ganha (aguardando homologação).' },
  { id: 'homologated', label: 'Homologado', desc: 'Resultado homologado pelo órgão.' },
  { id: 'invoiced', label: 'Faturado', desc: 'Nota fiscal emitida.' },
  { id: 'delivered', label: 'Entregue', desc: 'Mercadoria entregue ao órgão.' },
  { id: 'received', label: 'Recebido', desc: 'Pagamento recebido.' },
  { id: 'closed', label: 'Encerrado', desc: 'Processo finalizado.' },
];

const STATUS_ALIAS: Record<string, string> = {
  rascunho: 'imported',
  em_cotacao: 'pre_quoted',
  cotado: 'quoted',
  em_analise: 'approved',
  approved: 'approved',
  gerada: 'approved',
  finalizada: 'closed',
};

interface BidTimelineProps {
  currentStatus: string;
}

export function BidTimeline({ currentStatus }: BidTimelineProps) {
  const normalizedStatus = STATUS_ALIAS[currentStatus] || currentStatus;
  const currentIndex = Math.max(0, LICITATION_STATUS_STEPS.findIndex(s => s.id === normalizedStatus));

  return (
    <TooltipProvider delayDuration={150}>
      <div className="w-full py-4 overflow-x-auto">
        <div className="flex items-center min-w-max px-4">
          {LICITATION_STATUS_STEPS.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div key={step.id} className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-1.5 relative cursor-help">
                      <div className={`size-7 rounded-full flex items-center justify-center border-2 transition-all ${
                        isCompleted ? 'bg-primary border-primary text-primary-foreground' :
                        isCurrent ? 'bg-background border-primary text-primary shadow-sm animate-pulse' :
                        'bg-background border-muted text-muted-foreground'
                      }`}>
                        {isCompleted ? <CheckCircle2 className="size-4" /> :
                         isCurrent ? <Clock className="size-4" /> :
                         <Circle className="size-4 opacity-30" />}
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap ${
                        isCurrent ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                    <p className="font-semibold mb-0.5">{step.label}</p>
                    <p className="text-muted-foreground">{step.desc}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide">
                      {isCompleted ? '✓ Concluído' : isCurrent ? '● Etapa atual' : '○ Pendente'}
                    </p>
                  </TooltipContent>
                </Tooltip>

                {index < LICITATION_STATUS_STEPS.length - 1 && (
                  <div className={`h-[2px] w-8 mx-2 mb-4 transition-all ${
                    index < currentIndex ? 'bg-primary' : 'bg-muted'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
