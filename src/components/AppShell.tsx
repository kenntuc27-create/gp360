import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Settings, LogOut, ShieldCheck, Loader2, ArrowLeft,
  PanelLeftClose, PanelLeftOpen, Menu, Calculator, ScrollText, TrendingUp,
  Briefcase, Target, Trophy, Clock, CalendarCheck, UserCog, FileSignature,
  Bell, GraduationCap, History, Activity, Gavel, Building2, FileCheck,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { InstallAppButton } from "@/components/InstallAppButton";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DailyScorePopup } from "@/components/DailyScorePopup";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationsBootstrap } from "@/components/NotificationsBootstrap";
import { SidebarNavGroup, type NavItem } from "@/components/SidebarGroup";

const OPERATIONAL_PREFIXES = ["/", "/novo", "/historico", "/fornecedores", "/configuracoes", "/edital", "/central"];
function requiresOperational(pathname: string) {
  if (pathname === "/") return true;
  return OPERATIONAL_PREFIXES.some((p) => p !== "/" && pathname.startsWith(p));
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export function AppShell({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const { user, loading, isAdmin, signOut, roles, hasOperationalAccess, sectorName } = useAuth();
  console.log("hasOperationalAccess =", hasOperationalAccess);
console.log("roles =", roles);
console.log("isAdmin =", isAdmin);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("sidebar:open") !== "0";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar:collapsed") === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("sidebar:open", sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("sidebar:collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const homePath = hasOperationalAccess ? "/" : "/equipe";
  const isHome = loc.pathname === homePath;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (loading || !user) return;
    let cancel = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("profiles").select("must_change_password").eq("user_id", user.id).maybeSingle();
      if (cancel) return;
      if (data?.must_change_password) {
        setMustChange(true);
        if (loc.pathname !== "/trocar-senha") navigate({ to: "/trocar-senha" });
      } else {
        setMustChange(false);
      }
    })();
    return () => { cancel = true; };
  }, [loading, user, loc.pathname, navigate]);

  useEffect(() => {
    if (loading || !user || mustChange) return;
    if (!hasOperationalAccess && requiresOperational(loc.pathname)) {
      navigate({ to: "/equipe" });
    }
  }, [loading, user, hasOperationalAccess, loc.pathname, navigate, mustChange]);

  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groups: NavGroup[] = [];
