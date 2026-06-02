import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";
import { monthKey } from "@/lib/team";
import { Target, Building2, Users, Calculator, Wand2, Briefcase, Link2, Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/equipe/metas")({ component: MetasPage });

type Business = { id: string; name: string; cnpj: string; active: boolean; sort_order: number };
type Sector = { id: string; name: string; monthly_revenue_target: number; working_days: number; business_id: string | null };
type Emp = { id: string; full_name: string; sector_id: string | null };
type EmpBiz = { employee_id: string; business_id: string; is_primary: boolean };
type BizGoal = { id?: string; business_id: string; reference_month: string; target_amount: number; working_days: number; notes: string };
type EmpGoal = { id?: string; employee_id: string; business_id: string | null; reference_month: string; target_amount: number; working_days: number };

function MetasPage() {
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState(monthKey());
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBiz, setActiveBiz] = useState<string>("");
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [empBiz, setEmpBiz] = useState<EmpBiz[]>([]);
  const [bizGoal, setBizGoal] = useState<BizGoal>({ business_id: "", reference_month: period, target_amount: 0, working_days: 22, notes: "" });
  const [empGoals, setEmpGoals] = useState<Record<string, EmpGoal>>({});

  async function loadAll() {
    const [{ data: b }, { data: s }, { data: e }, { data: eb }] = await Promise.all([
      (supabase.from as any)("businesses").select("*").eq("active", true).order("sort_order"),
      supabase.from("sectors").select("id, name, monthly_revenue_target, working_days, business_id").order("name"),
      supabase.from("employees").select("id, full_name, sector_id").eq("active", true).order("full_name"),
      (supabase.from as any)("employee_businesses").select("employee_id, business_id, is_primary"),
    ]);
    const bizList = (b || []) as Business[];
    setBusinesses(bizList);
    setSectors((s || []) as Sector[]);
    setEmployees((e || []) as Emp[]);
    setEmpBiz((eb || []) as EmpBiz[]);
    if (!activeBiz && bizList.length > 0) setActiveBiz(bizList[0].id);
  }

  async function loadBizScoped() {
    if (!activeBiz) return;
    const [{ data: g }, { data: eg }] = await Promise.all([
      (supabase.from as any)("business_goals").select("*").eq("business_id", activeBiz).eq("reference_month", period).maybeSingle(),
      (supabase.from as any)("employee_goals").select("*").eq("business_id", activeBiz).eq("reference_month", period),
    ]);
    setBizGoal(g ? (g as BizGoal) : { business_id: activeBiz, reference_month: period, target_amount: 0, working_days: 22, notes: "" });
    const map: Record<string, EmpGoal> = {};
    (eg || []).forEach((x: any) => { map[x.employee_id] = x as EmpGoal; });
    setEmpGoals(map);
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadBizScoped(); /* eslint-disable-next-line */ }, [activeBiz, period]);

  const bizSectors = useMemo(() => sectors.filter((s) => s.business_id === activeBiz), [sectors, activeBiz]);
  const bizEmployees = useMemo(() => {
    const ids = new Set(empBiz.filter((x) => x.business_id === activeBiz).map((x) => x.employee_id));
    // fallback: também inclui funcionários cujo setor pertence ao negócio
    const sectorEmpIds = new Set(employees.filter((e) => bizSectors.some((s) => s.id === e.sector_id)).map((e) => e.id));
    return employees.filter((e) => ids.has(e.id) || sectorEmpIds.has(e.id));
  }, [empBiz, employees, bizSectors, activeBiz]);

  const sectorTotal = useMemo(() => bizSectors.reduce((a, s) => a + Number(s.monthly_revenue_target || 0), 0), [bizSectors]);
  const empTotal = useMemo(() => Object.values(empGoals).reduce((a, g) => a + Number(g.target_amount || 0), 0), [empGoals]);

  if (!isAdmin) {
    return <AppShell title="Metas"><Card><CardContent className="py-8 text-sm text-muted-foreground">Apenas administradores.</CardContent></Card></AppShell>;
  }

  const [resetConfirmText, setResetConfirmText] = useState("");

  async function saveBizGoal() {
    if (!bizGoal.target_amount || bizGoal.target_amount <= 0) return toast.error("Meta mensal deve ser maior que zero");
    if (!bizGoal.working_days || bizGoal.working_days <= 0) return toast.error("Defina os dias úteis");
    const payload = { ...bizGoal, business_id: activeBiz, reference_month: period };
    const { error } = await (supabase.from as any)("business_goals").upsert(payload, { onConflict: "business_id,reference_month" });
    if (error) return toast.error(error.message);
    toast.success("Meta do negócio salva");
    loadBizScoped();
  }

  async function resetAllGoals() {
    if (resetConfirmText !== "APAGAR") return toast.error("Digite APAGAR para confirmar");
    try {
      await Promise.all([
        (supabase.from as any)("employee_goals").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        (supabase.from as any)("business_goals").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("sectors").update({ monthly_revenue_target: 0 }).neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      setResetConfirmText("");
      toast.success("Todas as metas foram apagadas. Sistema em modo configuração.");
      loadAll();
      loadBizScoped();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao resetar");
    }
  }

  async function distributeAmongSectors() {
    if (!bizGoal.target_amount) return toast.error("Defina a meta do negócio primeiro");
    if (bizSectors.length === 0) return toast.error("Vincule setores a este negócio antes");
    const each = Math.round((bizGoal.target_amount / bizSectors.length) * 100) / 100;
    await Promise.all(bizSectors.map((s) => supabase.from("sectors").update({ monthly_revenue_target: each }).eq("id", s.id)));
    toast.success("Meta distribuída entre setores do negócio");
    loadAll();
  }

  async function updateSectorTarget(id: string, value: number) {
    if (value < 0) return toast.error("Meta não pode ser negativa");
    const { error } = await supabase.from("sectors").update({ monthly_revenue_target: value }).eq("id", id);
    if (error) return toast.error(error.message);
    loadAll();
  }

  async function distributeSectorToEmployees(sectorId: string) {
    const sector = bizSectors.find((s) => s.id === sectorId);
    if (!sector) return;
    const emps = bizEmployees.filter((e) => e.sector_id === sectorId);
    if (emps.length === 0) return toast.error("Setor sem funcionários");
    const each = Math.round((Number(sector.monthly_revenue_target) / emps.length) * 100) / 100;
    const rows = emps.map((e) => ({
      employee_id: e.id, business_id: activeBiz, reference_month: period,
      target_amount: each, working_days: bizGoal.working_days || 22, notes: "",
    }));
    const { error } = await (supabase.from as any)("employee_goals").upsert(rows, { onConflict: "employee_id,reference_month" });
    if (error) return toast.error(error.message);
    toast.success(`Distribuído entre ${emps.length} funcionário(s)`);
    loadBizScoped();
  }

  async function saveEmpGoal(empId: string, target: number, days: number) {
    if (target < 0) return toast.error("Meta não pode ser negativa");
    if (!days || days <= 0) return toast.error("Defina os dias úteis");
    const { error } = await (supabase.from as any)("employee_goals").upsert(
      { employee_id: empId, business_id: activeBiz, reference_month: period, target_amount: target, working_days: days, notes: "" },
      { onConflict: "employee_id,reference_month" }
    );
    if (error) return toast.error(error.message);
    loadBizScoped();
  }

  async function setSectorBusiness(sectorId: string, businessId: string | null) {
    const { error } = await supabase.from("sectors").update({ business_id: businessId }).eq("id", sectorId);
    if (error) return toast.error(error.message);
    loadAll();
  }

  async function toggleEmpBusiness(empId: string, businessId: string, on: boolean) {
    if (on) {
      const { error } = await (supabase.from as any)("employee_businesses").upsert({ employee_id: empId, business_id: businessId });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await (supabase.from as any)("employee_businesses").delete().eq("employee_id", empId).eq("business_id", businessId);
      if (error) return toast.error(error.message);
    }
    loadAll();
  }

  const currentBiz = businesses.find((b) => b.id === activeBiz);

  return (
    <AppShell title="Metas">
      <PageHeader
        title="Metas por negócio"
        description="Cada negócio (CNPJ) tem sua própria meta mensal, distribuída por setor e funcionário. A meta diária é calculada automaticamente."
        icon={Target}
        actions={
          <div className="flex items-center gap-2">
            <Input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} className="w-[160px]" />
            <AlertDialog onOpenChange={(o) => { if (!o) setResetConfirmText(""); }}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm"><Trash2 className="size-4 mr-1" />Resetar todas as metas</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-destructive" />Essa ação apagará TODAS as metas</AlertDialogTitle>
                  <AlertDialogDescription>
                    Serão removidas todas as metas de negócios, setores e funcionários — de TODOS os meses. O sistema voltará para o modo de configuração inicial e os dashboards ficarão bloqueados até nova definição.
                    <br /><br />
                    Para confirmar, digite <strong>APAGAR</strong> abaixo:
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder="Digite APAGAR" autoFocus />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={resetConfirmText !== "APAGAR"}
                    onClick={resetAllGoals}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Apagar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      {/* Seletor de negócio */}
      <div className="flex flex-wrap gap-2 mb-4">
        {businesses.map((b) => (
          <Button key={b.id} size="sm" variant={b.id === activeBiz ? "default" : "outline"} onClick={() => setActiveBiz(b.id)}>
            <Briefcase className="size-4 mr-1" />{b.name}
          </Button>
        ))}
      </div>

      {currentBiz && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <StatCard label={`Meta — ${currentBiz.name}`} value={fmtBRL(bizGoal.target_amount || 0)} icon={Target} tone="primary" hint={`${bizGoal.working_days} dias úteis`} />
            <StatCard label="Soma setores" value={fmtBRL(sectorTotal)} icon={Building2}
              tone={sectorTotal === Number(bizGoal.target_amount || 0) && sectorTotal > 0 ? "success" : "warning"}
              hint={bizGoal.target_amount ? `${Math.round((sectorTotal / bizGoal.target_amount) * 100)}% da meta` : "—"} />
            <StatCard label="Soma funcionários" value={fmtBRL(empTotal)} icon={Users}
              tone={empTotal === sectorTotal && sectorTotal > 0 ? "success" : "warning"}
              hint={sectorTotal ? `${Math.round((empTotal / sectorTotal) * 100)}% dos setores` : "—"} />
          </div>

          <Tabs defaultValue="negocio">
            <TabsList>
              <TabsTrigger value="negocio">1. Negócio</TabsTrigger>
              <TabsTrigger value="setor">2. Setores</TabsTrigger>
              <TabsTrigger value="func">3. Funcionários</TabsTrigger>
              <TabsTrigger value="vinculos"><Link2 className="size-4 mr-1" />Vínculos</TabsTrigger>
            </TabsList>

            <TabsContent value="negocio">
              <Card>
                <CardHeader><CardTitle className="text-base">Meta mensal — {currentBiz.name}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Meta total (R$)</Label>
                      <Input type="number" step="100" value={bizGoal.target_amount}
                        onChange={(e) => setBizGoal({ ...bizGoal, target_amount: Number(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <Label className="text-xs">Dias úteis no mês</Label>
                      <Input type="number" value={bizGoal.working_days}
                        onChange={(e) => setBizGoal({ ...bizGoal, working_days: Number(e.target.value) || 22 })} />
                    </div>
                    <div>
                      <Label className="text-xs">Observações</Label>
                      <Input value={bizGoal.notes} onChange={(e) => setBizGoal({ ...bizGoal, notes: e.target.value })} placeholder="opcional" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={saveBizGoal}>Salvar meta</Button>
                    <Button variant="outline" onClick={distributeAmongSectors}><Wand2 className="size-4 mr-1" />Distribuir entre setores</Button>
                  </div>
                  {bizGoal.target_amount > 0 && bizGoal.working_days > 0 && (
                    <div className="rounded-md border bg-primary/5 p-3 text-sm flex items-center gap-2">
                      <Calculator className="size-4 text-primary" />
                      Meta diária do negócio: <strong>{fmtBRL(bizGoal.target_amount / bizGoal.working_days)}</strong>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="setor">
              <Card>
                <CardHeader><CardTitle className="text-base">Setores deste negócio</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {bizSectors.length === 0 && <p className="text-sm text-muted-foreground">Nenhum setor vinculado a este negócio. Vá até a aba <strong>Vínculos</strong> para associar.</p>}
                  {bizSectors.map((s) => {
                    const empsCount = bizEmployees.filter((e) => e.sector_id === s.id).length;
                    const dailySector = bizGoal.working_days ? Number(s.monthly_revenue_target) / bizGoal.working_days : 0;
                    const pct = bizGoal.target_amount ? Math.round((Number(s.monthly_revenue_target) / bizGoal.target_amount) * 100) : 0;
                    return (
                      <div key={s.id} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{empsCount} funcionário(s) · diária do setor: {fmtBRL(dailySector)}</div>
                          </div>
                          <div className="flex gap-2 items-end">
                            <div>
                              <Label className="text-xs">Meta mensal (R$)</Label>
                              <Input type="number" step="100" defaultValue={s.monthly_revenue_target}
                                onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== s.monthly_revenue_target) updateSectorTarget(s.id, v); }}
                                className="w-40" />
                            </div>
                            <Button size="sm" variant="outline" onClick={() => distributeSectorToEmployees(s.id)} disabled={empsCount === 0}>
                              <Wand2 className="size-4 mr-1" />Distribuir
                            </Button>
                          </div>
                        </div>
                        <Progress value={Math.min(100, pct)} />
                        <div className="text-xs text-muted-foreground">{pct}% da meta do negócio</div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="func">
              <Card>
                <CardHeader><CardTitle className="text-base">Metas individuais</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {bizEmployees.length === 0 && <p className="text-sm text-muted-foreground">Nenhum funcionário vinculado a este negócio.</p>}
                  {bizSectors.map((sec) => {
                    const list = bizEmployees.filter((e) => e.sector_id === sec.id);
                    if (list.length === 0) return null;
                    return (
                      <div key={sec.id} className="space-y-2">
                        <h3 className="text-sm font-semibold mt-3">{sec.name}</h3>
                        {list.map((e) => {
                          const g = empGoals[e.id];
                          const target = g?.target_amount ?? 0;
                          const days = g?.working_days ?? bizGoal.working_days ?? 22;
                          const daily = days ? target / days : 0;
                          return (
                            <div key={e.id} className="border rounded-md p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                              <div className="md:col-span-4">
                                <Label className="text-xs">Funcionário</Label>
                                <div className="text-sm font-medium">{e.full_name}</div>
                              </div>
                              <div className="md:col-span-3">
                                <Label className="text-xs">Meta mensal (R$)</Label>
                                <Input type="number" step="50" defaultValue={target}
                                  onBlur={(ev) => { const v = Number(ev.target.value) || 0; if (v !== target) saveEmpGoal(e.id, v, days); }} />
                              </div>
                              <div className="md:col-span-2">
                                <Label className="text-xs">Dias úteis</Label>
                                <Input type="number" defaultValue={days}
                                  onBlur={(ev) => { const v = Number(ev.target.value) || 22; if (v !== days) saveEmpGoal(e.id, target, v); }} />
                              </div>
                              <div className="md:col-span-3">
                                <Label className="text-xs">Meta diária</Label>
                                <div className="text-sm font-semibold text-primary">{fmtBRL(daily)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {bizEmployees.filter((e) => !bizSectors.some((s) => s.id === e.sector_id)).length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="text-sm font-semibold">Sem setor vinculado neste negócio</h3>
                      {bizEmployees.filter((e) => !bizSectors.some((s) => s.id === e.sector_id)).map((e) => {
                        const g = empGoals[e.id];
                        const target = g?.target_amount ?? 0;
                        const days = g?.working_days ?? bizGoal.working_days ?? 22;
                        return (
                          <div key={e.id} className="border rounded-md p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                            <div className="md:col-span-4 text-sm font-medium">{e.full_name}</div>
                            <div className="md:col-span-3">
                              <Label className="text-xs">Meta mensal (R$)</Label>
                              <Input type="number" step="50" defaultValue={target}
                                onBlur={(ev) => { const v = Number(ev.target.value) || 0; if (v !== target) saveEmpGoal(e.id, v, days); }} />
                            </div>
                            <div className="md:col-span-2">
                              <Label className="text-xs">Dias úteis</Label>
                              <Input type="number" defaultValue={days}
                                onBlur={(ev) => { const v = Number(ev.target.value) || 22; if (v !== days) saveEmpGoal(e.id, target, v); }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vinculos">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="size-4" />Setores → Negócio</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {sectors.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 border rounded-md p-2">
                        <div className="text-sm font-medium">{s.name}</div>
                        <Select value={s.business_id || "none"} onValueChange={(v) => setSectorBusiness(s.id, v === "none" ? null : v)}>
                          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— sem negócio —</SelectItem>
                            {businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="size-4" />Funcionários × Negócios</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">Marque os negócios em que cada pessoa atua (ex.: Juliana e Val nos dois CNPJs de licitação).</p>
                    {employees.map((e) => {
                      const my = new Set(empBiz.filter((x) => x.employee_id === e.id).map((x) => x.business_id));
                      return (
                        <div key={e.id} className="border rounded-md p-2 space-y-1">
                          <div className="text-sm font-medium">{e.full_name}</div>
                          <div className="flex flex-wrap gap-3">
                            {businesses.map((b) => (
                              <label key={b.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <Checkbox checked={my.has(b.id)} onCheckedChange={(v) => toggleEmpBusiness(e.id, b.id, Boolean(v))} />
                                <span>{b.name}</span>
                              </label>
                            ))}
                          </div>
                          {my.size > 1 && <Badge variant="secondary" className="text-[10px]">multi-negócio</Badge>}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {businesses.length === 0 && (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Nenhum negócio cadastrado.</CardContent></Card>
      )}
    </AppShell>
  );
}
