import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  serviceDays,
  bakeDays,
  toDateStr,
  isoDayOfWeek,
  DAY_NAMES,
  nextMonthStart,
  monthLabel,
  toMonthStr
} from "../lib/dates";

type EmployeeRow = { id: string; name: string; active: boolean; bake_team_id: string | null };
type AvailabilityRow = {
  employee_id: string;
  kind: "recurring" | "one_time";
  day_of_week: number | null;
  specific_date: string | null;
  available: boolean;
};
type StaffingReq = {
  day_of_week: number;
  shift_type: "frueh" | "spaet";
  role_tag: "kueche" | "service" | null;
  required_count: number;
};
type ShiftRow = {
  id: string;
  date: string;
  shift_type: "frueh" | "spaet";
  role_tag: "kueche" | "service" | null;
  start_time: string;
  end_time: string;
  employee_id: string | null;
  status: "draft" | "published";
};
type CakeItem = { id: string; name: string; default_unit: string };
type BakeEntryRow = {
  id: string;
  date: string;
  cake_item_id: string;
  quantity: number;
  bake_team_id: string | null;
  status: "draft" | "published";
};
type BakeTeam = { id: string; name: string };

export function AdminPlanning() {
  const [anchor, setAnchor] = useState(toDateStr(new Date()));
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [requirements, setRequirements] = useState<StaffingReq[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [cakeItems, setCakeItems] = useState<CakeItem[]>([]);
  const [bakeEntries, setBakeEntries] = useState<BakeEntryRow[]>([]);
  const [bakeTeams, setBakeTeams] = useState<BakeTeam[]>([]);
  const [deadline, setDeadline] = useState<string>("");
  const [submissions, setSubmissions] = useState<{ employee_id: string; submitted_at: string }[]>([]);

  const nextMonth = nextMonthStart(new Date());
  const nextMonthStr = toMonthStr(nextMonth);

  const anchorDate = useMemo(() => new Date(anchor + "T00:00:00"), [anchor]);
  const svcDays = useMemo(() => serviceDays(anchorDate), [anchorDate]);
  const bkDays = useMemo(() => bakeDays(anchorDate), [anchorDate]);
  const svcDateStrs = svcDays.map(toDateStr);
  const bkDateStrs = bkDays.map(toDateStr);

  async function loadAll() {
    const [emp, avail, req, sh, cakes, bakes, teams, deadlineRes, submissionsRes] = await Promise.all([
      supabase.from("employees").select("id,name,active,bake_team_id").eq("active", true),
      supabase.from("availability_entries").select("*"),
      supabase.from("staffing_requirements").select("*"),
      supabase.from("shifts").select("*").in("date", svcDateStrs),
      supabase.from("cake_items").select("*"),
      supabase.from("bake_plan_entries").select("*").in("date", bkDateStrs),
      supabase.from("bake_teams").select("*"),
      supabase.from("availability_deadlines").select("deadline").eq("month", nextMonthStr).maybeSingle(),
      supabase.from("availability_submissions").select("employee_id, submitted_at").eq("month", nextMonthStr)
    ]);
    setEmployees((emp.data as EmployeeRow[]) || []);
    setAvailability((avail.data as AvailabilityRow[]) || []);
    setRequirements((req.data as StaffingReq[]) || []);
    setShifts((sh.data as ShiftRow[]) || []);
    setCakeItems((cakes.data as CakeItem[]) || []);
    setBakeEntries((bakes.data as BakeEntryRow[]) || []);
    setBakeTeams((teams.data as BakeTeam[]) || []);
    setDeadline(deadlineRes.data?.deadline ?? "");
    setSubmissions(submissionsRes.data || []);
  }

  async function saveDeadline() {
    if (!deadline) return;
    await supabase
      .from("availability_deadlines")
      .upsert({ month: nextMonthStr, deadline }, { onConflict: "month" });
    loadAll();
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  function availabilityFor(employeeId: string, date: Date, dateStr: string): "kann" | "kann nicht" | "unbekannt" {
    const dow = isoDayOfWeek(date);
    const oneTime = availability.find(
      (a) => a.employee_id === employeeId && a.kind === "one_time" && a.specific_date === dateStr
    );
    if (oneTime) return oneTime.available ? "kann" : "kann nicht";
    const recurring = availability.find(
      (a) => a.employee_id === employeeId && a.kind === "recurring" && a.day_of_week === dow
    );
    if (recurring) return recurring.available ? "kann" : "kann nicht";
    return "unbekannt";
  }

  async function addShift(date: string, shift_type: "frueh" | "spaet", role_tag: "kueche" | "service" | null) {
    await supabase.from("shifts").insert({
      date,
      shift_type,
      role_tag,
      start_time: shift_type === "frueh" ? "07:00" : "13:00",
      end_time: shift_type === "frueh" ? "13:00" : "19:00",
      status: "draft"
    });
    loadAll();
  }

  async function assignShift(id: string, employee_id: string | null) {
    await supabase.from("shifts").update({ employee_id }).eq("id", id);
    loadAll();
  }

  async function deleteShift(id: string) {
    await supabase.from("shifts").delete().eq("id", id);
    loadAll();
  }

  async function addBakeEntry(date: string) {
    if (cakeItems.length === 0) return;
    await supabase.from("bake_plan_entries").insert({
      date,
      cake_item_id: cakeItems[0].id,
      quantity: 1,
      status: "draft"
    });
    loadAll();
  }

  async function updateBakeEntry(id: string, patch: Partial<BakeEntryRow>) {
    await supabase.from("bake_plan_entries").update(patch).eq("id", id);
    loadAll();
  }

  async function deleteBakeEntry(id: string) {
    await supabase.from("bake_plan_entries").delete().eq("id", id);
    loadAll();
  }

  async function publishWeek() {
    await supabase.from("shifts").update({ status: "published" }).in("date", svcDateStrs).eq("status", "draft");
    await supabase.from("bake_plan_entries").update({ status: "published" }).in("date", bkDateStrs).eq("status", "draft");
    loadAll();
  }

  return (
    <div>
      <h2>Planung (Admin)</h2>

      <div className="card">
        <h3>Verfügbarkeits-Stichtag für {monthLabel(nextMonth)}</h3>
        <p>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />{" "}
          <button className="ghost" onClick={saveDeadline}>Stichtag speichern</button>
        </p>
        <table>
          <thead>
            <tr>
              <th>Mitarbeiter</th>
              <th>Eingereicht?</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const sub = submissions.find((s) => s.employee_id === emp.id);
              return (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  <td>
                    {sub ? (
                      <span className="badge published">
                        ✓ {new Date(sub.submitted_at).toLocaleDateString("de-DE")}
                      </span>
                    ) : (
                      <span className="badge draft">ausstehend</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p>
        Woche mit:{" "}
        <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
      </p>
      <button onClick={publishWeek}>📣 Plan & Backplan dieser Woche veröffentlichen</button>

      <h3>Dienstplan (Do–So)</h3>
      {svcDays.map((d, i) => {
        const dateStr = svcDateStrs[i];
        const dow = isoDayOfWeek(d);
        const dayReqs = requirements.filter((r) => r.day_of_week === dow);
        const dayShifts = shifts.filter((s) => s.date === dateStr);
        return (
          <div className="card" key={dateStr}>
            <h4>
              {DAY_NAMES[dow]}, {dateStr}
            </h4>
            {dayReqs.length > 0 && (
              <p style={{ fontSize: "0.85rem", color: "#666" }}>
                Bedarf:{" "}
                {dayReqs
                  .map((r) => `${r.shift_type}${r.role_tag ? "/" + r.role_tag : ""}: ${r.required_count}`)
                  .join(", ")}
              </p>
            )}
            <table>
              <thead>
                <tr>
                  <th>Schicht</th>
                  <th>Rolle</th>
                  <th>Zeit</th>
                  <th>Mitarbeiter (Verfügbarkeit)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dayShifts.map((s) => (
                  <tr key={s.id}>
                    <td>{s.shift_type === "frueh" ? "Früh" : "Spät"}</td>
                    <td>{s.role_tag ?? "—"}</td>
                    <td>
                      {s.start_time}–{s.end_time}
                    </td>
                    <td>
                      <select value={s.employee_id ?? ""} onChange={(e) => assignShift(s.id, e.target.value || null)}>
                        <option value="">– wählen –</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({availabilityFor(emp.id, d, dateStr)})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="ghost" style={{padding:"0.3rem 0.55rem"}} onClick={() => deleteShift(s.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="ghost" onClick={() => addShift(dateStr, "frueh", "kueche")}>+ Früh/Küche</button>{" "}
            <button className="ghost" onClick={() => addShift(dateStr, "frueh", "service")}>+ Früh/Service</button>{" "}
            <button className="ghost" onClick={() => addShift(dateStr, "spaet", null)}>+ Spät</button>
          </div>
        );
      })}

      <h3>Backplan (Mi/Do/Fr, außerhalb Öffnungszeiten)</h3>
      {bkDays.map((d, i) => {
        const dateStr = bkDateStrs[i];
        const dow = isoDayOfWeek(d);
        const dayEntries = bakeEntries.filter((b) => b.date === dateStr);
        return (
          <div className="card" key={dateStr}>
            <h4>
              {DAY_NAMES[dow]}, {dateStr}
            </h4>
            <table>
              <thead>
                <tr>
                  <th>Kuchen</th>
                  <th>Menge</th>
                  <th>Truppe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dayEntries.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <select
                        value={b.cake_item_id}
                        onChange={(e) => updateBakeEntry(b.id, { cake_item_id: e.target.value })}
                      >
                        {cakeItems.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={b.quantity}
                        min={1}
                        style={{ width: "4rem" }}
                        onChange={(e) => updateBakeEntry(b.id, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        value={b.bake_team_id ?? ""}
                        onChange={(e) => updateBakeEntry(b.id, { bake_team_id: e.target.value || null })}
                      >
                        <option value="">– wählen –</option>
                        {bakeTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="ghost" style={{padding:"0.3rem 0.55rem"}} onClick={() => deleteBakeEntry(b.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="ghost" onClick={() => addBakeEntry(dateStr)}>+ Kuchen hinzufügen</button>
          </div>
        );
      })}
    </div>
  );
}
