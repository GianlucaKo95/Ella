import { useEffect, useState } from "react";
import { resetEmployeePassword, supabase } from "../lib/supabase";

type EmployeeRow = {
  id: string;
  name: string;
  role: "admin" | "employee";
  active: boolean;
  bake_team_id: string | null;
  auth_user_id: string | null;
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

  async function resetPassword(e: EmployeeRow) {
    if (!confirm(`Passwort von ${e.name} zurücksetzen? Die Person muss sich beim nächsten Login neu ein Passwort vergeben.`)) {
      return;
    }
    const error = await resetEmployeePassword(e.id);
    if (error) alert(error);
    load();
  }

  return (
    <div>
      <h2>Mitarbeiter</h2>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        Neuer Mitarbeiter kann sich sofort mit seinem Namen einloggen — beim ersten Login legt
        die Person selbst ihr Passwort fest, danach ist das Login-Konto (auth_user_id)
        verknüpft.
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
            <th>Login</th>
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
              <td>
                {e.auth_user_id ? (
                  <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => resetPassword(e)}>
                    Passwort zurücksetzen
                  </button>
                ) : (
                  <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)" }}>noch kein Login</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
