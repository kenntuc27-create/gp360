import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Search, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/fornecedores")({ component: Fornecedores });

interface Segment { id: string; name: string; }
interface Supplier {
  id: string; razao_social: string; cnpj: string; contato: string;
  telefone: string; whatsapp: string; email: string; cidade: string; segmento: string; tipo: string;
  segment_id?: string | null;
  company_tipo?: string | null;
  standard_discount_type?: string;
  standard_discount_value?: number;
  performance_metrics?: any;
}
const empty: Supplier = { 
  id: "", razao_social: "", cnpj: "", contato: "", telefone: "", whatsapp: "", email: "", cidade: "", segmento: "", tipo: "distribuidor",
  company_tipo: "ambas",
  standard_discount_type: "percentage", standard_discount_value: 0
};

function Fornecedores() {
  const [list, setList] = useState<Supplier[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier>(empty);

  async function load() {
    const [{ data: sData }, { data: segData }] = await Promise.all([
      supabase.from("suppliers").select("*").order("razao_social"),
      supabase.from("segments").select("id, name").order("name")
    ]);
    setList((sData as Supplier[]) || []);
    setSegments((segData as Segment[]) || []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit.razao_social.trim()) { toast.error("Razão social obrigatória"); return; }

    // Mantém apenas colunas que existem na tabela suppliers
    const payload: Record<string, any> = {
      razao_social: edit.razao_social,
      cnpj: edit.cnpj || "",
      contato: edit.contato || "",
      telefone: edit.telefone || "",
      whatsapp: edit.whatsapp || "",
      email: edit.email || "",
      cidade: edit.cidade || "",
      segmento: edit.segmento || "",
      tipo: edit.tipo || "distribuidor",
    };

    if (edit.id) {
      const { error } = await supabase.from("suppliers").update(payload as any).eq("id", edit.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("suppliers").insert(payload as any);
      if (error) { toast.error(error.message); return; }
    }

    toast.success("Fornecedor salvo com sucesso");
    setOpen(false); setEdit(empty); load();
  }
  async function remove(id: string) {
    if (!confirm("Excluir fornecedor?")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    load();
  }

  const filtered = list.filter((s) => {
    const t = q.toLowerCase();
    return !t || s.razao_social.toLowerCase().includes(t) || s.cnpj.includes(t) || s.cidade.toLowerCase().includes(t) || s.segmento.toLowerCase().includes(t);
  });

  return (
    <AppShell title="Fornecedores" actions={
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEdit(empty); }}>
        <DialogTrigger asChild><Button><Plus className="size-4 mr-2" />Novo Fornecedor</Button></DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit.id ? "Editar" : "Novo"} Fornecedor</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Razão Social *</Label><Input value={edit.razao_social} onChange={(e) => setEdit({ ...edit, razao_social: e.target.value })} /></div>
            <div><Label>CNPJ</Label><Input value={edit.cnpj} onChange={(e) => setEdit({ ...edit, cnpj: e.target.value })} /></div>
            <div><Label>Contato</Label><Input value={edit.contato} onChange={(e) => setEdit({ ...edit, contato: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={edit.telefone} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} /></div>
            <div><Label>WhatsApp</Label><Input value={edit.whatsapp} onChange={(e) => setEdit({ ...edit, whatsapp: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div><Label>Cidade</Label><Input value={edit.cidade} onChange={(e) => setEdit({ ...edit, cidade: e.target.value })} /></div>
            <div className="col-span-2">
              <Label>Segmento Operacional</Label>
              <Select 
                value={edit.segment_id || "none"} 
                onValueChange={(v) => setEdit({ ...edit, segment_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione um segmento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Desconto Padrão</Label>
              <div className="flex gap-2">
                <Select 
                  value={edit.standard_discount_type || "percentage"} 
                  onValueChange={(v) => setEdit({ ...edit, standard_discount_type: v })}
                >
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">%</SelectItem>
                    <SelectItem value="fixed">R$</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={edit.standard_discount_value} onChange={(e) => setEdit({ ...edit, standard_discount_value: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Tipo de Empresa</Label>
              <Select value={edit.tipo || "distribuidor"} onValueChange={(v) => setEdit({ ...edit, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="distribuidor">Distribuidor</SelectItem>
                  <SelectItem value="industria">Indústria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Atende qual operação? *</Label>
              <Select value={edit.company_tipo || "ambas"} onValueChange={(v) => setEdit({ ...edit, company_tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a operação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="medicamentos">Medicamentos</SelectItem>
                  <SelectItem value="empreendimentos">Empreendimentos</SelectItem>
                  <SelectItem value="ambas">Ambas (Medicamentos + Empreendimentos)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Define em qual operação este fornecedor estará disponível para cotação.</p>
            </div>
          </div>
          <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    }>
      <Card>
        <CardContent className="pt-6 px-0">
          <div className="px-6 mb-4">
            <div className="relative max-w-md">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar fornecedor…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">Razão Social</th>
                  <th className="px-6 py-3 text-left">CNPJ</th>
                  <th className="px-6 py-3 text-left">Contato</th>
                  <th className="px-6 py-3 text-left">Telefone</th>
                  <th className="px-6 py-3 text-left">Cidade</th>
                  <th className="px-6 py-3 text-left">Operação</th>
                  <th className="px-6 py-3 text-left">Segmento</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-muted/40">
                    <td className="px-6 py-3 font-medium">{s.razao_social}</td>
                    <td className="px-6 py-3">{s.cnpj || "-"}</td>
                    <td className="px-6 py-3">{s.contato || "-"}</td>
                    <td className="px-6 py-3">{s.telefone || s.whatsapp || "-"}</td>
                    <td className="px-6 py-3">{s.cidade || "-"}</td>
                    <td className="px-6 py-3">
                      {s.company_tipo === "medicamentos" && <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">Medicamentos</span>}
                      {s.company_tipo === "empreendimentos" && <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">Empreendimentos</span>}
                      {(!s.company_tipo || s.company_tipo === "ambas") && <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">Ambas</span>}
                    </td>
                    <td className="px-6 py-3">
                      {segments.find(sg => sg.id === s.segment_id)?.name || s.segmento || "-"}
                    </td>
                    <td className="px-2 py-3 flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEdit(s); setOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" title="Métricas de Performance" onClick={() => toast.info(`Métricas de ${s.razao_social}: ${JSON.stringify(s.performance_metrics, null, 2)}`)}><BarChart3 className="size-4 text-primary" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="size-4 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Nenhum fornecedor cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
