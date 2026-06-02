import { useAuth, AppRole } from "@/hooks/useAuth";

export type TipoCotacao = "empreendimentos" | "medicamentos";

/**
 * Lista de tipos de cotação que o usuário atual pode visualizar.
 * Admin: vê todos. Outros: apenas dos papéis atribuídos.
 */
export function useAllowedTipos(): TipoCotacao[] {
  const { isAdmin, roles } = useAuth();
  if (isAdmin) return ["empreendimentos", "medicamentos"];
  return (roles.filter((r) => r === "empreendimentos" || r === "medicamentos") as TipoCotacao[]);
}

export function roleToTipo(r: AppRole): TipoCotacao | null {
  if (r === "empreendimentos" || r === "medicamentos") return r;
  return null;
}
