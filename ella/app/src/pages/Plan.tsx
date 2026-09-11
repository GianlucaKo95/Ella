import { useEffect, useState } from "react";
import { supabase, type Employee } from "../lib/supabase";
import { icsFeedUrl } from "../lib/ics";

type Shift = {
  id: string;
  date: string;
  shift_type: "frueh" | "spaet";
  role_tag: "kueche" | "service" | null;
  start_time: string;
  end_time: string;
  employee_id: string | null;
  employees: { name: string } | null;
};

export function Plan({ employee }: { employee: Employee }) {
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    supabase
      .from("shifts")
      .select("*, employees(name)")
      .eq("status", "published")
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date")
      .then(({ data }) => setShifts((data as unknown as Shift[]) || []));
  }, []);

  return (
    <div>
      <h2>Dienstplan (Service)</h2>
      <p>
        <a href={icsFeedUrl(employee.id)}>📅 Meinen Kalender abonnieren (ICS)</a>
      </p>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Schicht</th>
            <th>Rolle</th>
            <th>Zeit</th>
            <th>Mitarbeiter</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.id}>
              <td>{s.date}</td>
              <td>{s.shift_type === "frueh" ? "Früh" : "Spät"}</td>
              <td>{s.role_tag ?? "—"}</td>
              <td>
                {s.start_time}–{s.end_time}
              </td>
              <td>{s.employees?.name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
