import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Lock, ArrowRight } from "lucide-react";
import { useGoalsConfigured } from "@/hooks/useGoalsConfigured";
import { Skeleton } from "@/components/ui/skeleton";

interface GoalsGateProps {
  children: ReactNode;
  /** Período (YYYY-MM-DD) a verificar. Default: mês atual. */
  period?: string;
  /** Quando true, libera mesmo sem metas (ex.: admin já está na tela de metas). */
  bypass?: boolean;
}

/**
 * Bloqueia o conteúdo dos dashboards até que ao menos uma meta válida
 * (negócio, setor ou funcionário) esteja cadastrada para o período.
 */
export function GoalsGate({ children, period, bypass = false }: GoalsGateProps) {
  const { configured, loading } = useGoalsConfigured(period);

  if (bypass) return <>{children}</>;
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (configured) return <>{children}</>;

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="size-5 text-warning" />
          Configuração inicial obrigatória
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          <strong>Defina as metas para iniciar o uso do sistema.</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          Os dashboards e indicadores só são liberados após a definição de pelo
          menos uma meta — em nível de negócio, setor ou funcionário. Isso
          garante que os percentuais de atingimento, rankings e alertas tenham
          base confiável.
        </p>
        <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
          <li>Negócio (Licitação, Posto, Crédito)</li>
          <li>Setor (vinculado a um negócio)</li>
          <li>Funcionário (herda do setor/negócio se vazio)</li>
        </ul>
        <Button asChild>
          <Link to="/equipe/metas">
            <Target className="size-4 mr-1" /> Configurar metas agora
            <ArrowRight className="size-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
