import { createClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __ELLA_CONFIG__?: {
      supabaseUrl: string;
      supabaseAnonKey: string;
    };
  }
}

const runtimeConfig = typeof window !== "undefined" ? window.__ELLA_CONFIG__ : undefined;

const supabaseUrl =
  runtimeConfig?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey =
  runtimeConfig?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Ella: Supabase ist nicht konfiguriert. Im Addon unter Einstellungen, lokal via .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Employee = {
  id: string;
  auth_user_id: string | null;
  name: string;
  role: "admin" | "employee";
  active: boolean;
  bake_team_id: string | null;
  avatar_url: string | null;
};

export type LoginName = { id: string; name: string; has_account: boolean };

// Namensliste, dient dem Login-Bildschirm dazu, den eingetippten Namen auf
// eine employee-id + has_account aufzulösen (kein E-Mail-Feld, stattdessen
// Name + Passwort). Läuft vor dem Login, daher über eine security-definer
// Funktion statt über eine RLS-Policy auf die volle employees-Tabelle.
export async function fetchLoginNames(): Promise<LoginName[]> {
  const { data, error } = await supabase.rpc("list_login_names");
  if (error) return [];
  return (data as LoginName[]) || [];
}

export function findLoginName(names: LoginName[], typedName: string): LoginName | null {
  const needle = typedName.trim().toLowerCase();
  return names.find((n) => n.name.trim().toLowerCase() === needle) || null;
}

// Synthetische, nie versendete Adresse – ersetzt den "Benutzernamen" für
// Supabase Auth, das ein E-Mail-Feld erwartet. Muss mit der Edge Function
// set-password übereinstimmen.
function loginEmail(employeeId: string): string {
  return `${employeeId}@login.ella.internal`;
}

