import { createFileRoute } from "@tanstack/react-router";
import { runProductionAlerts, markMissedProductions } from "@/lib/push.functions";

export const Route = createFileRoute("/api/public/hooks/production-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const r = await runProductionAlerts({ data: { now: body?.now } });
          // se for fim de janela (após meia-noite) marcar não preenchidos do dia anterior
          let marked: any = null;
          if (body?.markPreviousDate) {
            marked = await markMissedProductions({ data: { date: body.markPreviousDate } });
          }
          return Response.json({ ok: true, alerts: r, marked });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
        }
      },
    },
  },
});
