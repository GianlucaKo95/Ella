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

export type LoginName = { id: string; name: string };

// Namensliste für den Login-Bildschirm (wie bei Wizzo: Namen antippen statt
// Passwort tippen). Läuft vor dem Login, daher über eine security-definer
// Funktion statt über eine RLS-Policy auf die volle employees-Tabelle.
export async function fetchLoginNames(): Promise<LoginName[]> {
  const { data, error } = await supabase.rpc("list_login_names");
  if (error) return [];
  return (data as LoginName[]) || [];
}

// Stellt für den gewählten Mitarbeiter eine Session aus (kein Passwort nötig)
// und übernimmt sie als aktuelle Supabase-Session.
export async function loginByName(employeeId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("login-by-name", {
    body: { employeeId }
  });
  if (error || !data?.access_token || !data?.refresh_token) {
    return (data as { error?: string })?.error || error?.message || "Login fehlgeschlagen";
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token
  });
  return sessionError ? sessionError.message : null;
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
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  billing_period_start_day: 1,
  service_days: [3, 4, 5, 6],
  bake_days: [2, 3, 4]
};

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("billing_period_start_day,service_days,bake_days")
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
