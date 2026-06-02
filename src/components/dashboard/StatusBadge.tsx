import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  status: string;
  resultado?: string | null;
  hasPendingResponses?: boolean;
  className?: string;
}

/**
 * Cores padronizadas:
 * - Verde: ganha / fechada
 * - Vermelho: perdida
 * - Amarelo: em andamento
 * - Azul: aguardando retorno (respostas em processamento)
 * - Cinza: cancelada / rascunho
 */
export function StatusBadge({ status, resultado, hasPendingResponses, className }: Props) {
  let label = status;
  let tone = "muted";

  if (resultado === "ganha") { label = "Ganha"; tone = "success"; }
  else if (resultado === "perdida") { label = "Perdida"; tone = "destructive"; }
  else if (resultado === "cancelada" || status === "cancelada") { label = "Cancelada"; tone = "neutral"; }
  else if (hasPendingResponses) { label = "Aguardando retorno"; tone = "info"; }
  else if (status === "rascunho") { label = "Rascunho"; tone = "neutral"; }
  else { label = labelFor(status); tone = "warning"; }

  const map: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200",
    destructive: "bg-red-100 text-red-800 hover:bg-red-100 border-red-200 dark:bg-red-900/40 dark:text-red-200",
    warning: "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200",
    info: "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200",
    neutral: "bg-muted text-muted-foreground hover:bg-muted",
    muted: "bg-muted text-muted-foreground hover:bg-muted",
  };

  return <Badge variant="outline" className={cn(map[tone], "border", className)}>{label}</Badge>;
}

function labelFor(s: string) {
  const map: Record<string, string> = {
    em_cotacao: "Em cotação",
    cotado: "Cotado",
    em_analise: "Em análise",
    finalizada: "Finalizada",
    gerada: "Gerada",
  };
  return map[s] || s;
}
