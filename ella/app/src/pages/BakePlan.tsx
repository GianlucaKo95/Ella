import { useEffect, useState } from "react";
import { supabase, type Employee } from "../lib/supabase";

type BakeEntry = {
  id: string;
  date: string;
  quantity: number;
  note: string | null;
  cake_items: { name: string; default_unit: string } | null;
  bake_teams: { name: string } | null;
};

export function BakePlan({ employee }: { employee: Employee }) {
  const [entries, setEntries] = useState<BakeEntry[]>([]);

  useEffect(() => {
    supabase
      .from("bake_plan_entries")
      .select("*, cake_items(name, default_unit), bake_teams(name)")
      .eq("status", "published")
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date")
      .then(({ data }) => setEntries((data as unknown as BakeEntry[]) || []));
  }, []);

  return (
    <div>
      <h2>Backplan</h2>
      {!employee.bake_team_id && (
        <p>Dir ist noch keine Back-Truppe zugeordnet — frag den Admin.</p>
      )}
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Kuchen</th>
            <th>Menge</th>
            <th>Truppe</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{e.date}</td>
              <td>{e.cake_items?.name}</td>
              <td>
                {e.quantity} {e.cake_items?.default_unit}
              </td>
              <td>{e.bake_teams?.name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
