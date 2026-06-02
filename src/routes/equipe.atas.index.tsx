import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileText, ClipboardList } from "lucide-react";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/equipe/atas/")({ component: AtasList });

const TIPOS = ["alinhamento", "reuniao", "correcao", "advertencia"] as const;
const AREAS = ["credito", "licitacao", "administrativo", "posto", "geral"] as const;

function AtasList() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fDate, setFDate] = useState("");
  const [fArea, setFArea] = useState<string>("all");
  const [fTipo, setFTipo] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("meetings").select("*").order("meeting_date", { ascending: false }).order("meeting_time", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (!fDate || r.meeting_date === fDate) &&
    (fArea === "all" || r.area === fArea) &&
    (fTipo === "all" || r.meeting_type === fTipo)
  ), [rows, fDate, fArea, fTipo]);

  return (
    <AppShell title="Atas de Reunião" actions={
      <Link to="/equipe/atas/nova"><Button size="sm"><Plus className="size-4 mr-1" />Nova Ata</Button></Link>
    }>
      <PageHeader
        title="Atas de Reunião"
        description="Registre reuniões e gere tarefas e ocorrências automaticamente."
        icon={ClipboardList}
      />
      <Card className="mb-4">
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Data</label>
            <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Área</label>
            <Select value={fArea} onValueChange={setFArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tipo</label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={() => { setFDate(""); setFArea("all"); setFTipo("all"); }}>Limpar</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma ata encontrada.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((m) => (
            <Link key={m.id} to="/equipe/atas/$id" params={{ id: m.id }}>
              <Card className="hover:border-primary transition">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="size-4 text-primary" />
                      {fmtDate(m.meeting_date)} · {String(m.meeting_time).slice(0,5)}
                    </CardTitle>
                    <div className="flex gap-1">
                      <Badge variant="secondary">{m.meeting_type}</Badge>
                      <Badge variant="outline">{m.area}</Badge>
                      <Badge>{m.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground line-clamp-2">{m.agenda || "(sem pauta)"}</CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