// Bewusst ein direkter fetch() auf den Pfad unter supabaseUrl statt
// supabase.functions.invoke(): Der Supabase-JS-Client leitet Function-Aufrufe
// bei einer *.supabase.co-URL standardmäßig auf eine eigene
// *.functions.supabase.co-Subdomain um. Ist diese Subdomain im Netzwerk des
// Geräts (z. B. durch DNS-Filter/Firewall) nicht erreichbar, schlägt genau
// dieser Aufruf mit "Failed to send a request to the Edge Function" fehl,
// obwohl die normale REST-API (gleiche Domain wie oben) funktioniert. Der
// Pfad /functions/v1/<name> unter derselben, bereits erreichbaren Domain
// funktioniert immer, auch selbst-gehostet. accessToken ist nur bei
// Funktionen nötig, die den Aufrufer selbst prüfen (z. B. reset-password);
// ohne accessToken wird der anon-Key als Bearer-Token mitgeschickt.
async function callEdgeFunction(
  name: string,
  body: unknown,
  accessToken?: string
): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken || supabaseAnonKey}`
      },
      body: JSON.stringify(body)
    });
  } catch {
    return { ok: false, error: "Server nicht erreichbar. Bitte Internetverbindung prüfen." };
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    return { ok: false, error: data?.error || "Anfrage fehlgeschlagen" };
  }
  return data;
}

// Erster Login: legt per Edge Function (Service-Role, da admin.createUser
// nötig ist) das Konto mit dem selbst gewählten Passwort an.
export async function setInitialPassword(employeeId: string, password: string): Promise<string | null> {
  const result = await callEdgeFunction("set-password", { employeeId, password });
  return result.ok ? null : result.error || "Passwort konnte nicht gesetzt werden";
}

// Normale Anmeldung mit Name (-> employeeId) + Passwort, ganz regulär über
// Supabase Auth (kein Edge-Function-Umweg nötig).
export async function signInWithName(employeeId: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({
    email: loginEmail(employeeId),
    password
  });
  return error ? "Falscher Name oder falsches Passwort" : null;
}

// Admin setzt das Passwort eines Mitarbeiters zurück (löscht dessen
// Login-Konto, employees.auth_user_id wird wieder null) — die Person legt
// beim nächsten Login-Versuch wie beim allerersten Mal ein neues Passwort
// selbst fest. Braucht den Access-Token des aufrufenden Admins, damit die
// Function die Berechtigung prüfen kann.
export async function resetEmployeePassword(employeeId: string): Promise<string | null> {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return "Nicht angemeldet";
  const result = await callEdgeFunction("reset-password", { employeeId }, session.access_token);
  return result.ok ? null : result.error || "Passwort konnte nicht zurückgesetzt werden";
}

// Profilbild-Upload: eigene Datei in den eigenen Ordner "<auth.uid()>/…" der
// öffentlichen Bucket "avatars" hochladen (RLS erlaubt Schreiben nur im
// eigenen Ordner, Lesen ist öffentlich), dann die öffentliche URL per
// SECURITY-DEFINER-Funktion in employees.avatar_url eintragen. Jeder Upload
// bekommt einen neuen Dateinamen, damit die URL sich ändert und nicht per
// Browser-/CDN-Cache veraltet bleibt.
export async function uploadMyAvatar(file: File): Promise<string | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return "Nicht angemeldet";
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type || "image/jpeg"
  });
  if (uploadError) return "Foto konnte nicht hochgeladen werden";
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error: rpcError } = await supabase.rpc("update_my_avatar_url", { new_url: data.publicUrl });
  if (rpcError) return "Foto konnte nicht gespeichert werden";
  return null;
}

export async function removeMyAvatar(): Promise<string | null> {
  const { error } = await supabase.rpc("update_my_avatar_url", { new_url: null });
  return error ? "Foto konnte nicht entfernt werden" : null;
}

// Bild zu einer Ankündigung: Storage-Bucket "announcement-images" (öffentlich
// lesbar, Schreiben admin-exklusiv per RLS, siehe Migration
// 0023_announcement_images.sql) — anders als bei Avataren kein eigener
// Ordner pro Person nötig, da ohnehin nur Admins schreiben dürfen.
export async function uploadAnnouncementImage(file: File): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("announcement-images").upload(path, file, {
    contentType: file.type || "image/jpeg"
  });
  if (uploadError) return { url: null, error: "Bild konnte nicht hochgeladen werden" };
  const { data } = supabase.storage.from("announcement-images").getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// Admin löscht einen Mitarbeiter endgültig — löscht zuerst dessen Auth-User
// (falls vorhanden), dann die employees-Zeile selbst. Braucht wie
// resetEmployeePassword den Access-Token der aufrufenden Admin-Person.
export async function deleteEmployee(employeeId: string): Promise<string | null> {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return "Nicht angemeldet";
  const result = await callEdgeFunction("delete-employee", { employeeId }, session.access_token);
  return result.ok ? null : result.error || "Mitarbeiter konnte nicht gelöscht werden";
}

export async function fetchCurrentEmployee(): Promise<Employee | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("auth_user_id", authData.user.id)
    .single();
  if (error) return null;
  return data as Employee;
}

export type AppSettings = {
  billing_period_start_day: number;
  // Wochentage 0=Montag .. 6=Sonntag
  service_days: number[];
  bake_days: number[];
  // An diesen Tagen ist normalerweise eine Frühschicht (meistens nur Sa/So) —
  // an anderen Tagen bleibt sie als Ausnahme weiterhin manuell anlegbar.
  frueh_days: number[];
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  billing_period_start_day: 1,
  service_days: [3, 4, 5, 6],
  bake_days: [2, 3, 4],
  frueh_days: [5, 6]
};

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("billing_period_start_day,service_days,bake_days,frueh_days")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return DEFAULT_APP_SETTINGS;
  return data as AppSettings;
}

export type AppNotification = {
  id: string;
  type:
    | "shift_published"
    | "bake_plan_published"
    | "announcement"
    | "swap_accepted"
    | "availability_submitted"
    | "reminder";
  body: string;
  sent_at: string;
  read_at: string | null;
};

export async function fetchMyNotifications(employeeId: string): Promise<AppNotification[]> {
  const { data } = await supabase
    .from("notifications_log")
    .select("id,type,body,sent_at,read_at")
    .eq("target_employee_id", employeeId)
    .order("sent_at", { ascending: false })
    .limit(20);
  return (data as AppNotification[]) || [];
}

export async function markNotificationRead(id: string) {
  await supabase.from("notifications_log").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export async function markAllNotificationsRead(employeeId: string) {
  await supabase
    .from("notifications_log")
    .update({ read_at: new Date().toISOString() })
    .eq("target_employee_id", employeeId)
    .is("read_at", null);
}

// Legt für jeden übergebenen Mitarbeiter eine Benachrichtigung an (z. B. nach
// Veröffentlichen eines Plans oder einer neuen Ankündigung) UND verschickt an
// jedes Gerät mit aktivem Push-Abo (siehe lib/push.ts) eine echte Web-Push-
// Nachricht — läuft über die Edge Function `send-push`, da normale
// Mitarbeiter-Sessions nicht direkt in notifications_log schreiben dürfen
// (nur Admins, siehe RLS) und der eigentliche Versand ohnehin serverseitig
// (VAPID-Signatur) passieren muss. Nur für admin-initiierte Typen gedacht —
// für "ein Mitarbeiter löst eine Benachrichtigung an alle Admins aus" siehe
// notifyAdmins().
export async function notifyEmployees(
  employeeIds: string[],
  type: AppNotification["type"],
  body: string
): Promise<string | null> {
  if (employeeIds.length === 0) return null;
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return "Nicht angemeldet";
  const result = await callEdgeFunction("send-push", { employeeIds, type, body }, session.access_token);
  return result.ok ? null : result.error || "Benachrichtigung konnte nicht gesendet werden";
}

// Von einer normalen Mitarbeiter-Session aus alle Admins benachrichtigen
// (Schichttausch wartet auf Bestätigung, Verfügbarkeit eingereicht) — welche
// Mitarbeiter das sind, bestimmt ausschließlich die Edge Function serverseitig,
// damit niemand über diesen Weg beliebige andere Mitarbeiter benachrichtigen kann.
export async function notifyAdmins(
  type: Extract<AppNotification["type"], "swap_accepted" | "availability_submitted">,
  body: string
): Promise<string | null> {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return "Nicht angemeldet";
  const result = await callEdgeFunction("send-push", { type, body }, session.access_token);
  return result.ok ? null : result.error || "Benachrichtigung konnte nicht gesendet werden";
}
