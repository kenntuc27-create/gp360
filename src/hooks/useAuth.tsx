import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "empreendimentos" | "medicamentos" | "gerente" | "operacional";
export type NivelAcesso = "admin" | "gerente" | "operacional";
export type CompanyTipo = "empreendimentos" | "medicamentos";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  canSeeEmpreendimentos: boolean;
  canSeeMedicamentos: boolean;
  canSeePosto: boolean;
  canSeeCredito: boolean;
  canSeeLicitacao: boolean;
  hasOperationalAccess: boolean;
  sectorName: string | null;
  companyId: string | null;
  companyTipo: CompanyTipo | null;
  businessId: string | null;
  businessSlug: string | null;
  businessName: string | null;
  nivelAcesso: NivelAcesso;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [sectorIsOperational, setSectorIsOperational] = useState<boolean>(false);
  const [sectorName, setSectorName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyTipo, setCompanyTipo] = useState<CompanyTipo | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessSlug, setBusinessSlug] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [businessTipos, setBusinessTipos] = useState<CompanyTipo[]>([]);
  const [nivelAcesso, setNivelAcesso] = useState<NivelAcesso>("operacional");
  const [loading, setLoading] = useState(true);

  async function fetchRoles(uid: string) {
    const [{ data: rolesData }, { data: empData }, { data: profData }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("employees")
        .select("sector_id, sectors:sector_id(name, is_operational)")
        .eq("user_id", uid)
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("company_id, company_tipo, nivel_acesso, business_id")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);
    const rs = ((rolesData || []).map((r) => r.role)) as AppRole[];
    setRoles(rs);
    const sec = (empData as any)?.sectors;
    setSectorIsOperational(Boolean(sec?.is_operational));
    setSectorName(sec?.name || null);
    const prof = profData as any;
    setCompanyId(prof?.company_id || null);
    const tipoFromProfile = prof?.company_tipo as CompanyTipo | null | undefined;
    const tipoFromRoles = rs.includes("empreendimentos")
      ? "empreendimentos"
      : rs.includes("medicamentos")
      ? "medicamentos"
      : null;
    setCompanyTipo((tipoFromProfile || tipoFromRoles) as CompanyTipo | null);
    setNivelAcesso((prof?.nivel_acesso as NivelAcesso) || "operacional");

    const bizId = (prof?.business_id as string | null) || null;
    setBusinessId(bizId);
    if (bizId) {
      const [{ data: biz }, { data: bizCompanies }] = await Promise.all([
        (supabase.from("businesses" as any).select("name, slug").eq("id", bizId).maybeSingle() as any),
        (supabase.from("companies").select("tipo").eq("business_id" as any, bizId) as any),
      ]);
      setBusinessSlug(((biz as any)?.slug) || null);
      setBusinessName(((biz as any)?.name) || null);
      const tipos = ((bizCompanies || []) as any[])
        .map((c) => c.tipo)
        .filter((t): t is CompanyTipo => t === "empreendimentos" || t === "medicamentos");
      setBusinessTipos(Array.from(new Set(tipos)));
    } else {
      setBusinessSlug(null);
      setBusinessName(null);
      setBusinessTipos([]);
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setLoading(true);
        setTimeout(() => {
          fetchRoles(sess.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setRoles([]);
        setSectorIsOperational(false);
        setSectorName(null);
        setCompanyId(null);
        setCompanyTipo(null);
        setNivelAcesso("operacional");
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) fetchRoles(sess.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = roles.includes("admin");
  const isLicitacao = businessSlug === "licitacao";
  const isPosto = businessSlug === "posto";
  const isCredito = businessSlug === "credito";
  const canSeeEmpreendimentos =
    isAdmin || roles.includes("empreendimentos") || companyTipo === "empreendimentos" ||
    isLicitacao || businessTipos.includes("empreendimentos");
  const canSeeMedicamentos =
    isAdmin || roles.includes("medicamentos") || companyTipo === "medicamentos" ||
    isLicitacao || businessTipos.includes("medicamentos");
  const canSeeLicitacao = isAdmin || isLicitacao || canSeeEmpreendimentos || canSeeMedicamentos;
  const canSeePosto = isAdmin || isPosto;
  const canSeeCredito = isAdmin || isCredito;
  const hasOperationalAccess =
    isAdmin || canSeeLicitacao || canSeePosto || canSeeCredito || sectorIsOperational ||
    roles.includes("gerente") || roles.includes("operacional");

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setRoles([]);
    setSectorIsOperational(false);
    setSectorName(null);
    setCompanyId(null);
    setCompanyTipo(null);
    setBusinessId(null);
    setBusinessSlug(null);
    setBusinessName(null);
    setBusinessTipos([]);
    setNivelAcesso("operacional");
  }

  async function refreshRoles() {
    if (user) await fetchRoles(user.id);
  }

  return (
    <AuthContext.Provider value={{
      user, session, roles, loading, isAdmin,
      canSeeEmpreendimentos, canSeeMedicamentos,
      canSeePosto, canSeeCredito, canSeeLicitacao,
      hasOperationalAccess, sectorName, companyId, companyTipo,
      businessId, businessSlug, businessName,
      nivelAcesso, signIn, signOut, refreshRoles,
    }}>

      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
