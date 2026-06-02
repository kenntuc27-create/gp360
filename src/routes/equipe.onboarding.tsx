import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Trash2, Plus, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/equipe/onboarding")({ component: Onboarding });

type Sector = { id: string; name: string };
type Employee = { id: string; full_name: string; sector_id: string | null; email: string };
type MetricDraft = { name: string; unit: string; daily_goal: string };

function Onboarding() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [sectorName, setSectorName] = useState("");

  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empSector, setEmpSector] = useState<string>("");

  // Step 3 — metas por setor
  const [metricsBySector, setMetricsBySector] = useState<Record<string, MetricDraft[]>>({});
  const [activeSectorTab, setActiveSectorTab] = useState<string>("");

  async function reload() {
    const [{ data: s }, { data: e }] = await Promise.all([
      supabase.from("sectors").select("id, name").order("name"),
      supabase.from("employees").select("id, full_name, sector_id, email").eq("active", true).order("full_name"),
    ]);
    setSectors((s || []) as Sector[]);
    setEmployees((e || []).map((x) => ({ ...x, email: x.email || "" })) as Employee[]);
  }

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (sectors.length > 0 && !activeSectorTab) setActiveSectorTab(sectors[0].id);
  }, [sectors, activeSectorTab]);

  if (!isAdmin) {
    return (
      <AppShell title="Onboarding">
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Apenas administradores podem executar o onboarding.</CardContent></Card>
      </AppShell>
    );
  }

  async function addSector() {
    if (!sectorName.trim()) return;
    const { error } = await supabase.from("sectors").insert({ name: sectorName.trim() });
    if (error) return toast.error(error.message);
    setSectorName("");
    reload();
  }

  async function addEmployee() {
    if (!empName.trim()) return toast.error("Nome obrigatório");
    const { error } = await supabase.from("employees").insert({
      full_name: empName.trim(),
      email: empEmail.trim(),
      sector_id: empSector || null,
      user_id: crypto.randomUUID(), // Placeholder for restoration
    } as any);
    if (error) return toast.error(error.message);
    setEmpName(""); setEmpEmail(""); setEmpSector("");
    reload();
  }

  async function removeEmployee(id: string) {
    await supabase.from("employees").update({ active: false }).eq("id", id);
    reload();
  }

  function addMetricRow(sectorId: string) {
    setMetricsBySector((s) => ({
      ...s,
      [sectorId]: [...(s[sectorId] || []), { name: "", unit: "un", daily_goal: "" }],
    }));
  }
  function updateMetricRow(sectorId: string, idx: number, patch: Partial<MetricDraft>) {
    setMetricsBySector((s) => ({
      ...s,
      [sectorId]: (s[sectorId] || []).map((r, i) => i === idx ? { ...r, ...patch } : r),
    }));
  }
  function removeMetricRow(sectorId: string, idx: number) {
    setMetricsBySector((s) => ({
      ...s,
      [sectorId]: (s[sectorId] || []).filter((_, i) => i !== idx),
    }));
  }

  async function saveMetrics() {
    const rows: { sector_id: string; name: string; unit: string; daily_goal: number; sort_order: number }[] = [];
    Object.entries(metricsBySector).forEach(([sectorId, ms]) => {
      ms.filter((m) => m.name.trim()).forEach((m, i) => {
        rows.push({
          sector_id: sectorId,
          name: m.name.trim(),
          unit: m.unit.trim() || "un",
          daily_goal: Number(m.daily_goal) || 0,
          sort_order: i + 1,
        });
      });
    });
    if (rows.length === 0) return toast.error("Cadastre pelo menos uma métrica");
    const { error } = await supabase.from("sector_metrics").insert(rows.map(r => ({ ...r, reference_month: new Date().toISOString().slice(0, 10) })) as any);
    if (error) return toast.error(error.message);
    toast.success("Metas por setor salvas");
    navigate({ to: "/equipe" });
  }

  return (
    <AppShell title="Onboarding — Gestão de Equipe">
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${step >= n ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {step > n ? <CheckCircle2 className="size-4" /> : <span>{n}</span>}
              {n === 1 ? "Setores" : n === 2 ? "Funcionários" : "Metas do setor"}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader><CardTitle>1. Cadastre os setores</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Ex: Marketing, Vendas, Operações" value={sectorName} onChange={(e) => setSectorName(e.target.value)} />
                <Button onClick={addSector}><Plus className="size-4 mr-1" />Adicionar</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {sectors.map((s) => <span key={s.id} className="px-2 py-1 rounded bg-muted text-sm">{s.name}</span>)}
                {sectors.length === 0 && <span className="text-sm text-muted-foreground">Nenhum setor cadastrado.</span>}
              </div>
              <div className="flex justify-end">
                <Button disabled={sectors.length === 0} onClick={() => setStep(2)}>Próximo<ArrowRight className="size-4 ml-1" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader><CardTitle>2. Cadastre os funcionários</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input placeholder="Nome completo" value={empName} onChange={(e) => setEmpName(e.target.value)} />
                <Input placeholder="E-mail (opcional)" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} />
                <Select value={empSector} onValueChange={setEmpSector}>
                  <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
                  <SelectContent>
                    {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addEmployee}><Plus className="size-4 mr-1" />Adicionar funcionário</Button>
              <div className="divide-y border rounded">
                {employees.map((e) => {
                  const sect = sectors.find((s) => s.id === e.sector_id)?.name || "-";
                  return (
                    <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div><div className="font-medium">{e.full_name}</div><div className="text-xs text-muted-foreground">{sect} · {e.email || "sem e-mail"}</div></div>
                      <Button variant="ghost" size="icon" onClick={() => removeEmployee(e.id)}><Trash2 className="size-4" /></Button>
                    </div>
                  );
                })}
                {employees.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum funcionário ainda.</div>}
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
                <Button disabled={employees.length === 0} onClick={() => setStep(3)}>Próximo<ArrowRight className="size-4 ml-1" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>3. Defina as métricas e metas diárias de cada setor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Ex.: Marketing → "Disparos de mensagens" (50/dia) e "Respostas recebidas" (10/dia). Todos os funcionários do setor herdam estas metas.
              </p>
              <div className="flex flex-wrap gap-2">
                {sectors.map((s) => (
                  <button key={s.id} onClick={() => setActiveSectorTab(s.id)}
                    className={`px-3 py-1.5 rounded-md text-sm border ${activeSectorTab === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
                    {s.name}
                  </button>
                ))}
              </div>

              {activeSectorTab && (
                <div className="space-y-2">
                  {(metricsBySector[activeSectorTab] || []).map((m, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded p-3">
                      <div className="md:col-span-5">
                        <Label className="text-xs">Métrica</Label>
                        <Input value={m.name} onChange={(e) => updateMetricRow(activeSectorTab, idx, { name: e.target.value })} placeholder="Ex: Disparos de mensagens" />
                      </div>
                      <div className="md:col-span-3">
                        <Label className="text-xs">Meta diária</Label>
                        <Input type="number" value={m.daily_goal} onChange={(e) => updateMetricRow(activeSectorTab, idx, { daily_goal: e.target.value })} />
                      </div>
                      <div className="md:col-span-3">
                        <Label className="text-xs">Unidade</Label>
                        <Input value={m.unit} onChange={(e) => updateMetricRow(activeSectorTab, idx, { unit: e.target.value })} />
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <Button variant="ghost" size="icon" onClick={() => removeMetricRow(activeSectorTab, idx)}><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => addMetricRow(activeSectorTab)}>
                    <Plus className="size-4 mr-1" />Adicionar métrica
                  </Button>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>Voltar</Button>
                <Button onClick={saveMetrics}>Concluir onboarding</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
