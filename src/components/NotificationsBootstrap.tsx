import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { registerPush } from "@/lib/push";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * - Solicita permissão de notificação ao entrar no sistema (1 vez por sessão).
 * - Polling de pendências (ponto/produção) e mostra popup fallback in-app.
 * - Toca som leve ao detectar nova pendência.
 */
export function NotificationsBootstrap() {
  const { user } = useAuth();
  const [pending, setPending] = useState<{ kind: string; title: string; body: string; url: string } | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 1) Pedir permissão automática (com aviso amigável)
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    const askedKey = `notif:asked:${user.id}`;
    if (sessionStorage.getItem(askedKey)) return;
    sessionStorage.setItem(askedKey, "1");

    const t = setTimeout(async () => {
      toast("Ative as notificações", {
        description: "Receba lembretes de ponto e produção mesmo com o app fechado.",
        duration: 10000,
        action: {
          label: "Ativar",
          onClick: async () => {
            try {
              const vapid = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY;
              if (!vapid) {
                await Notification.requestPermission();
                toast.success("Permissão concedida");
                return;
              }
              await registerPush(vapid);
              toast.success("Notificações ativadas neste dispositivo");
            } catch (e: any) {
              toast.error(e?.message || "Falha ao ativar notificações");
            }
          },
        },
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [user]);

  // 2) Polling de pendências (fallback in-app)
  useEffect(() => {
    if (!user) return;
    let alive = true;

    async function check() {
      if (!alive) return;
      const now = new Date();
      const day = now.getDay();
      if (day === 0) return; // domingo
      const minutes = now.getHours() * 60 + now.getMinutes();

      // descobre o employee
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .eq("active", true)
        .maybeSingle();
      if (!emp) return;

      const slots = day === 6
        ? [
            { kind: "entrada", category: "ponto", time: 7 * 60 + 55, title: "Iniciar jornada", body: "Bata o ponto de entrada.", url: "/equipe/ponto" },
            { kind: "producao", category: "producao", time: 11 * 60 + 30, title: "Preencher produção", body: "Antes de encerrar, registre sua produção.", url: "/equipe/producao" },
            { kind: "saida", category: "ponto", time: 11 * 60 + 55, title: "Encerrar jornada", body: "Bata o ponto de saída.", url: "/equipe/ponto" },
          ]
        : [
            { kind: "entrada", category: "ponto", time: 7 * 60 + 55, title: "Iniciar jornada", body: "Bata o ponto de entrada.", url: "/equipe/ponto" },
            { kind: "saida_intervalo", category: "ponto", time: 12 * 60, title: "Iniciar intervalo", body: "Registre o início do intervalo.", url: "/equipe/ponto" },
            { kind: "volta_intervalo", category: "ponto", time: 14 * 60, title: "Retornar do intervalo", body: "Bata o ponto de retorno.", url: "/equipe/ponto" },
            { kind: "producao", category: "producao", time: 17 * 60 + 30, title: "Preencher produção", body: "Antes de encerrar, registre sua produção.", url: "/equipe/producao" },
            { kind: "saida", category: "ponto", time: 17 * 60 + 55, title: "Encerrar jornada", body: "Bata o ponto de saída.", url: "/equipe/ponto" },
          ];

      const dateISO = now.toISOString().slice(0, 10);
      // pendentes: já passou do horário e não foi feito
      for (const s of slots) {
        if (minutes < s.time) continue;
        const id = `${dateISO}-${s.kind}`;
        if (seenRef.current.has(id)) continue;
        let done = false;
        if (s.category === "producao") {
          const { data } = await supabase
            .from("daily_production_metrics")
            .select("id")
            .eq("employee_id", emp.id)
            .eq("production_date", dateISO)
            .limit(1);
          done = !!(data && data.length);
        } else {
          const { data } = await supabase
            .from("time_punches")
            .select("id")
            .eq("employee_id", emp.id)
            .eq("punch_date", dateISO)
            .eq("punch_type", s.kind)
            .limit(1);
          done = !!(data && data.length);
        }
        if (done) { seenRef.current.add(id); continue; }

        // mostra popup
        seenRef.current.add(id);
        setPending({ kind: s.kind, title: s.title, body: s.body, url: s.url });
        try { audioRef.current?.play().catch(() => {}); } catch {}
        return;
      }
    }

    check();
    const i = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(i); };
  }, [user]);

  return (
    <>
      {/* Som leve (data URL silenciosa por padrão; o navegador toca beep nativo via Notification API) */}
      <audio ref={audioRef} preload="auto" src="data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=" />
      {pending && (
        <div className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border bg-card shadow-xl p-4 animate-in slide-in-from-bottom">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2"><Bell className="size-5 text-primary" /></div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">⏰ {pending.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{pending.body}</div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => { window.location.href = pending.url; setPending(null); }}>Ir agora</Button>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Depois</Button>
              </div>
            </div>
            <button onClick={() => setPending(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
