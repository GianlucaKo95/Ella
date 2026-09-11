declare global {
  interface Window {
    __ELLA_CONFIG__?: { supabaseUrl: string; supabaseAnonKey: string };
  }
}

export function icsFeedUrl(employeeId: string): string {
  const base = window.__ELLA_CONFIG__?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || "";
  return `${base}/functions/v1/ics-feed?employee_id=${employeeId}`;
}
