import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Trash2, Plus, KeyRound, Check, Pencil, X, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/equipe/funcionarios")({ component: FuncionariosPage });

interface Emp {
  id: string;
  full_name: string;
  sector_id: string | null;
  email: string;
  user_id: string | null;
  username?: string | null;
  cargo?: string | null;
  segmento?: string | null;
  is_blocked?: boolean;
}

function FuncionariosPage() {
  const { isAdmin } = useAuth();
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [secName, setSecName] = useState("");
  const [name, setName] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [cargo, setCargo] = useState("");
  const [segmento, setSegmento] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSector, setEditSector] = useState<string>("");
  const [editCargo, setEditCargo] = useState("");
  const [editSegmento, setEditSegmento] = useState("");

  async function load() {
    const [{ data: s }, { data: e }, { data: profs }] = await Promise.all([
      supabase.from("sectors").select("id, name").order("name"),
      supabase.from("employees").select("id, full_name, sector_id, email, user_id").eq("active", true).order("full_name"),
      supabase.from("profiles").select("user_id, username, cargo, segmento, is_blocked"),
    ]);
    setSectors(s || []);
    const profMap = new Map((profs || []).map((p) => [p.user_id, p]));
    setEmployees((e || []).map((x: any) => {
      const p = x.user_id ? profMap.get(x.user_id) : null;
      return {
        ...x,
        email: x.email || "",
        username: p?.username || null,
        cargo: p?.cargo || null,
        segmento: p?.segmento || null,
        is_blocked: p?.is_blocked || false,
      };
    }) as any);
  }
  useEffect(() => { load(); }, []);

  if (!isAdmin) return <AppShell title="Funcionários"><Card><CardContent className="py-8 text-sm text-muted-foreground">Apenas administradores.</CardContent></Card></AppShell>;

  async function addSector() {
    if (!secName.trim()) return;
    const { error } = await supabase.from("sectors").insert({ name: secName.trim() });
    if (error) return toast.error(error.message);
    setSecName(""); load();
  }
  async function addEmp() {
    if (!name.trim()) return toast.error("Nome obrigatório");
    const { error } = await supabase.from("employees").insert({
      full_name: name.trim(), sector_id: sectorId || null, user_id: crypto.randomUUID(), // Placeholder as it is required by types
    } as any);
    if (error) return toast.error(error.message);
    setName(""); setSectorId("");
    load();
  }
  async function rmEmp(id: string) {
    if (!confirm("Desativar este funcionário?")) return;
    await supabase.from("employees").update({ active: false }).eq("id", id);
    load();
  }
  function startEdit(emp: Emp) {
    setEditId(emp.id);
    setEditName(emp.full_name);
    setEditSector(emp.sector_id || "");
    setEditCargo(emp.cargo || "");
    setEditSegmento(emp.segmento || "");
  }
  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditSector("");
    setEditCargo("");
    setEditSegmento("");
  }
  async function saveEdit(id: string) {
    if (!editName.trim()) return toast.error("Nome obrigatório");
    const emp = employees.find(e => e.id === id);
    
    const { error } = await supabase.from("employees").update({
      full_name: editName.trim(),
      sector_id: editSector || null,
    }).eq("id", id);
    
    if (error) return toast.error(error.message);

    if (emp?.user_id) {
      await supabase.functions.invoke("admin-users", {
        body: { 
          action: "update_profile", 
          user_id: emp.user_id, 
          full_name: editName.trim(),
          cargo: editCargo,
          segmento: editSegmento
        },
      });
    }

    toast.success("Funcionário atualizado");
    cancelEdit();
    load();
  }
  async function createLogin(emp: Emp) {
    const rawUsername = prompt(`Nome de usuário para ${emp.full_name}:`, emp.full_name.split(' ')[0].toLowerCase());
    if (!rawUsername) return;

    setBusyId(emp.id);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { 
        action: "create_employee_user", 
        employee_id: emp.id,
        username: rawUsername,
        cargo,
        segmento,
        setor: sectors.find(s => s.id === (sectorId || emp.sector_id))?.name
      },
    });
    setBusyId(null);
    const err = (data as { error?: string })?.error || error?.message;
    if (err) return toast.error(err);
    const info = data as { username: string; password: string };
    toast.success(`Login criado: ${info.username} / senha: ${info.password}`, { duration: 10000 });
    load();
  }
  async function resetPwd(emp: Emp) {
    if (!emp.user_id) return;
    const novaSenha = prompt(`Defina a nova senha para ${emp.full_name} (mínimo 6 caracteres). O funcionário precisará trocá-la no próximo acesso.`, "mudar@123");
    if (!novaSenha) return;
    if (novaSenha.length < 6) return toast.error("A senha precisa ter ao menos 6 caracteres");
    setBusyId(emp.id);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "reset_password", user_id: emp.user_id, password: novaSenha },
    });
    setBusyId(null);
    let err = (data as { error?: string })?.error;
    if (!err && error) {
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const j = await ctx.json();
          err = j?.error || error.message;
        } else {
          err = error.message;
        }
      } catch {
        err = error.message;
      }
    }
    if (err) return toast.error(err);
    await supabase.from("profiles").update({ must_change_password: true }).eq("user_id", emp.user_id);
    toast.success(`Senha redefinida para: ${novaSenha}`, { duration: 10000 });
  }

  async function toggleBlock(emp: Emp) {
    if (!emp.user_id) return;
    const active = !!emp.is_blocked; // se está bloqueado, vamos ativar
    setBusyId(emp.id);
    const { error } = await supabase.functions.invoke("admin-users", {
      body: { action: "set_active", user_id: emp.user_id, active },
    });
    if (!error) {
      await supabase.from("profiles").update({ is_blocked: !active }).eq("user_id", emp.user_id);
      toast.success(active ? "Usuário desbloqueado" : "Usuário bloqueado");
    }
    setBusyId(null);
    load();
  }

  return (
    <AppShell title="Funcionários e Setores">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Setores</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="Novo setor" />
              <Button onClick={addSector}><Plus className="size-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {sectors.map((s) => <span key={s.id} className="px-2 py-1 rounded bg-muted text-sm">{s.name}</span>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Novo funcionário</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Nome completo" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Select value={sectorId} onValueChange={setSectorId}>
                <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
                <SelectContent>{sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
            </div>
            <Input placeholder="Segmento (ex: Medicamentos)" value={segmento} onChange={(e) => setSegmento(e.target.value)} />
            <Button onClick={addEmp} className="w-full"><Plus className="size-4 mr-1" />Adicionar</Button>
            <p className="text-xs text-muted-foreground">Depois de adicionar, clique em <strong>Criar login</strong> na lista abaixo. A senha temporária deve ser trocada no 1º acesso.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Equipe ativa</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {employees.map((e) => {
              const sec = sectors.find((s) => s.id === e.sector_id)?.name || "-";
              const isEditing = editId === e.id;
              return (
                <div key={e.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 py-2 items-center text-sm">
                  {isEditing ? (
                    <>
                      <div className="col-span-2 space-y-1">
                        <Input value={editName} onChange={(ev) => setEditName(ev.target.value)} className="h-8" placeholder="Nome" />
                        <div className="grid grid-cols-2 gap-1">
                          <Input value={editCargo} onChange={(ev) => setEditCargo(ev.target.value)} className="h-8" placeholder="Cargo" />
                          <Input value={editSegmento} onChange={(ev) => setEditSegmento(ev.target.value)} className="h-8" placeholder="Segmento" />
                        </div>
                      </div>
                      <Select value={editSector} onValueChange={setEditSector}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Setor" /></SelectTrigger>
                        <SelectContent>{sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="text-muted-foreground">
                        {e.username ? (
                          <span className="inline-flex items-center gap-1"><Check className="size-3 text-green-600" />{e.username}</span>
                        ) : (
                          <span className="text-amber-600">sem login</span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => saveEdit(e.id)}><Save className="size-3 mr-1" />Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="size-3" /></Button>
                      </div>
                      <div />
                    </>
                  ) : (
                    <>
                      <div className="font-medium">
                        {e.full_name}
                        {e.cargo && <div className="text-[10px] font-normal text-muted-foreground uppercase">{e.cargo}</div>}
                      </div>
                      <div className="text-muted-foreground">{sec}</div>
                      <div className="text-muted-foreground text-xs">{e.segmento || "-"}</div>
                      <div className="text-muted-foreground">
                        {e.username ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1"><Check className="size-3 text-green-600" />{e.username}</span>
                            {e.is_blocked && <span className="text-[10px] text-destructive font-bold uppercase">Bloqueado</span>}
                          </div>
                        ) : (
                          <span className="text-amber-600">sem login</span>
                        )}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {!e.user_id ? (
                          <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => createLogin(e)}>
                            <KeyRound className="size-3 mr-1" />Criar login
                          </Button>
                        ) : (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => resetPwd(e)}>
                              <KeyRound className="size-3 mr-1" />Reset
                            </Button>
                            <Button size="sm" variant={e.is_blocked ? "destructive" : "outline"} className="h-7 px-2" onClick={() => toggleBlock(e)}>
                              {e.is_blocked ? "Desbloquear" : "Bloquear"}
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(e)}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => rmEmp(e.id)}><Trash2 className="size-4" /></Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {employees.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">Sem funcionários.</div>}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
