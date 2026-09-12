// Supabase Edge Function: legt beim allerersten Login das Passwort eines
// Mitarbeiters an (kein E-Mail-Login, nur Name + selbst gewähltes Passwort).
// Aufruf: POST /functions/v1/set-password  Body: { "employeeId": "<uuid>", "password": "..." }
// Danach meldet sich das Frontend ganz normal über
// supabase.auth.signInWithPassword() mit derselben (synthetischen) Adresse an —
// diese Function stellt keine Session aus, sie legt nur das Konto an.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// Synthetische, nie versendete Adresse – dient nur als eindeutiger Schlüssel
// im Auth-System anstelle einer echten E-Mail. Muss mit lib/supabase.ts
// (Frontend, dort beim Login verwendet) übereinstimmen.
function loginEmail(employeeId: string): string {
  return `${employeeId}@login.ella.internal`;
}

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

  let employeeId: string | undefined;
  let password: string | undefined;
  try {
    ({ employeeId, password } = await req.json());
  } catch {
    // employeeId/password bleiben undefined, wird unten abgefangen
  }
  if (!employeeId || !password || password.length < 6) {
    return jsonResponse({ error: "Name fehlt oder Passwort hat weniger als 6 Zeichen" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: employee } = await admin
    .from("employees")
    .select("id, auth_user_id, active")
    .eq("id", employeeId)
    .eq("active", true)
    .maybeSingle();

  if (!employee) {
    return jsonResponse({ error: "Mitarbeiter nicht gefunden" }, 404);
  }
  if (employee.auth_user_id) {
    return jsonResponse({ error: "Für diesen Namen ist bereits ein Passwort vergeben" }, 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: loginEmail(employee.id),
    password,
    email_confirm: true
  });
  if (createError || !created.user) {
    return jsonResponse({ error: "Konto konnte nicht angelegt werden" }, 500);
  }

  await admin.from("employees").update({ auth_user_id: created.user.id }).eq("id", employee.id);

  return jsonResponse({ ok: true });
});
