import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import { Printer, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/equipe/atas/$id")({ component: AtaDetail });

function AtaDetail() {
  const { id } = Route.useParams();
  const [m, setM] = useState<any>(null);
  const [parts, setParts] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [occs, setOccs] = useState<any[]>([]);

  const load = async () => {
    const [mr, pr, tr, or] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", id).maybeSingle(),
      supabase.from("meeting_participants").select("*, employees(full_name)").eq("meeting_id", id),
      supabase.from("tasks").select("*, employees(full_name)").eq("source", "ata").eq("source_id", id),
      supabase.from("occurrences").select("*, employees(full_name)").eq("source", "ata").eq("source_id", id),
    ]);
    setM(mr.data); setParts(pr.data || []); setTasks(tr.data || []); setOccs(or.data || []);
  };
  useEffect(() => { load(); }, [id]);

  const toggleTask = async (t: any) => {
    const newStatus = t.status === "concluida" ? "pendente" : "concluida";
    await supabase.from("tasks").update({ status: newStatus }).eq("id", t.id);
    load();
  };

  if (!m) return <AppShell title="Ata"><div className="text-sm text-muted-foreground">Carregando...</div></AppShell>;

  const guidelines = (m.guidelines || {}) as Record<string, boolean>;
  const dirNames: Record<string, string> = { uso_sistema: "Uso obrigatório do sistema", prazos: "Cumprimento de prazos", resposta_15min: "Resposta em até 15 min", comunicacao: "Comunicação com gestão" };

  return (
    <AppShell title="Ata de Reunião" actions={
      <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4 mr-1" />Imprimir</Button>
    }>
      <div className="grid gap-4 max-w-4xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">{fmtDate(m.meeting_date)} · {String(m.meeting_time).slice(0,5)}</CardTitle>
              <div className="flex gap-1">
                <Badge variant="secondary">{m.meeting_type}</Badge>
                <Badge variant="outline">{m.area}</Badge>
                <Badge>{m.status}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Pauta</div>{m.agenda || "(sem pauta)"}</div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Diretrizes</div>
              <ul className="list-disc pl-5">
                {Object.keys(dirNames).map((k) => guidelines[k] ? <li key={k}>{dirNames[k]}</li> : null)}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Participantes</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {parts.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b py-1 last:border-0">
                <span>{p.employees?.full_name}</span>
                {p.present
                  ? <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle2 className="size-4" />Presente</span>
                  : <span className="text-destructive text-xs flex items-center gap-1"><XCircle className="size-4" />Ausente</span>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tarefas geradas ({tasks.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {tasks.length === 0 && <div className="text-muted-foreground text-xs">Sem tarefas.</div>}
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between border rounded p-2 gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.employees?.full_name || "Sem responsável"} · Prazo: {t.due_date ? fmtDate(t.due_date) : "—"}
                  </div>
                </div>
                <Button size="sm" variant={t.status === "concluida" ? "secondary" : "default"} onClick={() => toggleTask(t)}>
                  {t.status === "concluida" ? "Reabrir" : "Concluir"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ocorrências geradas ({occs.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {occs.length === 0 && <div className="text-muted-foreground text-xs">Nenhuma ocorrência.</div>}
            {occs.map((o) => (
              <div key={o.id} className="flex items-center justify-between border-b py-1 last:border-0">
                <span>{o.employees?.full_name} — <span className="text-muted-foreground">{o.occurrence_type}</span></span>
                <Badge variant="outline">{o.severity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <div><Link to="/equipe/atas" className="text-sm text-primary underline">← Voltar para lista</Link></div>
      </div>
    </AppShell>
  );
}