groups.push({
  id: "licitacoes",
  label: "Licitações",
  items: [
    { to: "/central", label: "Central de Cotação", icon: Calculator },
    { to: "/historico", label: "Histórico", icon: History },
    { to: "/fornecedores", label: "Fornecedores", icon: Users },
    { to: "/pos-entrega", label: "Pós-Entrega", icon: FileCheck },
  ],
});

  groups.push({
    id: "performance",
    label: "Performance",
    items: [
      { to: "/equipe/performance-geral", label: "Dashboard Geral", icon: TrendingUp },
      { to: "/equipe/performance", label: "Performance", icon: Activity },
      { to: "/equipe/metas", label: "Metas", icon: Target },
    ],
  });

  groups.push({
    id: "rh",
    label: "RH e Ponto",
    items: [
      { to: "/equipe/ponto", label: "Bater Ponto", icon: Clock },
      { to: "/equipe/adesao", label: "Adesão", icon: CalendarCheck },
      { to: "/equipe/producao", label: "Produção", icon: Briefcase },
      { to: "/equipe/funcionarios", label: "Funcionários", icon: UserCog },
    ],
  });

  const equipeItems: NavItem[] = [
    { to: "/equipe", label: "Visão da Equipe", icon: Trophy, exact: true },
    { to: "/equipe/atas", label: "Atas", icon: FileSignature },
    { to: "/equipe/notificacoes", label: "Notificações", icon: Bell },
    { to: "/equipe/onboarding", label: "Onboarding", icon: GraduationCap },
  ];
  if (isAdmin) {
    equipeItems.push({ to: "/usuarios", label: "Usuários", icon: ShieldCheck });
    equipeItems.push({ to: "/auditoria", label: "Auditoria", icon: ScrollText });
    equipeItems.push({ to: "/equipe/admin", label: "Admin Equipe", icon: Gavel });
  }
  groups.push({ id: "equipe", label: "Equipe", items: equipeItems });

  if (hasOperationalAccess) {
  groups.push({
    id: "config",
    label: "Configurações",
    items: [
      { to: "/configuracoes", label: "Dados da Empresa", icon: Building2 },
      { to: "/backups", label: "Backups", icon: History },
      { to: "/ia-gp360", label: "IA GP360", icon: ShieldCheck },
    ],
  });
}  

  const userLabel = user.user_metadata?.full_name || user.email || "Usuário";
  const roleLabel = isAdmin
    ? "Administrador"
    : roles.includes("medicamentos") && roles.includes("empreendimentos")
    ? "Empreendimentos + Medicamentos"
    : roles.includes("medicamentos")
    ? "Medicamentos"
    : roles.includes("empreendimentos")
    ? "Empreendimentos"
    : sectorName
    ? sectorName
    : "Sem setor atribuído";

  const NavList = ({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) => (
    <nav className="flex-1 py-2 space-y-1 overflow-y-auto">
      {groups.map((g) => (
        <SidebarNavGroup
          key={g.id}
          id={g.id}
          label={g.label}
          items={g.items}
          collapsedSidebar={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );

  const SidebarFooter = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className={cn("p-3 space-y-2 border-t border-sidebar-border", collapsed && "px-1.5")}>
      {!collapsed && (
        <div className="px-1 text-xs">
          <div className="font-medium text-sidebar-foreground truncate">{userLabel}</div>
          <div className="text-sidebar-foreground/60 truncate">{roleLabel}</div>
        </div>
      )}
      <Button
        size={collapsed ? "icon" : "sm"}
        variant="ghost"
        className={cn(
          "text-sidebar-foreground hover:bg-sidebar-accent/60",
          collapsed ? "w-9 h-9 mx-auto flex" : "w-full justify-start"
        )}
        onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
        title="Sair"
      >
        <LogOut className="size-4" />{!collapsed && <span className="ml-2">Sair</span>}
      </Button>
      {!collapsed && <InstallAppButton />}
      {!collapsed && <div className="text-xs opacity-60 px-1">v1.0 · Sistema interno</div>}
    </div>
  );

  const sidebarWidth = sidebarCollapsed ? "w-14" : "w-60";

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <aside className={cn("hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200", sidebarWidth)}>
          <div className={cn("border-b border-sidebar-border bg-white/95 flex items-center justify-center", sidebarCollapsed ? "py-1 px-1" : "px-2 py-1")}>
            <img src={logo}alt="3K SISTEMAS"className={cn("object-contain object-center",sidebarCollapsed ? "h-8" : "max-w-[140px] h-auto")}/>
          </div>
          <NavList collapsed={sidebarCollapsed} />
          <SidebarFooter collapsed={sidebarCollapsed} />
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 flex items-center justify-between px-3 md:px-6 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" className="md:hidden" aria-label="Abrir menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[280px] bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col">
                <div className="px-2 py-1 border-b border-sidebar-border bg-white/95">
                  <img src={logo}alt="3K SISTEMAS"className="w-full h-18 object-contain px-2"/>
                </div>
                <NavList onNavigate={() => setMobileOpen(false)} />
                <SidebarFooter />
              </SheetContent>
            </Sheet>

            {sidebarOpen ? (
              <Button
                size="icon"
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={() => setSidebarCollapsed((v) => !v)}
                title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
                aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
              >
                <PanelLeftClose className="size-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={() => setSidebarOpen(true)}
                title="Mostrar menu lateral"
                aria-label="Mostrar menu lateral"
              >
                <PanelLeftOpen className="size-4" />
              </Button>
            )}
            {!isHome && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.history.length > 1) router.history.back();
                  else navigate({ to: homePath });
                }}
                title="Voltar"
              >
                <ArrowLeft className="size-4 mr-1" /><span className="hidden sm:inline">Voltar</span>
              </Button>
            )}
            <h1 className="text-sm sm:text-base font-semibold text-foreground truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
      <DailyScorePopup />
      <NotificationsBootstrap />
    </div>
  );
}
