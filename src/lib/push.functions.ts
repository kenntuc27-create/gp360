import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function configureVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@gestaopara.local";
  if (!pub || !priv) throw new Error("VAPID keys não configuradas");
  webpush.setVapidDetails(subject, pub, priv);
}

async function sendToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  const admin = getAdmin();
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs || subs.length === 0) return { sent: 0 };
  configureVapid();
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
  }
  return { sent };
}

export const sendTestPush = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data }) => {
    return sendToUser(data.userId, {
      title: "Gestão Pará",
      body: "Notificação de teste recebida com sucesso ✅",
      url: "/equipe",
      tag: "teste",
    });
  });

// ============================================================
// Sistema unificado: Ponto + Produção, com reincidência
// ============================================================

type SlotKind =
  | "entrada"
  | "saida_intervalo"
  | "volta_intervalo"
  | "producao"
  | "saida";

type Slot = {
  kind: SlotKind;
  category: "ponto" | "producao";
  time: number; // minutos do dia
  title: string;
  body: string;
  url: string;
};

function buildSlots(weekday: number): Slot[] {
  // 1=seg..5=sex
  if (weekday >= 1 && weekday <= 5) {
    return [
      { kind: "entrada", category: "ponto", time: 7 * 60 + 55, title: "⏰ Hora de iniciar sua jornada", body: "Bata o ponto de entrada agora.", url: "/equipe/ponto" },
      { kind: "saida_intervalo", category: "ponto", time: 12 * 60, title: "🍽️ Iniciar intervalo", body: "Registre o início do seu intervalo.", url: "/equipe/ponto" },
      { kind: "volta_intervalo", category: "ponto", time: 14 * 60, title: "🔄 Retornar do intervalo", body: "Bata o ponto de retorno.", url: "/equipe/ponto" },
      { kind: "producao", category: "producao", time: 17 * 60 + 30, title: "📊 Preencher produção", body: "Preencha sua produção antes de sair.", url: "/equipe/producao" },
      { kind: "saida", category: "ponto", time: 17 * 60 + 55, title: "🏁 Encerrar jornada", body: "Bata o ponto de saída.", url: "/equipe/ponto" },
    ];
  }
  if (weekday === 6) {
    return [
      { kind: "entrada", category: "ponto", time: 7 * 60 + 55, title: "⏰ Iniciar jornada", body: "Bata o ponto de entrada agora.", url: "/equipe/ponto" },
      { kind: "producao", category: "producao", time: 11 * 60 + 30, title: "📊 Preencher produção", body: "Preencha sua produção antes de sair.", url: "/equipe/producao" },
      { kind: "saida", category: "ponto", time: 11 * 60 + 55, title: "🏁 Encerrar jornada", body: "Bata o ponto de saída.", url: "/equipe/ponto" },
    ];
  }
  return []; // domingo
}

async function hasCompleted(
  admin: ReturnType<typeof getAdmin>,
  empId: string,
  slot: Slot,
  dateISO: string
): Promise<boolean> {
  if (slot.category === "producao") {
    const { data } = await admin
      .from("daily_production_metrics")
      .select("id")
      .eq("employee_id", empId)
      .eq("production_date", dateISO)
      .limit(1);
    return !!(data && data.length);
  }
  const { data } = await admin
    .from("time_punches")
    .select("id")
    .eq("employee_id", empId)
    .eq("punch_date", dateISO)
    .eq("punch_type", slot.kind)
    .limit(1);
  return !!(data && data.length);
}

