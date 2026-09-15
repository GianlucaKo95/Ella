/// <reference lib="webworker" />
// Eigener Service-Worker-Quellcode (statt des generierten Standard-SW von
// vite-plugin-pwa) — nur damit ein `push`-Event-Handler möglich ist. Läuft
// über die injectManifest-Strategie (vite.config.ts): das Precaching bleibt
// wie vorher, `self.__WB_MANIFEST` wird von vite-plugin-pwa beim Bauen mit der
// tatsächlichen Datei-Liste ersetzt.
//
// Von tsc bewusst ausgeschlossen (tsconfig.json) — die DOM-Typen der App
// (lib: "DOM") und die WebWorker-Typen hier vertragen sich nicht in einem
// gemeinsamen Compile-Lauf; vite/esbuild bauen diese Datei unabhängig davon.
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// Eine neue Version übernimmt sofort alle offenen Tabs, statt erst zu warten,
// bis niemand die App mehr offen hat (Standard-SW-Verhalten) — sonst bliebe
// eine bereits offene PWA/Companion-App-Instanz beliebig lange auf einem
// alten, zwischengespeicherten Stand hängen. Der eigentliche Reload der
// offenen Seite läuft über `registerSW({ immediate: true })` in main.tsx.
self.skipWaiting();
self.addEventListener("activate", () => self.clients.claim());

self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "Ella";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      data: { url: data.url || "./home" }
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) || "./home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
