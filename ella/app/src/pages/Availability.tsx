import { useEffect, useState } from "react";
import { supabase, type Employee } from "../lib/supabase";

const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

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

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("availability_entries")
      .select("*")
      .eq("employee_id", employee.id)
      .order("day_of_week", { ascending: true });
    setEntries((data as AvailabilityEntry[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
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

  return (
    <div>
      <h2>Meine Verfügbarkeit</h2>

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