export const runScheduledNotifications = createServerFn({ method: "POST" })
  .inputValidator(z.object({ now: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const admin = getAdmin();
    const now = data?.now ? new Date(data.now) : new Date();
    const day = now.getDay();
    if (day === 0) return { skipped: "domingo" };

    const minutes = now.getHours() * 60 + now.getMinutes();
    const dateISO = now.toISOString().slice(0, 10);
    const slots = buildSlots(day);

    const { data: emps } = await admin
      .from("employees")
      .select("id, full_name, user_id")
      .eq("active", true);
    if (!emps?.length) return { sent: 0 };

    let totalSent = 0;
    let totalNotifs = 0;

    for (const slot of slots) {
      const elapsed = minutes - slot.time;
      // Janelas (em minutos a partir do horário do slot):
      // 0..1 = aviso inicial
      // 10..11 = reforço
      // 20..21 = amarelo
      // 30..31 = vermelho + ocorrência
      let stage: "aviso" | "reforco" | "amarelo" | "vermelho" | null = null;
      if (elapsed >= 0 && elapsed < 2) stage = "aviso";
      else if (elapsed >= 10 && elapsed < 12) stage = "reforco";
      else if (elapsed >= 20 && elapsed < 22) stage = "amarelo";
      else if (elapsed >= 30 && elapsed < 32) stage = "vermelho";
      if (!stage) continue;

      for (const emp of emps) {
        if (!emp.user_id) continue;
        if (await hasCompleted(admin, emp.id, slot, dateISO)) continue;

        // evitar duplicado nesse minuto
        const { data: existing } = await admin
          .from("notification_log")
          .select("id")
          .eq("employee_id", emp.id)
          .eq("reference_date", dateISO)
          .eq("kind", slot.kind)
          .eq("stage", stage)
          .limit(1);
        if (existing?.length) continue;

        const prefix =
          stage === "reforco" ? "🔔 Lembrete: " :
          stage === "amarelo" ? "⚠️ Atenção: " :
          stage === "vermelho" ? "🚨 Pendência crítica: " : "";
        const title = prefix + slot.title;
        const body = slot.body;

        const r = await sendToUser(emp.user_id, {
          title,
          body,
          url: slot.url,
          tag: `${slot.kind}-${dateISO}`,
        });

        await admin.from("notification_log").insert({
          employee_id: emp.id,
          user_id: emp.user_id,
          reference_date: dateISO,
          category: slot.category,
          kind: slot.kind,
          stage,
          title,
          body,
          delivered_count: r.sent,
        });

        totalSent += r.sent;
        totalNotifs++;

        // escalation: gerar alertas/ocorrências
        if (stage === "amarelo") {
          await admin.from("adherence_alerts").insert({
            employee_id: emp.id,
            reference_date: dateISO,
            alert_type: slot.category,
            severity: "atencao",
            message: `2 lembretes ignorados — ${slot.title}`,
            source: "auto",
          });
        }
        if (stage === "vermelho") {
          await admin.from("adherence_alerts").insert({
            employee_id: emp.id,
            reference_date: dateISO,
            alert_type: slot.category,
            severity: "critico",
            message: `3+ lembretes ignorados — ${slot.title}`,
            source: "auto",
          });
          // ocorrência (evita duplicar)
          const { data: ocExists } = await admin
            .from("occurrences")
            .select("id")
            .eq("employee_id", emp.id)
            .eq("occurrence_date", dateISO)
            .eq("occurrence_type", slot.category)
            .limit(1);
          if (!ocExists?.length) {
            await admin.from("occurrences").insert({
              employee_id: emp.id,
              occurrence_type: slot.category,
              severity: "alta",
              source: "auto",
              notes: `Lembretes ignorados (3+) para ${slot.title} em ${dateISO}`,
              occurrence_date: dateISO,
            });
          }
        }
      }
    }

    return { day, minutes, slots: slots.length, totalNotifs, totalSent };
  });

// retrocompat: hooks antigos
export const runProductionAlerts = runScheduledNotifications;

export const markMissedProductions = createServerFn({ method: "POST" })
  .inputValidator(z.object({ date: z.string() }))
  .handler(async ({ data }) => {
    const admin = getAdmin();
    const { data: emps } = await admin.from("employees").select("id").eq("active", true);
    if (!emps) return { marked: 0 };
    const ids = emps.map((e) => e.id);
    const { data: prods } = await admin
      .from("daily_production_metrics")
      .select("employee_id")
      .eq("production_date", data.date)
      .in("employee_id", ids);
    const filled = new Set((prods || []).map((p) => p.employee_id));
    const missing = emps.filter((e) => !filled.has(e.id));
    return { missing: missing.length };
  });

export const acknowledgeNotification = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid(), action: z.enum(["click", "ack"]) }))
  .handler(async ({ data }) => {
    const admin = getAdmin();
    const patch: Record<string, string> = {};
    if (data.action === "click") patch.clicked_at = new Date().toISOString();
    if (data.action === "ack") patch.acknowledged_at = new Date().toISOString();
    await admin.from("notification_log").update(patch).eq("id", data.id);
    return { ok: true };
  });
