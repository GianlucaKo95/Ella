import { useEffect, useState } from "react";
import { fetchAppSettings, notifyAdmins, supabase, type Employee } from "../lib/supabase";
import {
  DAY_NAMES,
  RELEVANT_DAYS,
  nextMonthStart,
  monthLabel,
  monthDaysMatching,
  mergeUniqueDates,
  isoDayOfWeek,
  toDateStr,
  parseDateStr,
  formatDayMonth,
  timeToMinutes,
  toMonthStr
} from "../lib/dates";

const DAYS = DAY_NAMES;

// An Tagen mit Frühschicht wird zwischen "nur Früh"/"nur Spät"/"ganztags"
// unterschieden (Feedback: sonst kein Unterschied zwischen "kann früh" und
// "kann spät" abbildbar) — kodiert über die bisher ungenutzten
// from_time/to_time-Spalten. An Tagen ohne Frühschicht bleibt es bei den
// einfachen zwei Optionen "kann"/"kann nicht" (from_time/to_time bleiben leer).
type DayChoice = "no" | "frueh" | "spaet" | "full";
const FRUEH_WINDOW = { from: "00:00", to: "13:00" };
const SPAET_WINDOW = { from: "13:00", to: "23:59" };

function sameTime(a: string | null, b: string): boolean {
  return a != null && timeToMinutes(a) === timeToMinutes(b);
}

function choiceLabel(choice: DayChoice | null): string {
  switch (choice) {
    case "no":
      return "kann nicht";
    case "frueh":
      return "Früh";
    case "spaet":
      return "Spät";
    case "full":
      return "ganztags";
    default:
      return "keine Angabe";
  }
}

type AvailabilityEntry = {
  id: string;
  kind: "recurring" | "one_time";
  day_of_week: number | null;
  specific_date: string | null;
  from_time: string | null;
  to_time: string | null;
  available: boolean;
  note: string | null;
};

type SpecialDay = { date: string; label: string; service_exception: boolean; frueh_exception: boolean };

