import { supabase } from "./supabase";

// Öffentlicher VAPID-Schlüssel — unkritisch, wird beim Abonnieren an den
// Push-Dienst des Browsers übergeben (Gegenstück: der private Schlüssel liegt
// ausschließlich als Secret bei der Edge Function `send-push`).
const VAPID_PUBLIC_KEY = "BDXzIqddO1FWabl7d3i7WFeCfhU0crfedprZmkFjluzLRH-oxVRAW0YRNCtu3-HfFq47SuxAxEf9FcoFHo9sSSQ";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

export type PushState = "unsupported" | "denied" | "subscribed" | "unsubscribed";

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

// Fragt Benachrichtigungs-Erlaubnis an (falls nötig) und legt beim Push-Dienst
// des Browsers ein Abo an, dessen Zugangsdaten dann in push_subscriptions
// landen — ein Eintrag pro Browser/Gerät, mehrere Geräte derselben Person
// funktionieren also einfach nebeneinander.
export async function enablePush(employeeId: string): Promise<string | null> {
  if (!isPushSupported()) return "Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "Erlaubnis für Benachrichtigungen wurde nicht erteilt.";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
      }));
    const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ employee_id: employeeId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
    if (error) return "Abo konnte nicht gespeichert werden.";
    return null;
  } catch {
    return "Push-Benachrichtigungen konnten nicht aktiviert werden.";
  }
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
