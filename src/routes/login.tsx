import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let email = identifier.trim();

    // Se não tem "@", resolve username → email via RPC (SECURITY DEFINER)
    if (!email.includes("@")) {
      const { data: resolved, error: rpcErr } = await supabase
        .rpc("resolve_login_email", { _identifier: email });
      
      if (!rpcErr && typeof resolved === "string" && resolved) {
        email = resolved;
      } else {
        // Fallback para o padrão legado se não encontrar
        email = `${email.toLowerCase().replace(/[^a-z0-9]/g, "")}@interno.local`;
      }
    }

    const { error: signInError } = await signIn(email, password);
    
    // Log de acesso (sucesso ou falha)
    await supabase.functions.invoke("admin-users", {
      body: { 
        action: "log_external", 
        event: signInError ? "login_failure" : "login_success",
        username: identifier,
        metadata: { 
          error: typeof signInError === 'object' ? (signInError as any)?.message : signInError,
          platform: window.navigator.platform,
          userAgent: window.navigator.userAgent,
          screenResolution: `${window.screen.width}x${window.screen.height}`,
          language: window.navigator.language
        }
      }
    });

    setBusy(false);
    if (signInError) { toast.error("Usuário ou senha inválidos"); return; }

    // Verifica se precisa trocar a senha
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
      const { data: p } = await supabase
        .from("profiles").select("must_change_password").eq("user_id", u.id).maybeSingle();
      if (p?.must_change_password) {
        toast.info("Defina sua nova senha para continuar");
        navigate({ to: "/trocar-senha" });
        return;
      }
    }
    toast.success("Bem-vindo!");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-muted/50 inline-block mx-auto">
            <img src={logo} alt="3K SISTEMAS" className="h-14 mx-auto object-contain" />
          </div>
          <CardTitle className="text-xl font-bold">Acesso ao Sistema</CardTitle>
          <p className="text-sm text-muted-foreground">Utilize seu nome de usuário operacional</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="identifier">Usuário</Label>
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                required
                placeholder="ex: joaosilva"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <LogIn className="size-4 mr-2" />}
              Entrar
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Não tem conta? Solicite ao administrador.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
