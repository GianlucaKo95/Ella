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
  type: "shift_published" | "bake_plan_published" | "announcement";
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

// Legt für jeden übergebenen Mitarbeiter eine Benachrichtigung an (z.B. nach
// Veröffentlichen eines Plans oder einer neuen Ankündigung). channel ist
// vorbereitet für einen künftigen externen Kanal (HA-Notify/Web-Push), wird
// aktuell aber nur in-app angezeigt.
export async function notifyEmployees(
  employeeIds: string[],
  type: AppNotification["type"],
  body: string
) {
  if (employeeIds.length === 0) return;
  await supabase.from("notifications_log").insert(
    employeeIds.map((target_employee_id) => ({
      type,
      target_employee_id,
      body,
      channel: "web_push"
    }))
  );
}
