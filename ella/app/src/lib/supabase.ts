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