// Eigener Tab statt Teil des Profils (vorher unten in Profil.tsx) — die lange
// Tagesliste ging dort neben Profilbild/Name/Benachrichtigungen optisch
// unter. Nur für Mitarbeiter relevant: Admins müssen keine Verfügbarkeit
// abgeben (§9/§11) und sehen diesen Tab daher gar nicht (siehe NavBar/App.tsx).
export function Verfuegbarkeit({ employee }: { employee: Employee }) {
  const [entries, setEntries] = useState<AvailabilityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const [requiredDays, setRequiredDays] = useState<number[]>(RELEVANT_DAYS);
  const [fruehDays, setFruehDays] = useState<number[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  // Tage mit bereits veröffentlichtem Dienstplan — Verfügbarkeit dafür ist
  // gesperrt (auch serverseitig per RLS, siehe Migration
  // 0017_lock_availability_after_publish.sql), damit niemand nach der
  // Zuweisung noch unbemerkt "kann nicht" einträgt.
  const [publishedDates, setPublishedDates] = useState<Set<string>>(new Set());

  const nextMonth = nextMonthStart(new Date());
  const nextMonthStr = toMonthStr(nextMonth);

  // Nur Tage, an denen das Café geöffnet ist (service_days) — nicht die
  // Back-Tage: Backeinträge werden per Truppe zugewiesen (AdminPlanning),
  // nicht anhand individueller Verfügbarkeit, daher wird dafür auch keine
  // eingetragen.
  useEffect(() => {
    fetchAppSettings().then((s) => {
      setRequiredDays(s.service_days);
      setFruehDays(s.frueh_days);
    });
    supabase
      .from("special_days")
      .select("date,label,service_exception,frueh_exception")
      .then(({ data }) => setSpecialDays((data as SpecialDay[]) || []));
  }, []);

  async function load() {
    setLoading(true);
    const [entriesRes, deadlineRes, submissionRes, publishedRes] = await Promise.all([
      supabase.from("availability_entries").select("*").eq("employee_id", employee.id).order("day_of_week"),
      supabase.from("availability_deadlines").select("deadline").eq("month", nextMonthStr).maybeSingle(),
      supabase
        .from("availability_submissions")
        .select("submitted_at")
        .eq("employee_id", employee.id)
        .eq("month", nextMonthStr)
        .maybeSingle(),
      supabase.from("shifts").select("date").eq("status", "published")
    ]);
    setEntries((entriesRes.data as AvailabilityEntry[]) || []);
    setDeadline(deadlineRes.data?.deadline ?? null);
    setSubmittedAt(submissionRes.data?.submitted_at ?? null);
    setPublishedDates(new Set(((publishedRes.data as { date: string }[]) || []).map((r) => r.date)));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  // Direkte Tagesauswahl statt wiederkehrender Wochentags-Regel + Ausnahmen
  // (Feedback: "jeden Freitag anlegen und dann Ausnahmen auswählen" war viel
  // zu umständig) — für den einreichbaren Monat wird für jeden relevanten
  // Tag einzeln kann/kann nicht gesetzt, jeweils als 'one_time'-Eintrag auf
  // das genaue Datum. is_colleague_available/availabilityFor lesen 'one_time'
  // ohnehin vorrangig vor 'recurring', hier also keine Backend-Änderung nötig.
  const specialByDate = new Map(specialDays.map((sd) => [sd.date, sd]));
  // Vom Admin angelegte Sondertage (Feiertage, Muttertag, ...) mit
  // "zusätzlich geöffnet" ODER "zusätzlich Frühschicht" ergänzen die normalen
  // Öffnungstage um einzelne Zusatztermine im einreichbaren Monat — auch ein
  // reiner frueh_exception-Sondertag (ohne zusätzliche Öffnung) braucht eine
  // Verfügbarkeitsabfrage, sonst könnte niemand "kann Früh" dafür angeben.
  const extraServiceDates = specialDays
    .filter((sd) => sd.service_exception || sd.frueh_exception)
    .map((sd) => parseDateStr(sd.date))
    .filter((d) => d.getFullYear() === nextMonth.getFullYear() && d.getMonth() === nextMonth.getMonth());
  const relevantDates = mergeUniqueDates(monthDaysMatching(nextMonth, requiredDays), extraServiceDates);
  const oneTimeEntries = entries.filter((e) => e.kind === "one_time");
  const oneTimeByDate = new Map(oneTimeEntries.map((e) => [e.specific_date as string, e]));

  function choiceFor(entry: AvailabilityEntry | undefined): DayChoice | null {
    if (!entry) return null;
    if (!entry.available) return "no";
    if (sameTime(entry.from_time, FRUEH_WINDOW.from) && sameTime(entry.to_time, FRUEH_WINDOW.to)) return "frueh";
    if (sameTime(entry.from_time, SPAET_WINDOW.from) && sameTime(entry.to_time, SPAET_WINDOW.to)) return "spaet";
    return "full";
  }

  async function setDayAvailability(dateStr: string, choice: DayChoice) {
    const window = choice === "frueh" ? FRUEH_WINDOW : choice === "spaet" ? SPAET_WINDOW : null;
    const patch = { available: choice !== "no", from_time: window?.from ?? null, to_time: window?.to ?? null };
    const existing = oneTimeByDate.get(dateStr);
    if (existing) {
      await supabase.from("availability_entries").update(patch).eq("id", existing.id);
    } else {
      await supabase.from("availability_entries").insert({
        employee_id: employee.id,
        kind: "one_time",
        specific_date: dateStr,
        ...patch
      });
    }
    load();
  }

  // Ein gesperrter Tag (Dienstplan schon veröffentlicht) zählt nicht als
  // "offen" — sonst könnte das Einreichen nie vollständig werden, falls der
  // Admin einen Tag veröffentlicht, bevor die Person ihn ausgefüllt hat.
  const isComplete = relevantDates.every((d) => oneTimeByDate.has(toDateStr(d)) || publishedDates.has(toDateStr(d)));
  const missingCount = relevantDates.filter(
    (d) => !oneTimeByDate.has(toDateStr(d)) && !publishedDates.has(toDateStr(d))
  ).length;
  const isLate = deadline ? new Date() > new Date(deadline + "T23:59:59") : false;

  async function submitMonth() {
    await supabase
      .from("availability_submissions")
      .upsert({ employee_id: employee.id, month: nextMonthStr }, { onConflict: "employee_id,month" });
    await notifyAdmins("availability_submitted", `${employee.name} hat die Verfügbarkeit für ${monthLabel(nextMonth)} eingereicht`);
    load();
  }

  return (
    <div>
      <h2>Verfügbarkeit</h2>

      <div className={`card ${submittedAt ? "" : isLate ? "card-attention" : ""}`}>
        <h3>Verfügbarkeit für {monthLabel(nextMonth)}</h3>
        {deadline && (
          <p style={{ margin: "0 0 8px" }}>
            Stichtag: <strong>{new Date(deadline).toLocaleDateString("de-DE")}</strong>
            {isLate && !submittedAt && <span style={{ color: "var(--attention)" }}> — überfällig!</span>}
          </p>
        )}
        {submittedAt ? (
          <p>
            ✅ Eingereicht am {new Date(submittedAt).toLocaleDateString("de-DE")}. Du kannst deine Angaben unten
            jederzeit noch ändern, bis der Admin den Dienstplan erstellt — jede Änderung wird sofort gespeichert.
          </p>
        ) : (
          <p>
            {isComplete
              ? "Für alle Tage unten ist \"kann\"/\"kann nicht\" eingetragen — bereit zum Einreichen."
              : `Bitte für die ${missingCount} noch offenen Tage unten "kann"/"kann nicht" auswählen, bevor du einreichst.`}
          </p>
        )}
        {loading ? (
          <p>Lädt…</p>
        ) : (
          <div>
            {relevantDates.map((d) => {
              const dateStr = toDateStr(d);
              const choice = choiceFor(oneTimeByDate.get(dateStr));
              const specialDay = specialByDate.get(dateStr);
              const hasFrueh = fruehDays.includes(isoDayOfWeek(d)) || specialDay?.frueh_exception === true;
              const locked = publishedDates.has(dateStr);
              return (
                <div className="avail-row" key={dateStr}>
                  <span className="avail-row-day">
                    {DAYS[isoDayOfWeek(d)]}, {formatDayMonth(d)}
                    {specialDay && (
                      <span style={{ display: "block", color: "var(--ink-soft)", fontSize: "0.72rem" }}>
                        {specialDay.label}
                      </span>
                    )}
                  </span>
                  {locked ? (
                    <span className="hint" title="Dienstplan für diesen Tag bereits erstellt">
                      🔒 {choiceLabel(choice)}
                    </span>
                  ) : (
                    <div className="choice-row">
                      {hasFrueh ? (
                        <>
                          <button className={choice === "no" ? "off-on" : ""} onClick={() => setDayAvailability(dateStr, "no")}>
                            kann nicht
                          </button>
                          <button className={choice === "frueh" ? "on" : ""} onClick={() => setDayAvailability(dateStr, "frueh")}>
                            Früh
                          </button>
                          <button className={choice === "spaet" ? "on" : ""} onClick={() => setDayAvailability(dateStr, "spaet")}>
                            Spät
                          </button>
                          <button className={choice === "full" ? "on" : ""} onClick={() => setDayAvailability(dateStr, "full")}>
                            ganztags
                          </button>
                        </>
                      ) : (
                        <>
                          <button className={choice === "full" ? "on" : ""} onClick={() => setDayAvailability(dateStr, "full")}>
                            kann
                          </button>
                          <button className={choice === "no" ? "off-on" : ""} onClick={() => setDayAvailability(dateStr, "no")}>
                            kann nicht
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!submittedAt && (
          <button onClick={submitMonth} disabled={!isComplete} style={{ marginTop: "0.8rem" }}>
            Verfügbarkeit für {monthLabel(nextMonth)} einreichen
          </button>
        )}
      </div>
    </div>
  );
}
