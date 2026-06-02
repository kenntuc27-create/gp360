import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { registerPush } from "@/lib/push";
import { sendTestPush } from "@/lib/push.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, BellRing } from "lucide-react";

export const Route = createFileRoute("/equipe/notificacoes")({ component: NotificacoesPage });

function NotificacoesPage() {
  const { user } = useAuth();
  const [vapid, setVapid] = useState(import.meta.env.VITE_VAPID_PUBLIC_KEY || "");
  const sendTest = useServerFn(sendTestPush);

  async function ativar() {
    try {
      if (!vapid) return toast.error("Informe (ou configure) a chave VAPID pública");
      await registerPush(vapid);
      toast.success("Notificações ativadas neste dispositivo");
    } catch (e: any) { toast.error(e?.message || "Falha ao ativar"); }
  }
  async function testar() {
    if (!user) return;
    try { const r = await sendTest({ data: { userId: user.id } }); toast.success(`Enviado (${r.sent} dispositivo(s))`); }
    catch (e: any) { toast.error(e?.message || "Falha"); }
  }

  return (
    <AppShell title="Notificações">
      <Card className="max-w-xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="size-4" />Push web</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Receba lembretes automáticos do lançamento de produção. Funciona com o app instalado (PWA) ou no navegador aberto.</p>
          {!import.meta.env.VITE_VAPID_PUBLIC_KEY && (
            <div>
              <label className="text-xs">Chave VAPID pública</label>
              <Input value={vapid} onChange={(e) => setVapid(e.target.value)} placeholder="BO..." />
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={ativar}><BellRing className="size-4 mr-1" />Ativar neste dispositivo</Button>
            <Button variant="outline" onClick={testar}>Enviar teste</Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
