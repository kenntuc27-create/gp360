// Service worker dedicado a push notifications
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Gestão Pará", body: "Você tem um aviso." };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (_) {}
  const opts = {
    body: data.body,
    icon: "/logo-empreendimentos.png",
    badge: "/logo-empreendimentos.png",
    tag: data.tag || "gestao-para",
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/equipe", logId: data.logId || null },
  };
  event.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
