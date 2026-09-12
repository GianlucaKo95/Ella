import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type EmployeeRow = {
  id: string;
  name: string;
  role: "admin" | "employee";
  active: boolean;
  bake_team_id: string | null;
};
type BakeTeam = { id: string; name: string };

export function AdminEmployees() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [teams, setTeams] = useState<BakeTeam[]>([]);
  const [newName, setNewName] = useState("");

  async function load() {
    const [emp, t] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("bake_teams").select("*").order("name")
    ]);
    setEmployees((emp.data as EmployeeRow[]) || []);
    setTeams((t.data as BakeTeam[]) || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateEmployee(id: string, patch: Partial<EmployeeRow>) {
    await supabase.from("employees").update(patch).eq("id", id);
    load();
  }

  async function addEmployee() {
    if (!newName.trim()) return;
    await supabase.from("employees").insert({ name: newName.trim(), role: "employee" });
    setNewName("");
    load();
  }

  return (
    <div>
      <h2>Mitarbeiter</h2>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        Neuer Mitarbeiter erscheint sofort auf dem Login-Bildschirm zur Auswahl — die
        Verknüpfung mit dem Login-Konto (auth_user_id) passiert automatisch beim ersten Antippen
        des Namens.
      </p>
      <div className="card">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />{" "}
        <button onClick={addEmployee}>+ Mitarbeiter anlegen</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Rolle</th>
            <th>Aktiv</th>
            <th>Back-Truppe</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>
                <select value={e.role} onChange={(ev) => updateEmployee(e.id, { role: ev.target.value as any })}>
                  <option value="employee">Mitarbeiter</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={e.active}
                  onChange={(ev) => updateEmployee(e.id, { active: ev.target.checked })}
                />
              </td>
              <td>
                <select
                  value={e.bake_team_id ?? ""}
                  onChange={(ev) => updateEmployee(e.id, { bake_team_id: ev.target.value || null })}
                >
                  <option value="">– keine –</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
