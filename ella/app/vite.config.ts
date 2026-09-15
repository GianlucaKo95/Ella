import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest statt generateSW: eigener Service-Worker-Quellcode
      // (src/sw.ts) nötig, damit ein `push`-Event-Handler für echte Web-Push-
      // Benachrichtigungen möglich ist — generateSW erlaubt keinen eigenen
      // Event-Listener-Code. injectRegister aus, da main.tsx die Registrierung
      // jetzt selbst über `virtual:pwa-register` übernimmt (nötig, damit eine
      // neu ausgelieferte Version automatisch nachgeladen wird, statt bis zum
      // manuellen Neustart der App im alten, zwischengespeicherten Stand
      // hängen zu bleiben).
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      manifest: {
        name: "Ella",
        short_name: "Ella",
        description: "Schicht- und Backplanung für Café Ella",
        theme_color: "#1b7e71",
        background_color: "#f5faf9",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ]
});
