// Supabase Edge Function: legt Benachrichtigungen an UND verschickt echte
// Web-Push-Nachrichten (VAPID-signiert) an alle registrierten Geräte der
// Ziel-Mitarbeiter — ersetzt den bisherigen rein clientseitigen Insert in
// notifications_log (der "channel: web_push" nur versprach, ohne je etwas zu
// verschicken).
//
// Aufruf: POST /functions/v1/send-push  Body: { type, body, employeeIds? }
// Header: Authorization: Bearer <access_token der aufrufenden Person>
//
// Berechtigung je nach type:
//   - 'swap_accepted' / 'availability_submitted': jede angemeldete, aktive
//     Person darf das auslösen (passiert automatisch nach eigener Aktion),
//     `employeeIds` aus dem Body wird dabei IGNORIERT — Ziel sind serverseitig
//     immer alle aktiven Admins, damit niemand über diesen Weg Benachrichtigungen
//     an beliebige andere Mitarbeiter umleiten kann.
//   - 'shift_published' / 'bake_plan_published' / 'announcement' / 'reminder':
//     nur Admins, `employeeIds` aus dem Body legt die Ziel-Mitarbeiter fest.
//
// verify_jwt bewusst aus (supabase/config.toml, wie bei reset-password/
// delete-employee) — die Berechtigung wird hier im Code anhand des
// mitgeschickten Bearer-Tokens geprüft.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

const ADMIN_ONLY_TYPES = new Set(["shift_published", "bake_plan_published", "announcement", "reminder"]);
const EMPLOYEE_TRIGGERED_TYPES = new Set(["swap_accepted", "availability_submitted"]);

const TITLE_BY_TYPE: Record<string, string> = {
  shift_published: "Dienstplan veröffentlicht",
  bake_plan_published: "Backplan veröffentlicht",
  announcement: "Neue Ankündigung",
  swap_accepted: "Schichttausch wartet auf Bestätigung",
  availability_submitted: "Verfügbarkeit eingereicht",
  reminder: "Erinnerung"
};

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

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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
    .select("id, role, active")
    .eq("auth_user_id", callerData.user.id)
    .maybeSingle();
  if (!caller?.active) {
    return jsonResponse({ error: "Nicht angemeldet" }, 401);
  }

  let payload: { type?: string; body?: string; employeeIds?: string[] };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültige Anfrage" }, 400);
  }
  const { type, body } = payload;
  if (!type || !body?.trim()) {
    return jsonResponse({ error: "type und body sind erforderlich" }, 400);
  }

  let targetIds: string[];
  if (EMPLOYEE_TRIGGERED_TYPES.has(type)) {
    const { data: admins } = await admin.from("employees").select("id").eq("role", "admin").eq("active", true);
    targetIds = (admins || []).map((a) => a.id);
  } else if (ADMIN_ONLY_TYPES.has(type)) {
    if (caller.role !== "admin") {
      return jsonResponse({ error: "Nur Admins dürfen das" }, 403);
    }
    targetIds = Array.isArray(payload.employeeIds) ? payload.employeeIds : [];
  } else {
    return jsonResponse({ error: "Unbekannter Benachrichtigungstyp" }, 400);
  }

  if (targetIds.length === 0) {
    return jsonResponse({ ok: true, pushed: 0 });
  }

  await admin.from("notifications_log").insert(
    targetIds.map((target_employee_id) => ({
      type,
      target_employee_id,
      body,
      channel: "web_push"
    }))
  );

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("employee_id", targetIds);

  const title = TITLE_BY_TYPE[type] ?? "Ella";
  const payloadJson = JSON.stringify({ title, body, url: "/home" });

  // Parallel statt nacheinander verschickt (Feedback: "Das Veröffentlichen des
  // Plans dauert bis zu 20 Sekunden bis die Meldung kommt") — bei mehreren
  // Ziel-Geräten hat sich die Laufzeit jedes einzelnen Web-Push-Sendevorgangs
  // (eigener HTTPS-Request an den jeweiligen Push-Dienst) bisher gerade addiert,
  // weil `send-push` seinerseits vom aufrufenden Client abgewartet wurde.
  const results = await Promise.allSettled(
    (subscriptions || []).map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payloadJson)
    )
  );

  let pushed = 0;
  const staleSubscriptionIds: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      pushed++;
      return;
    }
    // 404/410 = Abo ist beim Push-Dienst nicht mehr gültig (z. B. Browserdaten
    // gelöscht, App deinstalliert) — aufräumen, damit künftige Sendungen nicht
    // wieder daran scheitern. Andere Fehler (z. B. vorübergehend nicht
    // erreichbar) werden bewusst ignoriert, ohne den ganzen Versand abzubrechen.
    const status = (result.reason as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      staleSubscriptionIds.push(subscriptions![i].id);
    }
  });
  if (staleSubscriptionIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return jsonResponse({ ok: true, pushed });
});
