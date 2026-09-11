import { useEffect, useState } from "react";
import { supabase, type Employee } from "../lib/supabase";
import { DAY_NAMES, RELEVANT_DAYS, nextMonthStart, monthLabel, toMonthStr } from "../lib/dates";

const DAYS = DAY_NAMES;

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

export function Availability({ employee }: { employee: Employee }) {
  const [entries, setEntries] = useState<AvailabilityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newDateAvailable, setNewDateAvailable] = useState(true);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const nextMonth = nextMonthStart(new Date());
  const nextMonthStr = toMonthStr(nextMonth);

  async function load() {
    setLoading(true);
    const [entriesRes, deadlineRes, submissionRes] = await Promise.all([
      supabase.from("availability_entries").select("*").eq("employee_id", employee.id).order("day_of_week"),
      supabase.from("availability_deadlines").select("deadline").eq("month", nextMonthStr).maybeSingle(),
      supabase
        .from("availability_submissions")
        .select("submitted_at")
        .eq("employee_id", employee.id)
        .eq("month", nextMonthStr)
        .maybeSingle()
    ]);
    setEntries((entriesRes.data as AvailabilityEntry[]) || []);
    setDeadline(deadlineRes.data?.deadline ?? null);
    setSubmittedAt(submissionRes.data?.submitted_at ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const recurring = DAYS.map((_, idx) =>
    entries.find((e) => e.kind === "recurring" && e.day_of_week === idx)
  );

  async function setRecurring(dayIndex: number, available: boolean) {
    const existing = recurring[dayIndex];
    if (existing) {
      await supabase.from("availability_entries").update({ available }).eq("id", existing.id);
    } else {
      await supabase.from("availability_entries").insert({
        employee_id: employee.id,
        kind: "recurring",
        day_of_week: dayIndex,
        available
      });
    }
    load();
  }

  async function addOneTime() {
    if (!newDate) return;
    await supabase.from("availability_entries").insert({
      employee_id: employee.id,
      kind: "one_time",
      specific_date: newDate,
      available: newDateAvailable
    });
    setNewDate("");
    load();
  }

  async function removeEntry(id: string) {
    await supabase.from("availability_entries").delete().eq("id", id);
    load();
  }

  const oneTimeEntries = entries.filter((e) => e.kind === "one_time");

  const isComplete = RELEVANT_DAYS.every((dow) => recurring[dow] !== undefined);
  const isLate = deadline ? new Date() > new Date(deadline + "T23:59:59") : false;

  async function submitMonth() {
    await supabase
      .from("availability_submissions")
      .upsert({ employee_id: employee.id, month: nextMonthStr }, { onConflict: "employee_id,month" });
    load();
  }

  return (
    <div>
      <h2>Meine Verfügbarkeit</h2>

      <div className={`card ${submittedAt ? "" : isLate ? "card-attention" : ""}`}>
        <h3>Verfügbarkeit für {monthLabel(nextMonth)}</h3>
        {deadline && (
          <p style={{ margin: "0 0 8px" }}>
            Stichtag: <strong>{new Date(deadline).toLocaleDateString("de-DE")}</strong>
            {isLate && !submittedAt && <span style={{ color: "var(--attention, crimson)" }}> — überfällig!</span>}
          </p>
        )}
        {submittedAt ? (
          <p>✅ Eingereicht am {new Date(submittedAt).toLocaleDateString("de-DE")}.</p>
        ) : (
          <>
            <p>
              {isComplete
                ? "Alle relevanten Tage (Mi–So) sind unten eingetragen — bereit zum Einreichen."
                : "Bitte für alle Tage von Mittwoch bis Sonntag unten \"kann\"/\"kann nicht\" auswählen, bevor du einreichst."}
            </p>
            <button onClick={submitMonth} disabled={!isComplete}>
              Verfügbarkeit für {monthLabel(nextMonth)} einreichen
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3>Dauerhaft (jede Woche)</h3>
        {loading ? (
          <p>Lädt…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tag</th>
                <th>Verfügbar?</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, idx) => {
                const entry = recurring[idx];
                const available = entry?.available ?? null;
                return (
                  <tr key={day}>
                    <td>{day}</td>
                    <td>
                      <button
                        onClick={() => setRecurring(idx, true)}
                        style={{ fontWeight: available === true ? "bold" : "normal" }}
                      >
                        kann
                      </button>{" "}
                      <button
                        onClick={() => setRecurring(idx, false)}
                        style={{ fontWeight: available === false ? "bold" : "normal" }}
                      >
                        kann nicht
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Ausnahme für ein bestimmtes Datum</h3>
        <p>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />{" "}
          <select
            value={newDateAvailable ? "yes" : "no"}
            onChange={(e) => setNewDateAvailable(e.target.value === "yes")}
          >
            <option value="yes">kann</option>
            <option value="no">kann nicht</option>
          </select>{" "}
          <button onClick={addOneTime}>Hinzufügen</button>
        </p>
        <ul>
          {oneTimeEntries.map((e) => (
            <li key={e.id}>
              {e.specific_date}: {e.available ? "kann" : "kann nicht"}{" "}
              <button onClick={() => removeEntry(e.id)}>entfernen</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
