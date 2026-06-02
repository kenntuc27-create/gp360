import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, Coffee, CornerUpLeft, LogOut, Loader2, CalendarDays, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/equipe/ponto")({ component: PontoPage });

type Schedule = { weekday: number; is_off: boolean; start_time: string | null; end_time: string | null; break_start: string | null; break_end: string | null };
type Punch = { id: string; employee_id: string; punch_date: string; punch_type: PunchType; punch_time: string; delay_minutes: number; classification: "ok" | "leve" | "critico" };
type PunchType = "entrada" | "saida_intervalo" | "volta_intervalo" | "saida";
type Emp = { id: string; full_name: string; user_id: string | null };

const TYPE_META: Record<PunchType, { label: string; icon: typeof LogIn; color: string }> = {
  entrada: { label: "Início da jornada", icon: LogIn, color: "bg-emerald-600 hover:bg-emerald-700" },
  saida_intervalo: { label: "Início do intervalo", icon: Coffee, color: "bg-amber-500 hover:bg-amber-600" },
  volta_intervalo: { label: "Retorno do intervalo", icon: CornerUpLeft, color: "bg-sky-600 hover:bg-sky-700" },
  saida: { label: "Encerramento", icon: LogOut, color: "bg-rose-600 hover:bg-rose-700" },
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function weekday(d: Date) { return d.getDay(); }
function timeStr(d: Date) { return d.toTimeString().slice(0, 5); }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

function classify(delay: number): "ok" | "leve" | "critico" {
  if (delay <= 5) return "ok";
  if (delay <= 15) return "leve";
  return "critico";
}

function calcDelay(type: PunchType, sch: Schedule | undefined, now: Date): number {
  if (!sch || sch.is_off) return 0;
  let target: string | null = null;
  if (type === "entrada") target = sch.start_time;
  if (type === "saida_intervalo") target = sch.break_start;
  if (type === "volta_intervalo") target = sch.break_end;
  if (type === "saida") target = sch.end_time;
  if (!target) return 0;
  const [hh, mm] = target.split(":").map(Number);
  const t = new Date(now); t.setHours(hh, mm, 0, 0);
  const diff = Math.round((now.getTime() - t.getTime()) / 60000);
  if (type === "entrada" || type === "volta_intervalo") return Math.max(0, diff); // atraso
  return Math.max(0, -diff); // saída antecipada conta como "atraso"
}

function PontoPage() {
  const { user, isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [me, setMe] = useState<Emp | null>(null);
  const [todayPunches, setTodayPunches] = useState<Punch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PunchType | null>(null);

  // Relatório mensal
  const [reportEmp, setReportEmp] = useState<string>("");
  const [reportMonth, setReportMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [reportData, setReportData] = useState<Punch[]>([]);

  async function load() {
    setLoading(true);
    const [{ data: emps }, { data: schs }] = await Promise.all([
      supabase.from("employees").select("id, full_name, user_id").eq("active", true).order("full_name"),
      supabase.from("work_schedules").select("*").order("weekday"),
    ]);
    setEmployees((emps as Emp[]) || []);
    setSchedules((schs as Schedule[]) || []);
    const myEmp = (emps as Emp[] | null)?.find((e) => e.user_id === user?.id) || null;
    setMe(myEmp);
    if (myEmp) {
      const { data: p } = await supabase.from("time_punches").select("*").eq("employee_id", myEmp.id).eq("punch_date", todayISO()).order("punch_time");
      setTodayPunches((p as Punch[]) || []);
    }
    setLoading(false);
  }
  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  const todaySchedule = useMemo(() => schedules.find((s) => s.weekday === weekday(new Date())), [schedules]);

  async function registrar(type: PunchType) {
    if (!me) { toast.error("Seu usuário não está vinculado a um funcionário."); return; }
    if (todayPunches.some((p) => p.punch_type === type)) { toast.error("Já registrado hoje."); return; }
    setBusy(type);
    try {
      const now = new Date();
      const delay = calcDelay(type, todaySchedule, now);
      const cls = classify(delay);
      const { error } = await supabase.from("time_punches").insert({
        employee_id: me.id,
        punch_date: todayISO(),
        punch_type: type,
        punch_time: now.toISOString(),
        delay_minutes: delay,
        classification: cls,
        source: "self",
      });
      if (error) throw error;
      toast.success(`${TYPE_META[type].label} registrado às ${timeStr(now)}${delay > 0 ? ` (atraso ${delay}min)` : ""}`);
      await load();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function loadReport() {
    if (!reportEmp || !reportMonth) return;
    const start = `${reportMonth}-01`;
    const d = new Date(start); d.setMonth(d.getMonth() + 1);
    const end = d.toISOString().slice(0, 10);
    const { data } = await supabase.from("time_punches").select("*").eq("employee_id", reportEmp).gte("punch_date", start).lt("punch_date", end).order("punch_date").order("punch_time");
    setReportData((data as Punch[]) || []);
  }
  useEffect(() => { loadReport(); /* eslint-disable-next-line */ }, [reportEmp, reportMonth]);

  const reportSummary = useMemo(() => {
    const days = new Map<string, Punch[]>();
    for (const p of reportData) {
      const arr = days.get(p.punch_date) || [];
      arr.push(p); days.set(p.punch_date, arr);
    }
    let workedMin = 0, atrasos = 0, criticos = 0;
    const dayList: { date: string; horas: number; atraso: number; status: string }[] = [];
    for (const [date, ps] of days) {
      const ent = ps.find((x) => x.punch_type === "entrada");
      const sai = ps.find((x) => x.punch_type === "saida");
      const ints = ps.find((x) => x.punch_type === "saida_intervalo");
      const intv = ps.find((x) => x.punch_type === "volta_intervalo");
      let horas = 0;
      if (ent && sai) {
        horas = (new Date(sai.punch_time).getTime() - new Date(ent.punch_time).getTime()) / 3600000;
        if (ints && intv) horas -= (new Date(intv.punch_time).getTime() - new Date(ints.punch_time).getTime()) / 3600000;
      }
      workedMin += horas * 60;
      const maxDelay = Math.max(0, ...ps.map((p) => p.delay_minutes));
      if (maxDelay > 5) atrasos++;
      if (maxDelay > 15) criticos++;
      const status = !ent ? "Falta" : !sai ? "Incompleto" : maxDelay > 15 ? "Atraso crítico" : maxDelay > 5 ? "Atraso leve" : "OK";
      dayList.push({ date, horas, atraso: maxDelay, status });
    }
    dayList.sort((a, b) => a.date.localeCompare(b.date));
    // calcula faltas: dias úteis (não-folga) no mês até hoje sem registro
    const monthStart = new Date(`${reportMonth}-01`);
    const today = new Date();
    const limit = today.toISOString().slice(0, 7) === reportMonth ? today : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    let faltas = 0;
    for (let d = new Date(monthStart); d <= limit; d.setDate(d.getDate() + 1)) {
      const sch = schedules.find((s) => s.weekday === d.getDay());
      if (!sch || sch.is_off) continue;
      const iso = d.toISOString().slice(0, 10);
      if (!days.has(iso)) faltas++;
    }
    return { dayList, totalHoras: workedMin / 60, atrasos, criticos, faltas };
  }, [reportData, schedules, reportMonth]);

  if (loading) return <AppShell title="Ponto"><div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" /></div></AppShell>;

  const punchedTypes = new Set(todayPunches.map((p) => p.punch_type));
  const order: PunchType[] = ["entrada", "saida_intervalo", "volta_intervalo", "saida"];

  return (
    <AppShell title="Controle de Ponto">
      <div className="space-y-5 max-w-3xl mx-auto">
        {/* Bloco do funcionário */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Hoje · {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</span>
              {todaySchedule?.is_off ? (
                <Badge variant="secondary">Folga</Badge>
              ) : todaySchedule ? (
                <Badge variant="outline" className="font-mono text-xs">
                  {todaySchedule.start_time?.slice(0, 5)}–{todaySchedule.end_time?.slice(0, 5)}
                  {todaySchedule.break_start && ` · int ${todaySchedule.break_start.slice(0, 5)}-${todaySchedule.break_end?.slice(0, 5)}`}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!me && <div className="text-sm text-muted-foreground">Seu usuário não está vinculado a um funcionário ativo. Procure o admin.</div>}
            {me && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {order.map((t) => {
                    const meta = TYPE_META[t];
                    const Icon = meta.icon;
                    const done = punchedTypes.has(t);
                    const punch = todayPunches.find((p) => p.punch_type === t);
                    return (
                      <Button
                        key={t}
                        size="lg"
                        disabled={done || busy !== null || todaySchedule?.is_off}
                        onClick={() => registrar(t)}
                        className={`h-20 text-base text-white ${done ? "bg-muted text-muted-foreground hover:bg-muted" : meta.color}`}
                      >
                        {busy === t ? <Loader2 className="size-5 mr-2 animate-spin" /> : <Icon className="size-5 mr-2" />}
                        <div className="text-left">
                          <div className="font-semibold">{meta.label}</div>
                          {done && punch && <div className="text-xs opacity-90">{fmtTime(punch.punch_time)}{punch.delay_minutes > 0 ? ` · +${punch.delay_minutes}min` : ""}</div>}
                        </div>
                      </Button>
                    );
                  })}
                </div>
                {todayPunches.length > 0 && (
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    Registros de hoje: {todayPunches.map((p) => `${TYPE_META[p.punch_type].label} ${fmtTime(p.punch_time)}`).join(" · ")}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Relatório mensal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="size-4" /> Relatório mensal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Funcionário</label>
                <Select value={reportEmp} onValueChange={setReportEmp}>
                  <SelectTrigger className="w-60 h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(isAdmin ? employees : employees.filter((e) => e.id === me?.id)).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Mês</label>
                <Input type="month" className="h-9 w-40" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
              </div>
            </div>
            {reportEmp && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Horas trabalhadas" value={`${reportSummary.totalHoras.toFixed(1)}h`} />
                  <Stat label="Atrasos leves" value={reportSummary.atrasos.toString()} />
                  <Stat label="Atrasos críticos" value={reportSummary.criticos.toString()} tone="rose" />
                  <Stat label="Faltas" value={reportSummary.faltas.toString()} tone="rose" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-right">Horas</th>
                        <th className="px-3 py-2 text-right">Atraso</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportSummary.dayList.map((d) => (
                        <tr key={d.date} className="border-t">
                          <td className="px-3 py-1.5">{new Date(d.date + "T00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{d.horas.toFixed(1)}h</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{d.atraso > 0 ? `${d.atraso}min` : "-"}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant={d.status === "OK" ? "secondary" : d.status.includes("crítico") || d.status === "Falta" ? "destructive" : "outline"}>{d.status}</Badge>
                          </td>
                        </tr>
                      ))}
                      {reportSummary.dayList.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">Sem registros no mês.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="size-4" /> Presença hoje (admin)</CardTitle></CardHeader>
            <CardContent>
              <PresencaHoje employees={employees} />
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Link to="/equipe" className="text-sm text-primary hover:underline">← Voltar</Link>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "rose" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "rose" ? "bg-rose-500/10 border-rose-500/30" : "bg-muted/40"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${tone === "rose" ? "text-rose-600 dark:text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}

function PresencaHoje({ employees }: { employees: Emp[] }) {
  const [punches, setPunches] = useState<Punch[]>([]);
  useEffect(() => {
    supabase.from("time_punches").select("*").eq("punch_date", todayISO()).then(({ data }) => setPunches((data as Punch[]) || []));
  }, []);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Funcionário</th>
            <th className="px-3 py-2 text-left">Entrada</th>
            <th className="px-3 py-2 text-left">Início int.</th>
            <th className="px-3 py-2 text-left">Volta int.</th>
            <th className="px-3 py-2 text-left">Saída</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => {
            const ps = punches.filter((p) => p.employee_id === e.id);
            const get = (t: PunchType) => ps.find((p) => p.punch_type === t);
            const cell = (t: PunchType) => {
              const p = get(t);
              if (!p) return <span className="text-muted-foreground">—</span>;
              const tone = p.classification === "critico" ? "text-rose-600" : p.classification === "leve" ? "text-amber-600" : "text-emerald-600";
              return <span className={tone}>{fmtTime(p.punch_time)}{p.delay_minutes > 0 ? ` (+${p.delay_minutes})` : ""}</span>;
            };
            return (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-1.5">{e.full_name}</td>
                <td className="px-3 py-1.5">{cell("entrada")}</td>
                <td className="px-3 py-1.5">{cell("saida_intervalo")}</td>
                <td className="px-3 py-1.5">{cell("volta_intervalo")}</td>
                <td className="px-3 py-1.5">{cell("saida")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
