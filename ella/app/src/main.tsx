import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/index.css";

// Registriert den Service Worker explizit (statt des vorher injizierten
// Standard-Skripts, siehe vite.config.ts) — `immediate: true` sorgt dafür,
// dass eine neu ausgelieferte Version sofort geladen und die Seite neu
// gerendert wird, statt bis zum nächsten manuellen Neustart der App im alten
// Stand hängen zu bleiben (betraf zuvor z. B. Bugfixes, die trotz Deployment
// scheinbar nicht ankamen).
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
