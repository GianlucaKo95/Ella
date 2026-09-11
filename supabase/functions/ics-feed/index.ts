// Supabase Edge Function: generiert einen ICS-Kalenderfeed für einen Mitarbeiter
// Aufruf: GET /functions/v1/ics-feed?employee_id=<uuid>
// Enthält: veröffentlichte Service-Schichten des Mitarbeiters +
//          veröffentlichte Back-Termine seiner Back-Truppe.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function toIcsDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(/:/g, "")}00`;
}

function escapeIcs(text: string): string {
  return text.replace(/[\\;,]/g, (c) => "\\" + c);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const employeeId = url.searchParams.get("employee_id");
  if (!employeeId) {
    return new Response("employee_id fehlt", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, bake_team_id")
    .eq("id", employeeId)
    .single();

  if (!employee) {
    return new Response("Mitarbeiter nicht gefunden", { status: 404 });
  }

  const { data: shifts } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("status", "published");

  const { data: bakeEntries } = employee.bake_team_id
    ? await supabase
        .from("bake_plan_entries")
        .select("*, cake_items(name)")
        .eq("bake_team_id", employee.bake_team_id)
        .eq("status", "published")
    : { data: [] };

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ella//Schicht- und Backplanung//DE"
  ];

  for (const s of shifts || []) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:shift-${s.id}@ella`,
      `DTSTART:${toIcsDateTime(s.date, s.start_time)}`,
      `DTEND:${toIcsDateTime(s.date, s.end_time)}`,
      `SUMMARY:${escapeIcs(
        `Schicht (${s.shift_type === "frueh" ? "Früh" : "Spät"}${s.role_tag ? " – " + s.role_tag : ""})`
      )}`,
      "END:VEVENT"
    );
  }

  for (const b of bakeEntries || []) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:bake-${b.id}@ella`,
      `DTSTART:${toIcsDateTime(b.date, "06:00")}`,
      `DTEND:${toIcsDateTime(b.date, "09:00")}`,
      `SUMMARY:${escapeIcs(`Backen: ${b.cake_items?.name ?? ""} (${b.quantity})`)}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="ella-${employee.name}.ics"`
    }
  });
});
