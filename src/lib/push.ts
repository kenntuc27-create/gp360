import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerPush(vapidPublicKey: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push não suportado neste navegador");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão de notificação negada");

  const reg = await navigator.serviceWorker.register("/sw-push.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }
  const json = sub.toJSON() as any;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sem usuário");
  await supabase.from("push_subscriptions" as any).upsert(
    {
      user_id: u.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    } as any,
    { onConflict: "endpoint" }
  );
  return true;
}
