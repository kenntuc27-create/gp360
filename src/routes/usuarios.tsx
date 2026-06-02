import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole, NivelAcesso, CompanyTipo } from "@/hooks/useAuth";
import { Loader2, UserPlus, Trash2, KeyRound, ShieldAlert, Pencil, Power, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/usuarios")({ component: UsuariosPage });

interface BusinessRow { id: string; name: string; slug: string; }
interface CompanyRow { id: string; tipo: CompanyTipo | null; display_name: string; business_id: string | null; }
interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  company_id: string | null;
  company_tipo: CompanyTipo | null;
  business_id: string | null;
  nivel_acesso: NivelAcesso;
  roles: AppRole[];
  active: boolean;
}

const NIVEL_LABEL: Record<NivelAcesso, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  operacional: "Operacional",
};

function UsuariosPage() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // Novo usuário
  const [fName, setFName] = useState("");
  const [fUsername, setFUsername] = useState("");
  const [fBusinessId, setFBusinessId] = useState<string>("");
  const [fCompanyId, setFCompanyId] = useState<string>("");
  const [fNivel, setFNivel] = useState<NivelAcesso>("operacional");

  // Editar
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [eName, setEName] = useState("");
  const [eBusinessId, setEBusinessId] = useState<string>("");
  const [eCompanyId, setECompanyId] = useState<string>("");
  const [eNivel, setENivel] = useState<NivelAcesso>("operacional");


  async function load() {
    const [{ data: profs }, { data: rs }, { data: bs }, { data: cs }, { data: usersAdmin }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, company_id, company_tipo, nivel_acesso, business_id" as any),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("businesses" as any).select("id, name, slug").order("name"),
      supabase.from("companies").select("id, tipo, display_name, business_id" as any).order("display_name"),
      supabase.functions.invoke("admin-users", { body: { action: "list_status" } }).then((r) => ({ data: (r.data as any)?.users || [] })).catch(() => ({ data: [] })),
    ]);

    const statusMap = new Map<string, boolean>();
    (usersAdmin as any[]).forEach((u: any) => statusMap.set(u.id, !u.banned_until));

    const map = new Map<string, UserRow>();
    (profs || []).forEach((p: any) => map.set(p.user_id, {
      user_id: p.user_id,
      full_name: p.full_name || "",
      email: p.email || "",
      company_id: p.company_id,
      company_tipo: p.company_tipo,
      business_id: p.business_id || null,
      nivel_acesso: (p.nivel_acesso || "operacional") as NivelAcesso,
      roles: [],
      active: statusMap.get(p.user_id) ?? true,
    }));
    (rs || []).forEach((r: any) => {
      const u = map.get(r.user_id);
      if (u) u.roles.push(r.role as AppRole);
    });
    setRows(Array.from(map.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setBusinesses(((bs || []) as any) as BusinessRow[]);
    setCompanies(((cs || []) as any) as CompanyRow[]);
  }


  useEffect(() => { if (!loading && isAdmin) load(); }, [loading, isAdmin]);

  async function getFreshAuthHeader(): Promise<string | null> {
    // Força revalidar a sessão. Se o refresh token estiver inválido, desloga.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    return `Bearer ${session.access_token}`;
  }

  // Modal de credenciais (criação ou reset)
  const [credModal, setCredModal] = useState<{ email: string; password: string; isReset: boolean } | null>(null);

  async function call(payload: Record<string, unknown>): Promise<{ ok: boolean; data?: any }> {
    const authHeader = await getFreshAuthHeader();
    if (!authHeader) {
      toast.error("Sessão expirada. Faça login novamente.");
      await supabase.auth.signOut();
      window.location.href = "/login";
      return { ok: false };
    }
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: payload,
      headers: { Authorization: authHeader },
    });
    if (error || (data as { error?: string })?.error) {
      const msg = (data as { error?: string })?.error || error?.message || "Erro";
      if (msg.toLowerCase().includes("autenticad") && !msg.includes("autenticação falhou")) {
        await supabase.auth.signOut();
        window.location.href = "/login";
      } else {
        toast.error(msg);
      }
      return { ok: false };
    }
    return { ok: true, data };
  }

  function rolesForBusiness(businessId: string | null, nivel: NivelAcesso, companyTipo: CompanyTipo | null, baseRoles: AppRole[] = []) {
    const desired = new Set<AppRole>(
      baseRoles.filter((r) => r !== "admin" && r !== "empreendimentos" && r !== "medicamentos"),
    );
    if (nivel === "admin") desired.add("admin");
    const biz = businesses.find((b) => b.id === businessId);
    if (biz?.slug === "licitacao") {
      // Licitação: acesso às duas empresas
      desired.add("empreendimentos");
      desired.add("medicamentos");
    } else if (companyTipo) {
      desired.add(companyTipo as AppRole);
    }
    return Array.from(desired);
  }

  async function createUser() {
    const username = fUsername.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!username) { toast.error("Informe o nome de usuário"); return; }
    if (!fBusinessId) { toast.error("Selecione o negócio"); return; }
    const company = companies.find((c) => c.id === fCompanyId);
    setBusy(true);
    const legacyRoles = rolesForBusiness(fBusinessId, fNivel, (company?.tipo as CompanyTipo) || null);
    const res = await call({
      action: "create",
      username, full_name: fName,
      business_id: fBusinessId,
      company_id: company?.id || null,
      company_tipo: company?.tipo || null,
      nivel_acesso: fNivel,
      roles: legacyRoles,
    });
    setBusy(false);
    if (res.ok && res.data) {
      toast.success("Usuário criado e validado");
      { const u = res.data.username || (res.data.email || "").split("@")[0]; setCredModal({ email: u.charAt(0).toUpperCase() + u.slice(1), password: res.data.password, isReset: false }); }
      setFName(""); setFUsername(""); setFBusinessId(""); setFCompanyId(""); setFNivel("operacional");
      load();
    }
  }

  function openEdit(u: UserRow) {
    setEditing(u);
    setEName(u.full_name);
    setEBusinessId(u.business_id || "");
    setECompanyId(u.company_id || "");
    setENivel(u.nivel_acesso);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!eBusinessId) { toast.error("Selecione o negócio"); return; }
    const company = companies.find((c) => c.id === eCompanyId);
    const res = await call({
      action: "update_profile",
      user_id: editing.user_id,
      full_name: eName,
      business_id: eBusinessId,
      company_id: company?.id || null,
      company_tipo: company?.tipo || null,
      nivel_acesso: eNivel,
    });
    if (!res.ok) return;
    const desired = rolesForBusiness(eBusinessId, eNivel, (company?.tipo as CompanyTipo) || null, editing.roles);
    await call({ action: "set_roles", user_id: editing.user_id, roles: desired });
    toast.success("Usuário atualizado");
    setEditing(null);
    load();
  }


  async function toggleActive(u: UserRow) {
    const res = await call({ action: "set_active", user_id: u.user_id, active: !u.active });
    if (res.ok) { toast.success(u.active ? "Usuário desativado" : "Usuário reativado"); load(); }
  }

  async function removeUser(u: UserRow) {
    if (!confirm(`Excluir o usuário ${u.full_name || u.email}?`)) return;
    const res = await call({ action: "delete", user_id: u.user_id });
    if (res.ok) { toast.success("Removido"); load(); }
  }

  async function resetPwd(u: UserRow) {
    if (!confirm(`Gerar nova senha temporária para ${u.full_name || u.email}?`)) return;
    const res = await call({ action: "reset_password", user_id: u.user_id });
    if (res.ok && res.data) {
      toast.success("Senha redefinida e validada");
      { const un = res.data.username || (res.data.email || u.email).split("@")[0]; setCredModal({ email: un.charAt(0).toUpperCase() + un.slice(1), password: res.data.password, isReset: true }); }
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado");
    } catch { toast.error("Falha ao copiar"); }
  }

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  if (loading) return <AppShell title="Usuários"><div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div></AppShell>;

  if (!isAdmin) return (
    <AppShell title="Usuários">
      <Card><CardContent className="py-16 text-center space-y-3">
        <ShieldAlert className="size-10 text-destructive mx-auto" />
        <p className="font-medium">Acesso restrito</p>
        <p className="text-sm text-muted-foreground">Apenas administradores podem gerenciar usuários.</p>
      </CardContent></Card>
    </AppShell>
  );

  return (
    <AppShell title="Gestão de Usuários">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Novo Usuário</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2"><Label>Nome completo</Label><Input value={fName} onChange={(e) => setFName(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Nome de usuário (login)</Label><Input value={fUsername} onChange={(e) => setFUsername(e.target.value)} placeholder="ex: joaosilva" /></div>
            <div className="md:col-span-1 text-xs text-muted-foreground">Senha temporária será gerada automaticamente.</div>
            <Button onClick={createUser} disabled={busy}><UserPlus className="size-4 mr-2" />Criar</Button>
            <div className="md:col-span-2">
              <Label>Negócio</Label>
              <Select value={fBusinessId} onValueChange={(v) => { setFBusinessId(v); setFCompanyId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o negócio" /></SelectTrigger>
                <SelectContent>
                  {businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Empresa (opcional)</Label>
              <Select value={fCompanyId} onValueChange={setFCompanyId} disabled={!fBusinessId}>
                <SelectTrigger><SelectValue placeholder={fBusinessId ? "Todas do negócio" : "Selecione o negócio"} /></SelectTrigger>
                <SelectContent>
                  {companies.filter((c) => c.business_id === fBusinessId).map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Nível de acesso</Label>
              <Select value={fNivel} onValueChange={(v) => setFNivel(v as NivelAcesso)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="operacional">Operacional</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Usuários ({filtered.length})</CardTitle>
            <Input placeholder="Buscar nome ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </CardHeader>
          <CardContent className="px-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">Usuário (login)</th>
                  <th className="px-3 py-2 text-left">Negócio</th>
                  <th className="px-3 py-2 text-left">Empresa</th>
                  <th className="px-3 py-2 text-left">Nível</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const company = companies.find((c) => c.id === u.company_id);
                  const business = businesses.find((b) => b.id === u.business_id);
                  const username = (u.email || "").split("@")[0] || "—";
                  return (
                    <tr key={u.user_id} className="border-t">
                      <td className="px-3 py-2 font-medium">{u.full_name || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{username}</td>
                      <td className="px-3 py-2">{business?.name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{company?.display_name || <span className="text-muted-foreground text-xs">Todas</span>}</td>

                      <td className="px-3 py-2"><Badge variant="outline">{NIVEL_LABEL[u.nivel_acesso]}</Badge></td>
                      <td className="px-3 py-2">
                        {u.active
                          ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Ativo</Badge>
                          : <Badge variant="destructive">Inativo</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)} title="Editar"><Pencil className="size-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => toggleActive(u)} title={u.active ? "Desativar" : "Ativar"}>
                          <Power className={`size-4 ${u.active ? "text-emerald-600" : "text-muted-foreground"}`} />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => resetPwd(u)} title="Resetar senha"><KeyRound className="size-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => removeUser(u)} title="Excluir"><Trash2 className="size-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Nenhum usuário encontrado.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={eName} onChange={(e) => setEName(e.target.value)} /></div>
            <div>
              <Label>Negócio</Label>
              <Select value={eBusinessId} onValueChange={(v) => { setEBusinessId(v); setECompanyId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o negócio" /></SelectTrigger>
                <SelectContent>
                  {businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empresa (opcional)</Label>
              <Select value={eCompanyId} onValueChange={setECompanyId} disabled={!eBusinessId}>
                <SelectTrigger><SelectValue placeholder={eBusinessId ? "Todas do negócio" : "Selecione o negócio"} /></SelectTrigger>
                <SelectContent>
                  {companies.filter((c) => c.business_id === eBusinessId).map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Nível de acesso</Label>
              <Select value={eNivel} onValueChange={(v) => setENivel(v as NivelAcesso)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="operacional">Operacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!credModal} onOpenChange={(o) => !o && setCredModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{credModal?.isReset ? "Senha redefinida" : "Usuário criado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>Anote ou copie estes dados agora. O usuário será obrigado a trocar a senha no primeiro login.</span>
            </div>
            <div>
              <Label>Usuário (login)</Label>
              <div className="flex gap-2">
                <Input readOnly value={credModal?.email || ""} />
                <Button type="button" variant="outline" size="icon" onClick={() => copyText(credModal?.email || "")}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Senha temporária</Label>
              <div className="flex gap-2">
                <Input readOnly value={credModal?.password || ""} className="font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyText(credModal?.password || "")}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => copyText(`Usuário: ${credModal?.email}\nSenha: ${credModal?.password}`)}
            >
              <Copy className="size-4 mr-2" />Copiar tudo
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
