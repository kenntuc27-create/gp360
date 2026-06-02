import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";

export const Route = createFileRoute("/equipe/atas/nova")({ component: NovaAta });

const TIPOS = [
  { v: "alinhamento", l: "Alinhamento" },
  { v: "reuniao", l: "Reunião" },
  { v: "correcao", l: "Correção" },
  { v: "advertencia", l: "Advertência" },
];
const AREAS = [
  { v: "credito", l: "Crédito" },
  { v: "licitacao", l: "Licitação" },
  { v: "administrativo", l: "Administrativo" },
  { v: "posto", l: "Posto" },
  { v: "geral", l: "Geral" },
];
const DIRETRIZES = [
  { k: "uso_sistema", l: "Uso obrigatório do sistema" },
  { k: "prazos", l: "Cumprimento de prazos" },
  { k: "resposta_15min", l: "Resposta em até 15 minutos" },
  { k: "comunicacao", l: "Comunicação com gestão" },
];
const STATUS_OPTS = [
  { v: "concluido", l: "Concluído" },
  { v: "parcial", l: "Parcial" },
  { v: "nao_aderido", l: "Não aderido" },
];
const PROBLEMAS = [
  { v: "", l: "Sem problema" },
  { v: "recusa", l: "Recusa" },
  { v: "falta_resposta", l: "Falta de resposta" },
  { v: "descumprimento", l: "Descumprimento de diretriz" },
];

type Action = { id: string; assignee_id: string; description: string; due_date: string };

function NovaAta() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = new Date();
  const [date, setDate] = useState(today.toISOString().slice(0, 10));
  const [time, setTime] = useState(today.toTimeString().slice(0, 5));
  const [tipo, setTipo] = useState("reuniao");
  const [area, setArea] = useState("geral");
  const [agenda, setAgenda] = useState("");
  const [status, setStatus] = useState("concluido");
  const [diretrizes, setDiretrizes] = useState<Record<string, boolean>>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<Action[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("employees").select("id, full_name, sector_id, sectors(name)").eq("active", true).order("full_name").then(({ data }) => {
      setEmployees(data || []);
    });
  }, []);

  const togglePresent = (id: string) => setPresent((p) => ({ ...p, [id]: !p[id] }));
  const addAction = () => setActions((a) => [...a, { id: crypto.randomUUID(), assignee_id: "", description: "", due_date: "" }]);
  const updAction = (id: string, patch: Partial<Action>) => setActions((a) => a.map((x) => x.id === id ? { ...x, ...patch } : x));
  const rmAction = (id: string) => setActions((a) => a.filter((x) => x.id !== id));

  const save = async () => {
    if (!agenda.trim()) { toast.error("Informe a pauta"); return; }
    setSaving(true);
    try {
      const { data: m, error } = await supabase.from("meetings").insert({
        meeting_date: date, meeting_time: time, meeting_type: tipo, area,
        agenda, guidelines: diretrizes, status, created_by: user?.id ?? null,
      } as any).select("id").single();
      if (error) throw error;
      const meetingId = m!.id;

      // Participantes
      const partRows = employees.map((e) => ({
        meeting_id: meetingId, employee_id: e.id, present: !!present[e.id],
      }));
      if (partRows.length) await supabase.from("meeting_participants").insert(partRows);

      // Ocorrências automáticas
      const occRows: any[] = [];
      employees.forEach((e) => {
        if (!present[e.id]) {
          occRows.push({
            employee_id: e.id, occurrence_type: "Ausência em reunião",
            severity: "media", source: "ata", source_id: meetingId,
            notes: `Ausência registrada na ata de ${date}`, created_by: user?.id ?? null,
          });
        }
        const prob = problems[e.id];
        if (prob) {
          occRows.push({
            employee_id: e.id, occurrence_type: prob === "recusa" ? "Recusa" : prob === "falta_resposta" ? "Falta de resposta" : "Descumprimento",
            severity: "media", source: "ata", source_id: meetingId,
            notes: `Sinalizado durante a ata de ${date}`, created_by: user?.id ?? null,
          });
        }
      });
      if (occRows.length) await supabase.from("occurrences").insert(occRows);

      // Tarefas
      const taskRows = actions
        .filter((a) => a.description.trim())
        .map((a) => ({
          title: a.description.slice(0, 120),
          description: a.description,
          assignee_id: a.assignee_id || null,
          due_date: a.due_date || null,
          status: "pendente",
          source: "ata",
          source_id: meetingId,
          created_by: user?.id ?? null,
        }));
      if (taskRows.length) await supabase.from("tasks").insert(taskRows);

      toast.success("Ata salva com tarefas e ocorrências geradas.");
      navigate({ to: "/equipe/atas/$id", params: { id: meetingId } });
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar ata");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Nova Ata de Reunião" actions={
      <Button onClick={save} disabled={saving} size="sm"><Save className="size-4 mr-1" />Salvar Ata</Button>
    }>
      <div className="grid gap-4 max-w-4xl">
        <Card>
          <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Hora</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Área</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AREAS.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pauta</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={2} placeholder="Ex.: Alinhamento de rotina e uso do sistema" value={agenda} onChange={(e) => setAgenda(e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Diretrizes</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {DIRETRIZES.map((d) => (
              <label key={d.k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!diretrizes[d.k]} onCheckedChange={(v) => setDiretrizes((s) => ({ ...s, [d.k]: !!v }))} />
                {d.l}
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Participantes ({employees.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-muted-foreground">Marque quem participou. Os não marcados serão registrados como ausentes (gera ocorrência automática).</div>
            {employees.map((e) => (
              <div key={e.id} className="flex flex-col md:flex-row md:items-center gap-2 border rounded p-2">
                <label className="flex items-center gap-2 flex-1 text-sm">
                  <Checkbox checked={!!present[e.id]} onCheckedChange={() => togglePresent(e.id)} />
                  <span className="font-medium">{e.full_name}</span>
                  <span className="text-xs text-muted-foreground">{e.sectors?.name || ""}</span>
                </label>
                <div className="md:w-56">
                  <Select value={problems[e.id] || ""} onValueChange={(v) => setProblems((p) => ({ ...p, [e.id]: v }))}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Sem problema" /></SelectTrigger>
                    <SelectContent>{PROBLEMAS.map((p) => <SelectItem key={p.v || "none"} value={p.v || "none"}>{p.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Ações (viram tarefas)</CardTitle>
            <Button size="sm" variant="outline" onClick={addAction}><Plus className="size-4 mr-1" />Adicionar</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {actions.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma ação adicionada.</div>}
            {actions.map((a) => (
              <div key={a.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start border rounded p-2">
                <div className="md:col-span-4">
                  <Label className="text-xs">Responsável</Label>
                  <Select value={a.assignee_id} onValueChange={(v) => updAction(a.id, { assignee_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-5">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={a.description} onChange={(e) => updAction(a.id, { description: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Prazo</Label>
                  <Input type="date" value={a.due_date} onChange={(e) => updAction(a.id, { due_date: e.target.value })} />
                </div>
                <div className="md:col-span-1 flex items-end justify-end h-full">
                  <Button size="icon" variant="ghost" onClick={() => rmAction(a.id)}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Status da Ata</CardTitle></CardHeader>
          <CardContent>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}><Save className="size-4 mr-1" />Salvar Ata</Button>
        </div>
      </div>
    </AppShell>
  );
}
