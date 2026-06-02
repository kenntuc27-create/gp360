import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/configuracoes")({ component: Configuracoes });

interface Settings {
  id: string; company_name: string; phone: string; email: string; city: string;
  logo_url: string; primary_color: string; proposal_validity_days: number;
}

function Configuracoes() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("company_settings").select("*").limit(1).single()
      .then(({ data }) => setS(data as Settings));
  }, []);

  async function uploadLogo(f: File) {
    setBusy(true);
    const path = `logo_${Date.now()}_${f.name.replace(/\W+/g, "_")}`;
    const up = await supabase.storage.from("logos").upload(path, f, { upsert: true });
    if (up.error) { toast.error("Falha no upload"); setBusy(false); return; }
    const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
    setS((p) => p ? { ...p, logo_url: url } : p);
    setBusy(false);
    toast.success("Logo enviada");
  }

  async function save() {
    if (!s) return;
    setBusy(true);
    await supabase.from("company_settings").update({
      company_name: s.company_name, phone: s.phone, email: s.email, city: s.city,
      logo_url: s.logo_url, primary_color: s.primary_color, proposal_validity_days: s.proposal_validity_days,
    }).eq("id", s.id);
    setBusy(false);
    toast.success("Configurações salvas");
  }

  if (!s) return <AppShell title="Configurações"><div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" /></div></AppShell>;

  return (
    <AppShell title="Configurações da Empresa" actions={
      <Button onClick={save} disabled={busy}><Save className="size-4 mr-2" />Salvar</Button>
    }>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Dados da Empresa</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><Label>Nome da empresa</Label><Input value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} /></div>
            <div><Label>Cidade</Label><Input value={s.city} onChange={(e) => setS({ ...s, city: e.target.value })} /></div>
            <div><Label>Validade da proposta (dias)</Label><Input type="number" value={s.proposal_validity_days} onChange={(e) => setS({ ...s, proposal_validity_days: Number(e.target.value) })} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Identidade Visual</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Logo</Label>
              <div className="mt-2 border rounded-md p-4 bg-muted/30 flex flex-col items-center gap-3">
                {s.logo_url ? (
                  <img src={s.logo_url} alt="logo" className="max-h-24 object-contain" />
                ) : (
                  <div className="size-20 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">Sem logo</div>
                )}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="size-4 mr-2" />Enviar logo</Button>
              </div>
            </div>
            <div>
              <Label>Cor principal</Label>
              <div className="flex gap-2 items-center mt-1">
                <input type="color" className="size-10 rounded border" value={s.primary_color} onChange={(e) => setS({ ...s, primary_color: e.target.value })} />
                <Input value={s.primary_color} onChange={(e) => setS({ ...s, primary_color: e.target.value })} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
