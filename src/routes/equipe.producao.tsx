import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { computeStatus, todayISO } from "@/lib/team";
import { toast } from "sonner";
import { fmtBRL, fmtNum } from "@/lib/format";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/equipe/producao")({ component: ProducaoPage });

type Emp = { id: string; full_name: string; sector_id: string | null };
type Metric = { id: string; name: string; unit: string; daily_goal: number; sort_order: number; value_type: "quantidade" | "monetario" };
type Entry = { value: string; notes: string; existingId?: string };

type Receipt = {
  empName: string;
  sectorName: string;
  date: string;
  submittedAt: string;
  status: string;
  rows: { name: string; unit: string; goal: number; value: number; notes: string; valueType: "quantidade" | "monetario" }[];
  company: string;
};

function ProducaoPage() {
  const { user, isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [empId, setEmpId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [employee, setEmployee] = useState<Emp | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (isAdmin) {
        const { data } = await supabase.from("employees").select("id, full_name, sector_id").eq("active", true).order("full_name");
        setEmployees((data || []) as Emp[]);
        if (data && data[0]) setEmpId(data[0].id);
      } else {
        const { data } = await supabase.from("employees").select("id, full_name, sector_id").eq("user_id", user.id).maybeSingle();
        if (data) { setEmployee(data as Emp); setEmpId(data.id); }
      }
    })();
  }, [user, isAdmin]);

  useEffect(() => {
    if (!empId) return;
    (async () => {
      const emp = employees.find((e) => e.id === empId) || employee;
      if (!emp || !emp.sector_id) {
        setMetrics([]); setEntries({}); return;
      }
      const [{ data: m }, { data: prods }] = await Promise.all([
        supabase.from("sector_metrics").select("id, name, unit, daily_goal, sort_order, value_type")
          .eq("sector_id", emp.sector_id).eq("active", true).order("sort_order"),
        supabase.from("daily_production_metrics").select("id, metric_id, realized_value, notes")
          .eq("employee_id", empId).eq("production_date", date),
      ]);
      const ms = (m || []) as Metric[];
      setMetrics(ms);
      const map: Record<string, Entry> = {};
      ms.forEach((mt) => {
        const ex = (prods || []).find((p) => p.metric_id === mt.id);
        map[mt.id] = {
          value: ex ? String(ex.realized_value) : "",
          notes: ex?.notes || "",
          existingId: ex?.id,
        };
      });
      setEntries(map);
    })();
  }, [empId, date, employees, employee]);

  if (!user) return null;
  if (!isAdmin && !employee) {
    return (
      <AppShell title="Lançamento de produção">
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Seu usuário ainda não está vinculado a um funcionário. Peça ao administrador.</CardContent></Card>
      </AppShell>
    );
  }

  async function submit() {
    if (!empId) return;
    if (metrics.length === 0) return toast.error("Setor sem métricas configuradas");
    const status = computeStatus();
    const submittedAt = new Date().toISOString();
    const rows = metrics.map((m) => ({
      employee_id: empId,
      metric_id: m.id,
      production_date: date,
      realized_value: Number(entries[m.id]?.value) || 0,
      notes: entries[m.id]?.notes || "",
      status,
      submitted_at: submittedAt,
    }));
    const { error } = await supabase
      .from("daily_production_metrics")
      .upsert(rows, { onConflict: "employee_id,metric_id,production_date" });
    if (error) return toast.error(error.message);
    toast.success(`Produção registrada (${status === "no_prazo" ? "no prazo" : "atrasado"})`);

    // Monta o comprovante
    const emp = employees.find((e) => e.id === empId) || employee;
    let sectorName = "";
    if (emp?.sector_id) {
      const { data: s } = await supabase.from("sectors").select("name").eq("id", emp.sector_id).maybeSingle();
      sectorName = s?.name || "";
    }
    const { data: cs } = await supabase.from("company_settings").select("company_name").maybeSingle();
    setReceipt({
      empName: emp?.full_name || "",
      sectorName,
      date,
      submittedAt,
      status: status === "no_prazo" ? "No prazo" : "Atrasado",
      company: cs?.company_name || "Minha Empresa",
      rows: metrics.map((m) => ({
        name: m.name,
        unit: m.unit,
        goal: m.daily_goal,
        value: Number(entries[m.id]?.value) || 0,
        notes: entries[m.id]?.notes || "",
        valueType: m.value_type || "quantidade",
      })),
    });
    setTimeout(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function doPrint() {
    window.print();
  }

  const currentEmp = employees.find((e) => e.id === empId) || employee;

  return (
    <AppShell title="Lançamento diário de produção">
      <div className="no-print">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">{currentEmp?.full_name || "Selecione o funcionário"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isAdmin && (
              <div>
                <Label className="text-xs">Funcionário</Label>
                <select className="w-full border rounded px-2 py-2 text-sm bg-background" value={empId} onChange={(e) => setEmpId(e.target.value)}>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {currentEmp && !currentEmp.sector_id && (
              <div className="text-sm text-amber-600 border border-amber-300 bg-amber-50 rounded p-3">
                Este funcionário não está vinculado a um setor. Atribua um setor em Funcionários.
              </div>
            )}

            {metrics.length === 0 && currentEmp?.sector_id && (
              <div className="text-sm text-muted-foreground border rounded p-3">
                O setor deste funcionário ainda não tem métricas. Cadastre em "Metas".
              </div>
            )}

            {metrics.map((m) => {
              const isMoney = m.value_type === "monetario";
              const goalLabel = isMoney ? fmtBRL(m.daily_goal) : `${m.daily_goal} ${m.unit}`;
              const currentVal = Number(entries[m.id]?.value) || 0;
              return (
                <div key={m.id} className="border rounded p-3 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-sm font-medium">{m.name} {isMoney && <span className="text-xs text-muted-foreground">(R$)</span>}</Label>
                    <span className="text-xs text-muted-foreground">Meta diária: {goalLabel}</span>
                  </div>
                  <div className="relative">
                    {isMoney && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>}
                    <Input
                      type="number"
                      step={isMoney ? "0.01" : "1"}
                      placeholder={isMoney ? "0,00" : "0"}
                      className={isMoney ? "pl-9" : ""}
                      value={entries[m.id]?.value || ""}
                      onChange={(e) => setEntries((s) => ({ ...s, [m.id]: { ...s[m.id], value: e.target.value, notes: s[m.id]?.notes || "" } }))}
                    />
                  </div>
                  {isMoney && currentVal > 0 && (
                    <div className="text-xs text-muted-foreground">{fmtBRL(currentVal)}</div>
                  )}
                  <Textarea
                    rows={2}
                    placeholder="Observações (opcional)"
                    value={entries[m.id]?.notes || ""}
                    onChange={(e) => setEntries((s) => ({ ...s, [m.id]: { ...s[m.id], notes: e.target.value, value: s[m.id]?.value || "" } }))}
                  />
                </div>
              );
            })}

            {metrics.length > 0 && (
              <Button onClick={submit} className="w-full">Confirmar e gerar comprovante</Button>
            )}
          </CardContent>
        </Card>
      </div>

      {receipt && (
        <Card className="max-w-2xl mt-4 no-print">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Comprovante de produção</CardTitle>
            <Button onClick={doPrint} size="sm"><Printer className="size-4 mr-1" />Imprimir</Button>
          </CardHeader>
          <CardContent>
            <ReceiptView data={receipt} preview />
          </CardContent>
        </Card>
      )}

      {receipt && (
        <div id="print-area" ref={receiptRef} className="hidden print:block">
          <ReceiptView data={receipt} />
        </div>
      )}
    </AppShell>
  );
}

function ReceiptView({ data, preview }: { data: Receipt; preview?: boolean }) {
  const dateBR = new Date(data.date + "T00:00:00").toLocaleDateString("pt-BR");
  const submittedBR = new Date(data.submittedAt).toLocaleString("pt-BR");
  return (
    <div className={preview ? "border rounded p-4 bg-white text-black text-sm" : "text-sm"}>
      <div className="text-center border-b pb-2 mb-3">
        <div className="font-bold text-base uppercase">{data.company}</div>
        <div className="text-xs">Comprovante de Produção Diária</div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div><strong>Funcionário:</strong> {data.empName}</div>
        <div><strong>Setor:</strong> {data.sectorName || "—"}</div>
        <div><strong>Data da produção:</strong> {dateBR}</div>
        <div><strong>Status:</strong> {data.status}</div>
        <div className="col-span-2"><strong>Confirmado em:</strong> {submittedBR}</div>
      </div>

      <table className="w-full border-collapse text-sm mb-4">
        <thead>
          <tr className="border-b border-t">
            <th className="text-left py-1 px-1">Métrica</th>
            <th className="text-right py-1 px-1">Meta</th>
            <th className="text-right py-1 px-1">Realizado</th>
            <th className="text-left py-1 px-1">Un.</th>
            <th className="text-left py-1 px-1">Observação</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => {
            const isMoney = r.valueType === "monetario";
            return (
              <tr key={i} className="border-b align-top">
                <td className="py-1 px-1">{r.name}</td>
                <td className="text-right py-1 px-1">{isMoney ? fmtBRL(r.goal) : fmtNum(r.goal)}</td>
                <td className="text-right py-1 px-1 font-medium">{isMoney ? fmtBRL(r.value) : fmtNum(r.value)}</td>
                <td className="py-1 px-1">{isMoney ? "R$" : r.unit}</td>
                <td className="py-1 px-1">{r.notes}</td>
              </tr>
            );
          })}
          {(() => {
            const totalMoney = data.rows.filter((r) => r.valueType === "monetario").reduce((sum, r) => sum + (Number(r.value) || 0), 0);
            if (totalMoney <= 0) return null;
            return (
              <tr className="border-t-2 font-semibold">
                <td className="py-2 px-1" colSpan={2}>Total monetário</td>
                <td className="text-right py-2 px-1">{fmtBRL(totalMoney)}</td>
                <td colSpan={2}></td>
              </tr>
            );
          })()}
        </tbody>
      </table>

      <div className="text-xs mb-6">
        Declaro que as informações de produção acima foram preenchidas por mim e
        correspondem ao realizado no dia.
      </div>

      <div className="grid grid-cols-2 gap-8 mt-12">
        <div className="text-center">
          <div className="border-t pt-1 text-xs">Assinatura do funcionário</div>
          <div className="text-xs mt-1">{data.empName}</div>
        </div>
        <div className="text-center">
          <div className="border-t pt-1 text-xs">Assinatura do gestor</div>
          <div className="text-xs mt-1">&nbsp;</div>
        </div>
      </div>
    </div>
  );
}
