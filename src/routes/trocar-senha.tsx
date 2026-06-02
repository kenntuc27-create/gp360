import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/trocar-senha")({ component: TrocarSenhaPage });

function TrocarSenhaPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (p1.length < 6) return toast.error("A senha precisa ter ao menos 6 caracteres");
    if (p1 !== p2) return toast.error("As senhas não conferem");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) { setBusy(false); return toast.error(error.message); }

    // Log de troca de senha
    await supabase.functions.invoke("admin-users", {
      body: { 
        action: "log_external", 
        event: "password_change",
        metadata: { 
          platform: window.navigator.platform,
          userAgent: window.navigator.userAgent
        }
      }
    });

    if (user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("user_id", user.id);
    }
    setBusy(false);
    toast.success("Senha atualizada!");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-4">
          <div className="size-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <KeyRound className="size-8 text-primary" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold">Definir Nova Senha</CardTitle>
            <p className="text-sm text-muted-foreground px-2">Identificamos que este é seu primeiro acesso ou sua senha foi resetada.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="p1">Nova senha</Label>
              <Input id="p1" type="password" autoComplete="new-password" required value={p1} onChange={(e) => setP1(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p2">Confirmar senha</Label>
              <Input id="p2" type="password" autoComplete="new-password" required value={p2} onChange={(e) => setP2(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Salvar nova senha
            </Button>
            <button type="button" onClick={() => { signOut(); navigate({ to: "/login" }); }} className="block mx-auto text-xs text-muted-foreground hover:underline">
              Sair
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
