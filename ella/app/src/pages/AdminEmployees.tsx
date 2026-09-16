import { useEffect, useState } from "react";
import { deleteEmployee, resetEmployeePassword, supabase } from "../lib/supabase";

type EmployeeRow = {
  id: string;
  name: string;
  role: "admin" | "employee";
  active: boolean;
  bake_team_id: string | null;
  auth_user_id: string | null;
};
type BakeTeam = { id: string; name: string };

const APP_URL = "https://ella.heimdns.de";

// Erzeugt den Einladungstext für WhatsApp/Kopieren.
function inviteMessage(name: string): string {
  return (
    `Hallo ${name}! 👋\n\n` +
    `Du bist jetzt für den Ella Dienst- und Backplan freigeschaltet. So geht's:\n\n` +
    `1. ${APP_URL} öffnen\n` +
    `2. Mit deinem Namen "${name}" anmelden\n` +
    `3. Beim ersten Login legst du dein eigenes Passwort fest\n\n` +
    `Bis bald! 🧁`
  );
}

export function AdminEmployees({ currentEmployeeId }: { currentEmployeeId: string }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [teams, setTeams] = useState<BakeTeam[]>([]);
  const [newName, setNewName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Standardmäßig zugeklappt (Feedback: bei vielen Mitarbeitern ging der Name
  // zwischen all den Feldern/Buttons unter) — nur ein frisch angelegter
  // Mitarbeiter startet aufgeklappt, damit man ihn direkt fertig einrichten kann.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    const { data } = await supabase
      .from("employees")
      .insert({ name: newName.trim(), role: "employee" })
      .select("id")
      .single();
    setNewName("");
    if (data) setExpandedIds((prev) => new Set(prev).add(data.id));
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

  async function removeEmployee(e: EmployeeRow) {
    if (
      !confirm(
        `Mitarbeiter "${e.name}" endgültig löschen? Zugewiesene Schichten werden freigegeben, das Login-Konto wird entfernt. Das kann nicht rückgängig gemacht werden.`
      )
    ) {
      return;
    }
    const error = await deleteEmployee(e.id);
    if (error) alert(error);
    load();
  }

  function inviteViaWhatsapp(name: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage(name))}`, "_blank");
  }

  async function copyInvite(e: EmployeeRow) {
    const text = inviteMessage(e.name);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(e.id);
      setTimeout(() => setCopiedId((id) => (id === e.id ? null : id)), 2000);
    } catch {
      window.prompt("Text zum manuellen Kopieren:", text);
    }
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
      <div className="card">
        {employees.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Noch keine Mitarbeiter angelegt.</p>}
        {employees.map((e) => {
          const expanded = expandedIds.has(e.id);
          const teamName = teams.find((t) => t.id === e.bake_team_id)?.name;
          return (
            <div key={e.id} style={{ borderTop: "1px solid var(--border)", paddingTop: "0.7rem", marginTop: "0.7rem" }}>
              <button
                type="button"
                className="ghost"
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" }}
                onClick={() => toggleExpanded(e.id)}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ink)" }}>{e.name}</span>
                  <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                    {e.role === "admin" ? "Admin" : "Mitarbeiter"} · {e.active ? "aktiv" : "inaktiv"}
                    {teamName && ` · ${teamName}`}
                    {" · "}
                    {e.auth_user_id ? "✅ registriert" : "⏳ noch keine Erstanmeldung"}
                  </span>
                </span>
                <span style={{ color: "var(--ink-soft)" }}>{expanded ? "▲" : "▼"}</span>
              </button>
              {expanded && (
                <div style={{ marginTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                  <div>
                    <label className="label-caps" style={{ display: "block", marginBottom: "0.3rem" }}>
                      Rolle
                    </label>
                    <select value={e.role} onChange={(ev) => updateEmployee(e.id, { role: ev.target.value as any })}>
                      <option value="employee">Mitarbeiter</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
                    <input
                      type="checkbox"
                      checked={e.active}
                      onChange={(ev) => updateEmployee(e.id, { active: ev.target.checked })}
                    />
                    Aktiv
                  </label>
                  <div>
                    <label className="label-caps" style={{ display: "block", marginBottom: "0.3rem" }}>
                      Back-Truppe
                    </label>
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
                  </div>
                  <div>
                    <label className="label-caps" style={{ display: "block", marginBottom: "0.3rem" }}>
                      Login
                    </label>
                    {e.auth_user_id ? (
                      <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => resetPassword(e)}>
                        Passwort zurücksetzen
                      </button>
                    ) : (
                      <span className="row-actions" style={{ flexWrap: "wrap" }}>
                        <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => inviteViaWhatsapp(e.name)}>
                          Einladen (WhatsApp)
                        </button>
                        <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => copyInvite(e)}>
                          {copiedId === e.id ? "Kopiert ✅" : "Text kopieren"}
                        </button>
                      </span>
                    )}
                  </div>
                  {e.id !== currentEmployeeId && (
                    <button
                      className="ghost"
                      style={{ padding: "0.3rem 0.55rem", color: "var(--attention)", alignSelf: "flex-start" }}
                      onClick={() => removeEmployee(e)}
                    >
                      Löschen
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
