import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ShieldAlert, RefreshCw, Eye } from "lucide-react";

export const Route = createFileRoute("/auditoria")({ component: AuditoriaPage });

interface AuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: "INSERT" | "UPDATE" | "DELETE" | string;
  table_name: string;
  record_id: string | null;
  old_data: unknown;
  new_data: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_BADGE: Record<string, string> = {
  INSERT: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
};

function AuditoriaPage() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterTable, setFilterTable] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<AuditRow | null>(null);

  async function load() {
    setBusy(true);
    let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500);
    if (filterAction !== "all") q = q.eq("action", filterAction);
    if (filterTable !== "all") q = q.eq("table_name", filterTable);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", `${to}T23:59:59`);
    const { data } = await q;
    setRows((data || []) as AuditRow[]);
    setBusy(false);
  }

  useEffect(() => { if (!loading && isAdmin) load(); }, [loading, isAdmin]);

  const filtered = useMemo(() => {
    if (!filterUser.trim()) return rows;
    const q = filterUser.toLowerCase();
    return rows.filter((r) => (r.user_email || "").toLowerCase().includes(q));
  }, [rows, filterUser]);

  const tables = useMemo(() => Array.from(new Set(rows.map((r) => r.table_name))).sort(), [rows]);

  if (loading) return <AppShell title="Auditoria"><div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div></AppShell>;

  if (!isAdmin) return (
    <AppShell title="Auditoria">
      <Card><CardContent className="py-16 text-center space-y-3">
        <ShieldAlert className="size-10 text-destructive mx-auto" />
        <p className="font-medium">Acesso restrito</p>
        <p className="text-sm text-muted-foreground">Apenas administradores podem ver os logs de auditoria.</p>
      </CardContent></Card>
    </AppShell>
  );

  return (
    <AppShell
      title="Logs de Auditoria"
      actions={<Button size="sm" variant="outline" onClick={load} disabled={busy}><RefreshCw className={`size-4 mr-2 ${busy ? "animate-spin" : ""}`} />Atualizar</Button>}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><Label>Usuário (e-mail)</Label><Input value={filterUser} onChange={(e) => setFilterUser(e.target.value)} placeholder="parte do email" /></div>
            <div>
              <Label>Ação</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="INSERT">Criação</SelectItem>
                  <SelectItem value="UPDATE">Edição</SelectItem>
                  <SelectItem value="DELETE">Exclusão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tabela</Label>
              <Select value={filterTable} onValueChange={setFilterTable}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="md:col-span-5">
              <Button size="sm" onClick={load} disabled={busy}>Aplicar filtros</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Eventos ({filtered.length})</CardTitle></CardHeader>
          <CardContent className="px-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Data/hora</th>
                  <th className="px-3 py-2 text-left">Usuário</th>
                  <th className="px-3 py-2 text-left">Ação</th>
                  <th className="px-3 py-2 text-left">Tabela</th>
                  <th className="px-3 py-2 text-left">Registro</th>
                  <th className="px-3 py-2 text-right w-20">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.user_email || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge className={`${ACTION_BADGE[r.action] || "bg-muted"} hover:${ACTION_BADGE[r.action] || "bg-muted"}`}>{r.action}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.table_name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate max-w-[200px]">{r.record_id || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => setDetail(r)}><Eye className="size-4" /></Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum evento encontrado.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Detalhes do evento</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Data:</span> {new Date(detail.created_at).toLocaleString("pt-BR")}</div>
                <div><span className="text-muted-foreground">Usuário:</span> {detail.user_email || "—"}</div>
                <div><span className="text-muted-foreground">Ação:</span> {detail.action}</div>
                <div><span className="text-muted-foreground">Tabela:</span> {detail.table_name}</div>
                <div><span className="text-muted-foreground">IP:</span> {detail.ip_address || "—"}</div>
                <div className="truncate"><span className="text-muted-foreground">Navegador:</span> {detail.user_agent || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Registro:</span> <span className="font-mono">{detail.record_id || "—"}</span></div>
              </div>
              {detail.old_data != null && (
                <div>
                  <div className="font-medium mb-1">Antes</div>
                  <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-64">{JSON.stringify(detail.old_data, null, 2)}</pre>
                </div>
              )}
              {detail.new_data != null && (
                <div>
                  <div className="font-medium mb-1">Depois</div>
                  <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-64">{JSON.stringify(detail.new_data, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
