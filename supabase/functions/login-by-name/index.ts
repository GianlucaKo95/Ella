// Supabase Edge Function: Login wie bei Wizzo – nur Namen antippen, kein Passwort.
// Aufruf: POST /functions/v1/login-by-name  Body: { "employeeId": "<uuid>" }
// Liefert bei Erfolg eine fertige Supabase-Session { access_token, refresh_token }
// für den Auth-User, der zu diesem Mitarbeiter gehört (wird beim ersten Login
// automatisch angelegt und verknüpft).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function loginEmail(employeeId: string): string {
  // Synthetische, nie versendete Adresse – dient nur als eindeutiger Schlüssel
  // im Auth-System, nicht als echter Kontaktweg.
  return `${employeeId}@login.ella.internal`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  let employeeId: string | undefined;
  try {
    ({ employeeId } = await req.json());
  } catch {
    // employeeId bleibt undefined, wird unten abgefangen
  }
  if (!employeeId) {
    return new Response(JSON.stringify({ error: "employeeId fehlt" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: employee } = await admin
    .from("employees")
    .select("id, auth_user_id, active")
    .eq("id", employeeId)
    .eq("active", true)
    .maybeSingle();

  if (!employee) {
    return new Response(JSON.stringify({ error: "Mitarbeiter nicht gefunden" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  const email = loginEmail(employee.id);
  let authUserId = employee.auth_user_id as string | null;

  if (!authUserId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID()
    });
    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: "Login-Konto konnte nicht angelegt werden" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
    authUserId = created.user.id;
    await admin.from("employees").update({ auth_user_id: authUserId }).eq("id", employee.id);
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email
  });
  if (linkError || !link) {
    return new Response(JSON.stringify({ error: "Login fehlgeschlagen" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token
  });
  if (verifyError || !verified.session) {
    return new Response(JSON.stringify({ error: "Login fehlgeschlagen" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  return new Response(
    JSON.stringify({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token
    }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
