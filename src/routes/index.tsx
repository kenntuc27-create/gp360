import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardDiretoria } from "@/components/dashboard/DashboardDiretoria";
import { DashboardGerencial } from "@/components/dashboard/DashboardGerencial";
import { DashboardOperacional } from "@/components/dashboard/DashboardOperacional";

export const Route = createFileRoute("/")({ component: DashboardSwitch });

function DashboardSwitch() {
  const { isAdmin, nivelAcesso, hasOperationalAccess, roles, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!hasOperationalAccess) {
      navigate({ to: "/equipe" });
    }
  }, [loading, user, hasOperationalAccess, navigate]);

  if (loading || !user || !hasOperationalAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Diretoria: admin ou usuários com acesso a empreendimentos/medicamentos (visão executiva)
  if (isAdmin || nivelAcesso === "admin" || roles.includes("empreendimentos") || roles.includes("medicamentos")) {
    return <DashboardDiretoria />;
  }

  if (nivelAcesso === "gerente" || roles.includes("gerente")) {
    return <DashboardGerencial />;
  }

  return <DashboardOperacional />;
}
