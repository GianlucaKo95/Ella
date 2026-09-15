import { useEffect, useState } from "react";

// beforeinstallprompt ist nicht Teil der Standard-DOM-Typen.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export type PwaInstallStatus =
  | "installed" // läuft schon als installierte App — kein Button nötig
  | "prompt" // beforeinstallprompt verfügbar (Android/Desktop-Chrome/Edge) — Klick löst den echten Install-Dialog aus
  | "ios" // Safari/iOS: kein programmgesteuerter Dialog möglich, nur "Zum Home-Bildschirm" über das Teilen-Menü
  | "unsupported"; // weder noch (z. B. Desktop-Firefox)

// iOS (Safari wie auch iOS-Chrome/Firefox, die dieselbe WebKit-Engine nutzen)
// kennt kein `beforeinstallprompt` — der einzige Weg zur Installation ist dort
// das Teilen-Menü ("Zum Home-Bildschirm"), ganz ohne JS-API auslösbar. Auf
// Android/Desktop-Chrome/Edge feuert der Browser stattdessen
// `beforeinstallprompt`; das Event lässt sich aufheben und später (Klick auf
// den eigenen Button) per `.prompt()` erneut auslösen. Ein einzelner Button,
// der auf beiden Plattformen "funktioniert", muss also je nach Plattform
// entweder den echten Dialog auslösen oder eine Anleitung zeigen — es gibt
// technisch keinen Weg, iOS einen echten Ein-Klick-Installationsdialog zu geben.
export function usePwaInstall(): { status: PwaInstallStatus; install: () => Promise<void> } {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredEvent(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const choice = await deferredEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredEvent(null);
  }

  const status: PwaInstallStatus = installed ? "installed" : deferredEvent ? "prompt" : isIos() ? "ios" : "unsupported";
  return { status, install };
}
