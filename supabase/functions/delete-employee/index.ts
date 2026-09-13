// Supabase Edge Function: Admin löscht einen Mitarbeiter endgültig.
// Aufruf: POST /functions/v1/delete-employee  Body: { "employeeId": "<uuid>" }
// Header: Authorization: Bearer <access_token des aufrufenden Admins>
//
// Löscht zuerst den verknüpften Auth-User (falls vorhanden) — sonst bliebe
// ein Login-Konto ohne zugehörigen employees-Datensatz zurück, mit dem sich
// zwar noch jemand anmelden könnte, die App aber keinen Mitarbeiter dazu
// findet. Danach die employees-Zeile selbst (Schichten/Verfügbarkeiten etc.
// hängen per ON DELETE CASCADE/SET NULL daran, siehe Migration 0014).
//
// verify_jwt bewusst aus (siehe supabase/config.toml, gleicher Grund wie bei
// reset-password): die Admin-Berechtigung wird stattdessen hier im Code
// anhand des mitgeschickten Bearer-Tokens geprüft.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "Nicht angemeldet" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData.user) {
    return jsonResponse({ error: "Nicht angemeldet" }, 401);
  }

  const { data: caller } = await admin
    .from("employees")
    .select("id, role")
    .eq("auth_user_id", callerData.user.id)
    .maybeSingle();
  if (caller?.role !== "admin") {
    return jsonResponse({ error: "Nur Admins dürfen Mitarbeiter löschen" }, 403);
  }

  let employeeId: string | undefined;
  try {
    ({ employeeId } = await req.json());
  } catch {
    // employeeId bleibt undefined, wird unten abgefangen
  }
  if (!employeeId) {
    return jsonResponse({ error: "employeeId fehlt" }, 400);
  }
  if (employeeId === caller.id) {
    return jsonResponse({ error: "Der eigene Account kann nicht gelöscht werden" }, 400);
  }

  const { data: target } = await admin
    .from("employees")
    .select("id, auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!target) {
    return jsonResponse({ error: "Mitarbeiter nicht gefunden" }, 404);
  }

  if (target.auth_user_id) {
    await admin.auth.admin.deleteUser(target.auth_user_id);
  }
  const { error: deleteError } = await admin.from("employees").delete().eq("id", employeeId);
  if (deleteError) {
    return jsonResponse({ error: "Mitarbeiter konnte nicht gelöscht werden" }, 500);
  }

  return jsonResponse({ ok: true });
});
