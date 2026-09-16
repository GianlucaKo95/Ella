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

// `index.html`/`runtime-config.js` bewusst NICHT vorcachen, obwohl vite-pwa
// sie in `self.__WB_MANIFEST` aufnimmt: nginx setzt für beide zwar
// `Cache-Control: no-store` (nginx.conf), das steuert aber nur den normalen
// HTTP-Cache des Browsers — die hier laufende `precacheAndRoute`-Route bedient
// eine URL unabhängig davon direkt aus der eigenen Cache-Storage, sobald sie
// einmal vorgecached wurde. Jedes Add-on-Update ersetzt `/www` komplett (neue
// Hash-Dateinamen unter `/assets`), sodass eine bereits aktive, alte
// Service-Worker-Version bei jedem Refresh weiterhin ihre alte, vorgecachte
// `index.html` mit Verweisen auf inzwischen gelöschte Asset-Dateien ausliefern
// konnte — das äußerte sich als weißer Bildschirm nach einem Refresh (Feedback:
// "Ich hab immer noch den fehlgeschlagenen Refresh. Der Bildschirm bleibt dann
// weiß."), unabhängig vom nginx-Fix. `runtime-config.js` wird bei jedem
// Add-on-Start neu mit den echten Supabase-Zugangsdaten beschrieben und darf
// aus demselben Grund nie aus einem alten Vorcache bedient werden. Beide
// Requests laufen dadurch immer über das normale Netzwerk (und damit über
// nginx' `no-store`); die inhalts-gehashten `/assets`-Dateien bleiben
// weiterhin vorgecached.
const manifestWithoutRuntimeFiles = self.__WB_MANIFEST.filter((entry) => {
  const url = typeof entry === "string" ? entry : entry.url;
  return url !== "index.html" && url !== "runtime-config.js";
});
precacheAndRoute(manifestWithoutRuntimeFiles);

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
