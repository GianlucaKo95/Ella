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

// An Tagen mit Frühschicht wird zwischen "Früh/Küche"/"Früh/Service"/"Spät"/
// "ganztags" unterschieden (Feedback: sonst kein Unterschied zwischen "kann
// früh" und "kann spät" abbildbar; Folge-Feedback: "müsste bei der
// Frühschicht noch die Auswahl zwischen Küche 07:00 Uhr und Service 08:30 Uhr
// unterschieden werden können" — beide Frühschichten haben seit dem
// rollenabhängigen Default in addShift() unterschiedliche Startzeiten,
// jemand kann aber z. B. nur die eine der beiden übernehmen) — kodiert über
// die bisher ungenutzten from_time/to_time-Spalten, mit der Grenze bei 08:00
// zwischen beiden Fenstern (mittig zwischen den Default-Zeiten 07:00/08:30,
// bleibt bei kleineren Zeitverschiebungen durch den Admin noch robust). An
// Tagen ohne Frühschicht bleibt es bei den einfachen zwei Optionen
// "kann"/"kann nicht" (from_time/to_time bleiben leer).
type DayChoice = "no" | "frueh_kueche" | "frueh_service" | "spaet" | "full";
const FRUEH_KUECHE_WINDOW = { from: "00:00", to: "08:00" };
const FRUEH_SERVICE_WINDOW = { from: "08:00", to: "13:00" };
const SPAET_WINDOW = { from: "13:00", to: "23:59" };

function sameTime(a: string | null, b: string): boolean {
  return a != null && timeToMinutes(a) === timeToMinutes(b);
}

