import { useEffect, useState } from "react";
import { fetchAppSettings, supabase, type Employee } from "../lib/supabase";
import { DAY_NAMES, RELEVANT_DAYS, relevantDays, nextMonthStart, monthLabel, toMonthStr } from "../lib/dates";

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

export function Profil({ employee, onEmployeeChanged }: { employee: Employee; onEmployeeChanged?: () => void }) {
  const [entries, setEntries] = useState<AvailabilityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newDateAvailable, setNewDateAvailable] = useState(true);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const [name, setName] = useState(employee.name);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [requiredDays, setRequiredDays] = useState<number[]>(RELEVANT_DAYS);

  const nextMonth = nextMonthStart(new Date());
  const nextMonthStr = toMonthStr(nextMonth);

  useEffect(() => {
    fetchAppSettings().then((s) => setRequiredDays(relevantDays(s.service_days, s.bake_days)));
  }, []);

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
    setName(employee.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  async function saveName() {
    if (!name.trim() || name.trim() === employee.name) return;
    setSavingName(true);
    setNameSaved(false);
    const { error } = await supabase.rpc("update_my_name", { new_name: name.trim() });
    setSavingName(false);
    if (!error) {
      setNameSaved(true);
      onEmployeeChanged?.();
    }
  }

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

  const isComplete = requiredDays.every((dow) => recurring[dow] !== undefined);
  const isLate = deadline ? new Date() > new Date(deadline + "T23:59:59") : false;

  async function submitMonth() {
    await supabase
      .from("availability_submissions")
      .upsert({ employee_id: employee.id, month: nextMonthStr }, { onConflict: "employee_id,month" });
    load();
  }

  return (
    <div>
      <h2>Profil</h2>

      <div className="card">
        <h3>Name</h3>
        <div className="row-actions">
          <input
            style={{ flex: 1 }}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSaved(false);
            }}
          />
          <button onClick={saveName} disabled={savingName || !name.trim() || name.trim() === employee.name}>
            Speichern
          </button>
        </div>
        {nameSaved && <p style={{ color: "var(--mint)", margin: "0.5rem 0 0", fontSize: "0.8rem" }}>Gespeichert ✅</p>}
      </div>

      <div className={`card ${submittedAt ? "" : isLate ? "card-attention" : ""}`}>
        <h3>Verfügbarkeit für {monthLabel(nextMonth)}</h3>
        {deadline && (
          <p style={{ margin: "0 0 8px" }}>
            Stichtag: <strong>{new Date(deadline).toLocaleDateString("de-DE")}</strong>
            {isLate && !submittedAt && <span style={{ color: "var(--attention)" }}> — überfällig!</span>}
          </p>
        )}
        {submittedAt ? (
          <p>✅ Eingereicht am {new Date(submittedAt).toLocaleDateString("de-DE")}.</p>
        ) : (
          <>
            <p>
              {isComplete
                ? `Alle relevanten Tage (${requiredDays.map((d) => DAYS[d]).join(", ")}) sind unten eingetragen — bereit zum Einreichen.`
                : `Bitte für alle Tage (${requiredDays.map((d) => DAYS[d]).join(", ")}) unten "kann"/"kann nicht" auswählen, bevor du einreichst.`}
            </p>
            <button onClick={submitMonth} disabled={!isComplete}>
              Verfügbarkeit für {monthLabel(nextMonth)} einreichen
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3>Dauerhafte Verfügbarkeiten</h3>
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
                      <div className="segmented">
                        <button className={available === true ? "on" : ""} onClick={() => setRecurring(idx, true)}>
                          kann
                        </button>
                        <button className={available === false ? "off-on" : ""} onClick={() => setRecurring(idx, false)}>
                          kann nicht
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Ausnahmen</h3>
        <p>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />{" "}
          <select
            value={newDateAvailable ? "yes" : "no"}
            onChange={(e) => setNewDateAvailable(e.target.value === "yes")}
          >
            <option value="yes">kann</option>
            <option value="no">kann nicht</option>
          </select>{" "}
          <button className="ghost" onClick={addOneTime}>Hinzufügen</button>
        </p>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {oneTimeEntries.map((e) => (
            <li
              key={e.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.4rem 0",
                borderBottom: "1px solid var(--border)"
              }}
            >
              <span>
                {e.specific_date}: {e.available ? "kann" : "kann nicht"}
              </span>
              <button className="ghost" style={{ fontSize: "0.65rem", padding: "0.3rem 0.5rem" }} onClick={() => removeEntry(e.id)}>
                entfernen
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
