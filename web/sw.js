// Service worker: cache หน้าแอป (ไม่ cache /api/) + รับ Web Push
const CACHE = "alert-shell-v1";
const SHELL = ["/", "/style.css", "/logic.js", "/chart.js", "/app.js", "/vendor/lightweight-charts.js", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first: ได้ของใหม่เสมอเมื่อออนไลน์ ใช้ cache เมื่อออฟไลน์
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});

self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data.json(); } catch (err) { p = { title: "Stock Alert", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(
    self.registration.showNotification(p.title || "Stock Alert", {
      body: p.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: p.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