function choiceLabel(choice: DayChoice | null): string {
  switch (choice) {
    case "no":
      return "kann nicht";
    case "frueh_kueche":
      return "Früh/Küche";
    case "frueh_service":
      return "Früh/Service";
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
type EitherOrPair = { id: string; date_a: string; date_b: string };

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
  // Entweder/Oder-Tage (Feedback: "wenn ich für Tag 1 eingeplant werde, kann
  // ich an Tag 2 nicht oder wenn ich an Tag 2 eingeplant bin, kann ich an Tag
  // 1 nicht") — mehrere Paare möglich, je Paar genau 2 Tage, reine
  // Zusatzinformation für den Hinweis in der Schichtplanung (AdminPlanning.tsx).
  // Jeder Tag kann höchstens Teil eines Paares sein.
  const [eitherOrPairs, setEitherOrPairs] = useState<EitherOrPair[]>([]);
  // Checkbox an einem Tag ohne (noch) gewählten Partner-Tag — rein lokaler
  // UI-Zustand, damit die Checkbox schon gesetzt aussieht, bevor ein Paar in
  // der Datenbank existiert (Feedback: "als Check-Box an den Tag anfügen und
  // wenn der Haken gesetzt ist ein Feld mit dem zu verknüpfenden Tag öffnet").
  const [pendingEitherOr, setPendingEitherOr] = useState<Set<string>>(new Set());

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
    const [entriesRes, deadlineRes, submissionRes, publishedRes, eitherOrRes] = await Promise.all([
      supabase.from("availability_entries").select("*").eq("employee_id", employee.id).order("day_of_week"),
      supabase.from("availability_deadlines").select("deadline").eq("month", nextMonthStr).maybeSingle(),
      supabase
        .from("availability_submissions")
        .select("submitted_at")
        .eq("employee_id", employee.id)
        .eq("month", nextMonthStr)
        .maybeSingle(),
      supabase.from("shifts").select("date").eq("status", "published"),
      supabase.from("availability_either_or_pairs").select("id,date_a,date_b").eq("employee_id", employee.id)
    ]);
    setEntries((entriesRes.data as AvailabilityEntry[]) || []);
    setDeadline(deadlineRes.data?.deadline ?? null);
    setSubmittedAt(submissionRes.data?.submitted_at ?? null);
    setPublishedDates(new Set(((publishedRes.data as { date: string }[]) || []).map((r) => r.date)));
    setEitherOrPairs((eitherOrRes.data as EitherOrPair[]) || []);
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
  // Jeder Tag steckt in höchstens einem Paar — als Map von jedem der beiden
  // Tage auf das gemeinsame Paar, damit sich der Partner-Tag pro Zeile ohne
  // weitere Suche nachschlagen lässt.
  const pairByDate = new Map<string, EitherOrPair>();
  for (const p of eitherOrPairs) {
    pairByDate.set(p.date_a, p);
    pairByDate.set(p.date_b, p);
  }

  function choiceFor(entry: AvailabilityEntry | undefined): DayChoice | null {
    if (!entry) return null;
    if (!entry.available) return "no";
    if (sameTime(entry.from_time, FRUEH_KUECHE_WINDOW.from) && sameTime(entry.to_time, FRUEH_KUECHE_WINDOW.to)) return "frueh_kueche";
    if (sameTime(entry.from_time, FRUEH_SERVICE_WINDOW.from) && sameTime(entry.to_time, FRUEH_SERVICE_WINDOW.to)) return "frueh_service";
    if (sameTime(entry.from_time, SPAET_WINDOW.from) && sameTime(entry.to_time, SPAET_WINDOW.to)) return "spaet";
    // Ein gesetztes, aber zu keinem der obigen Fenster passendes Zeitfenster
    // ist ein Altbestand vom früheren, einzelnen "Früh"-Fenster (00:00–13:00,
    // vor der Aufteilung in Küche/Service) — dafür lässt sich nicht mehr
    // rückwirkend erraten, welche der beiden Rollen gemeint war. Absichtlich
    // kein Button vorausgewählt (statt fälschlich "ganztags" zu zeigen), die
    // Person muss den Tag einmal neu bestätigen.
    if (entry.from_time || entry.to_time) return null;
    return "full";
  }

  // Feedback: "Ich bräuchte auch noch bei den Verfügbarkeiten pro Tag ein
  // Notizfeld" — nutzt die schon seit Migration 0001 bestehende, bisher nie
  // in der UI verwendete `availability_entries.note`-Spalte. Bewusst nur für
  // einen Tag mit bereits gewähltem kann/kann-nicht editierbar (kein
  // eigenständiges Anlegen einer Verfügbarkeitszeile allein durch eine
  // Notiz) — sonst würde eine reine Notiz ohne explizite Wahl den Tag über
  // `choiceFor()`/`isDayAnswered` fälschlich als "ganztags verfügbar"
  // beantwortet erscheinen lassen.
  async function updateDayNote(dateStr: string, note: string) {
    const existing = oneTimeByDate.get(dateStr);
    if (!existing) return;
    await supabase.from("availability_entries").update({ note: note.trim() || null }).eq("id", existing.id);
    load();
  }

  async function setDayAvailability(dateStr: string, choice: DayChoice) {
    const window =
      choice === "frueh_kueche"
        ? FRUEH_KUECHE_WINDOW
        : choice === "frueh_service"
          ? FRUEH_SERVICE_WINDOW
          : choice === "spaet"
            ? SPAET_WINDOW
            : null;
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

  // Ersetzt (löscht zuerst) ein eventuell schon bestehendes Paar für diesen
  // Tag und legt bei gewähltem Partner-Tag ein neues an — ein leerer
  // `partnerDateStr` löscht nur, ohne ein neues Paar anzulegen.
  async function setEitherOrPartner(dateStr: string, partnerDateStr: string) {
    const existing = pairByDate.get(dateStr);
    if (existing) {
      await supabase.from("availability_either_or_pairs").delete().eq("id", existing.id);
    }
    if (partnerDateStr) {
      await supabase.from("availability_either_or_pairs").insert({
        employee_id: employee.id,
        date_a: dateStr,
        date_b: partnerDateStr
      });
    }
    load();
  }

  // Ein gesperrter Tag (Dienstplan schon veröffentlicht) zählt nicht als
  // "offen" — sonst könnte das Einreichen nie vollständig werden, falls der
  // Admin einen Tag veröffentlicht, bevor die Person ihn ausgefüllt hat. Ein
  // Tag mit nicht mehr erkennbarem Zeitfenster (Altbestand des früheren
  // einzelnen "Früh"-Buttons, s. `choiceFor()`) zählt bewusst NICHT als
  // beantwortet — sonst würde das "bereit zum Einreichen" so einen Tag
  // verdecken, den die Person eigentlich neu bestätigen sollte.
  const isDayAnswered = (d: Date) => choiceFor(oneTimeByDate.get(toDateStr(d))) !== null || publishedDates.has(toDateStr(d));
  const isComplete = relevantDates.every(isDayAnswered);
  const missingCount = relevantDates.filter((d) => !isDayAnswered(d)).length;
  const isLate = deadline ? new Date() > new Date(deadline + "T23:59:59") : false;
  // Nur noch offene Tage stehen für neue Entweder/Oder-Paare zur Auswahl —
  // ein bereits veröffentlichter Tag ist ohnehin nicht mehr planbar.
  const openDates = relevantDates.filter((d) => !publishedDates.has(toDateStr(d)));

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
              const entry = oneTimeByDate.get(dateStr);
              const choice = choiceFor(entry);
              const specialDay = specialByDate.get(dateStr);
              const hasFrueh = fruehDays.includes(isoDayOfWeek(d)) || specialDay?.frueh_exception === true;
              const locked = publishedDates.has(dateStr);
              const pair = pairByDate.get(dateStr);
              const partnerDate = pair ? (pair.date_a === dateStr ? pair.date_b : pair.date_a) : "";
              const eitherOrChecked = !!pair || pendingEitherOr.has(dateStr);
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
                          <button
                            className={choice === "frueh_kueche" ? "on" : ""}
                            onClick={() => setDayAvailability(dateStr, "frueh_kueche")}
                          >
                            Früh/Küche
                          </button>
                          <button
                            className={choice === "frueh_service" ? "on" : ""}
                            onClick={() => setDayAvailability(dateStr, "frueh_service")}
                          >
                            Früh/Service
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
                  {!locked && (
                    <div className="row-actions" style={{ width: "100%", flexWrap: "wrap" }}>
                      <label className="hint" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <input
                          type="checkbox"
                          checked={eitherOrChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPendingEitherOr((prev) => new Set(prev).add(dateStr));
                            } else {
                              setPendingEitherOr((prev) => {
                                const next = new Set(prev);
                                next.delete(dateStr);
                                return next;
                              });
                              if (pair) setEitherOrPartner(dateStr, "");
                            }
                          }}
                        />
                        Entweder/Oder-Tag
                      </label>
                      {eitherOrChecked && (
                        <select value={partnerDate} onChange={(e) => setEitherOrPartner(dateStr, e.target.value)}>
                          <option value="">Tag wählen…</option>
                          {openDates
                            .filter((other) => {
                              const otherStr = toDateStr(other);
                              if (otherStr === dateStr) return false;
                              const otherPair = pairByDate.get(otherStr);
                              // Tage, die schon Teil eines ANDEREN Paares sind, nicht anbieten.
                              return !otherPair || otherPair === pair;
                            })
                            .map((other) => {
                              const otherStr = toDateStr(other);
                              return (
                                <option key={otherStr} value={otherStr}>
                                  {formatDayMonth(other)}
                                </option>
                              );
                            })}
                        </select>
                      )}
                    </div>
                  )}
                  {!locked && (
                    <div className="row-actions" style={{ width: "100%" }}>
                      <input
                        type="text"
                        style={{ width: "100%" }}
                        placeholder={entry ? "Notiz (optional, z. B. Grund oder Uhrzeit)" : "Erst kann/kann nicht wählen, dann Notiz möglich"}
                        disabled={!entry}
                        defaultValue={entry?.note ?? ""}
                        onBlur={(e) => e.target.value !== (entry?.note ?? "") && updateDayNote(dateStr, e.target.value)}
                      />
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
