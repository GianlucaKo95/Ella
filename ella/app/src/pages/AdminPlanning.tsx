import { useEffect, useMemo, useState } from "react";
import { fetchAppSettings, notifyEmployees, supabase } from "../lib/supabase";
import {
  monthDaysMatching,
  toDateStr,
  isoDayOfWeek,
  DAY_NAMES,
  nextMonthStart,
  monthLabel,
  toMonthStr,
  billingPeriod,
  formatDayMonth,
  addMonths,
  monthStartOf
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
type PendingSwap = {
  id: string;
  status: "accepted";
  shift_id: string;
  offered_to: string;
  requested_by_employee: { name: string } | null;
  offered_to_employee: { name: string } | null;
  shifts: { date: string; shift_type: "frueh" | "spaet" } | null;
};

export function AdminPlanning() {
  const [planMonth, setPlanMonth] = useState(() => monthStartOf(new Date()));
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [requirements, setRequirements] = useState<StaffingReq[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [cakeItems, setCakeItems] = useState<CakeItem[]>([]);
  const [bakeEntries, setBakeEntries] = useState<BakeEntryRow[]>([]);
  const [bakeTeams, setBakeTeams] = useState<BakeTeam[]>([]);
  const [deadline, setDeadline] = useState<string>("");
  const [submissions, setSubmissions] = useState<{ employee_id: string; submitted_at: string }[]>([]);
  const [billingStartDay, setBillingStartDay] = useState(1);
  // Zuletzt gespeicherte Einstellungen — bestimmen, was tatsächlich geplant wird.
  const [savedServiceDays, setSavedServiceDays] = useState<number[]>([3, 4, 5, 6]);
  const [savedBakeDays, setSavedBakeDays] = useState<number[]>([2, 3, 4]);
  // Unsaved Entwurf der Checkbox-Auswahl, bis "Tage speichern" geklickt wird.
  const [serviceDays, setServiceDaysState] = useState<number[]>(savedServiceDays);
  const [bakeDays, setBakeDaysState] = useState<number[]>(savedBakeDays);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [pendingSwaps, setPendingSwaps] = useState<PendingSwap[]>([]);
  const [publishWarningAck, setPublishWarningAck] = useState(false);
  const dayRulesDirty = serviceDays.join() !== savedServiceDays.join() || bakeDays.join() !== savedBakeDays.join();

  const nextMonth = nextMonthStart(new Date());
  const nextMonthStr = toMonthStr(nextMonth);
  const previewPeriod = useMemo(() => billingPeriod(new Date(), billingStartDay), [billingStartDay]);

  // Die Planung erfolgt bewusst immer für den ganzen Kalendermonat — unabhängig
  // vom admin-einstellbaren Abrechnungszeitraum, der nur die Stundenanzeige
  // der Mitarbeiter im Kalender betrifft, nicht was geplant werden muss. Welche
  // Wochentage überhaupt Service- bzw. Back-Tage sind, kommt aus den zuletzt
  // GESPEICHERTEN Einstellungen — ein unsaved Toggle ändert die Planung unten
  // erst nach "Tage speichern" (siehe dayRulesDirty-Hinweis im UI).
  const svcDays = useMemo(() => monthDaysMatching(planMonth, savedServiceDays), [planMonth, savedServiceDays]);
  const bkDays = useMemo(() => monthDaysMatching(planMonth, savedBakeDays), [planMonth, savedBakeDays]);
  const svcDateStrs = svcDays.map(toDateStr);
  const bkDateStrs = bkDays.map(toDateStr);

  async function loadAll() {
    const [emp, avail, req, sh, cakes, bakes, teams, deadlineRes, submissionsRes, swapsRes] = await Promise.all([
      supabase.from("employees").select("id,name,active,bake_team_id").eq("active", true),
      supabase.from("availability_entries").select("*"),
      supabase.from("staffing_requirements").select("*"),
      supabase.from("shifts").select("*").in("date", svcDateStrs),
      supabase.from("cake_items").select("*"),
      supabase.from("bake_plan_entries").select("*").in("date", bkDateStrs),
      supabase.from("bake_teams").select("*"),
      supabase.from("availability_deadlines").select("deadline").eq("month", nextMonthStr).maybeSingle(),
      supabase.from("availability_submissions").select("employee_id, submitted_at").eq("month", nextMonthStr),
      supabase
        .from("shift_swap_requests")
        .select(
          "id,status,shift_id,offered_to,shifts(date,shift_type),requested_by_employee:requested_by(name),offered_to_employee:offered_to(name)"
        )
        .eq("status", "accepted")
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
    setPendingSwaps((swapsRes.data as unknown as PendingSwap[]) || []);
  }

  async function saveDeadline() {
    if (!deadline) return;
    await supabase
      .from("availability_deadlines")
      .upsert({ month: nextMonthStr, deadline }, { onConflict: "month" });
    loadAll();
  }

  async function saveBillingStartDay(value: number) {
    setSavingSettings(true);
    await supabase.from("app_settings").update({ billing_period_start_day: value }).eq("id", true);
    setBillingStartDay(value);
    setSavingSettings(false);
  }

  function toggleDay(list: number[], setList: (v: number[]) => void, day: number) {
    setList(list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort((a, b) => a - b));
  }

  async function saveDayRules() {
    if (serviceDays.length === 0 || bakeDays.length === 0) return;
    setSavingSettings(true);
    await supabase
      .from("app_settings")
      .update({ service_days: serviceDays, bake_days: bakeDays })
      .eq("id", true);
    setSavedServiceDays(serviceDays);
    setSavedBakeDays(bakeDays);
    setSavingSettings(false);
  }

  async function addBakeTeam() {
    if (!newTeamName.trim()) return;
    await supabase.from("bake_teams").insert({ name: newTeamName.trim() });
    setNewTeamName("");
    loadAll();
  }

  async function renameBakeTeam(id: string, name: string) {
    await supabase.from("bake_teams").update({ name }).eq("id", id);
    loadAll();
  }

  async function deleteBakeTeam(id: string) {
    await supabase.from("bake_teams").delete().eq("id", id);
    loadAll();
  }

  async function setEmployeeTeam(employeeId: string, teamId: string | null) {
    await supabase.from("employees").update({ bake_team_id: teamId }).eq("id", employeeId);
    loadAll();
  }

  useEffect(() => {
    fetchAppSettings().then((s) => {
      setBillingStartDay(s.billing_period_start_day);
      setSavedServiceDays(s.service_days);
      setSavedBakeDays(s.bake_days);
      setServiceDaysState(s.service_days);
      setBakeDaysState(s.bake_days);
    });
  }, []);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planMonth, savedServiceDays, savedBakeDays]);

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

  // Back-Einträge ohne zugeordnete Truppe — blockieren das Veröffentlichen,
  // bis entweder eine Truppe gewählt wird oder der Admin bewusst überstimmt.
  const unassignedBakeEntries = useMemo(
    () => bakeEntries.filter((b) => b.status === "draft" && !b.bake_team_id),
    [bakeEntries]
  );

  // Kollisions-Warnung: Mitglied einer Back-Truppe ist am selben Tag auch für
  // eine Service-Schicht eingeteilt.
  function collisionsFor(dateStr: string, teamId: string | null): string[] {
    if (!teamId) return [];
    const memberIds = new Set(employees.filter((e) => e.bake_team_id === teamId).map((e) => e.id));
    const dayShifts = shifts.filter((s) => s.date === dateStr && s.employee_id);
    return dayShifts.filter((s) => memberIds.has(s.employee_id as string)).map((s) => {
      const emp = employees.find((e) => e.id === s.employee_id);
      return emp?.name ?? "?";
    });
  }

  async function publishMonth(force = false) {
    if (!force && unassignedBakeEntries.length > 0) {
      setPublishWarningAck(false);
      return;
    }
    const { data: publishedShifts } = await supabase
      .from("shifts")
      .update({ status: "published" })
      .in("date", svcDateStrs)
      .eq("status", "draft")
      .select("employee_id");
    await supabase.from("bake_plan_entries").update({ status: "published" }).in("date", bkDateStrs).eq("status", "draft");
    const notifyIds = Array.from(
      new Set((publishedShifts || []).map((s) => s.employee_id).filter((id): id is string => !!id))
    );
    await notifyEmployees(notifyIds, "shift_published", `Dienstplan für ${monthLabel(planMonth)} veröffentlicht`);
    setPublishWarningAck(false);
    loadAll();
  }

  async function confirmSwap(swap: PendingSwap) {
    await supabase.from("shifts").update({ employee_id: swap.offered_to }).eq("id", swap.shift_id);
    await supabase.from("shift_swap_requests").update({ status: "confirmed" }).eq("id", swap.id);
    loadAll();
  }

  async function declineSwap(swapId: string) {
    await supabase.from("shift_swap_requests").update({ status: "declined" }).eq("id", swapId);
    loadAll();
  }

  return (
    <div>
      <h2>Planung (Admin)</h2>

      <div className="card">
        <h3>Einstellungen</h3>
        <div className="field">
          <label>Abrechnungszeitraum beginnt am Tag des Monats</label>
          <div className="row-actions">
            <input
              type="number"
              min={1}
              max={28}
              style={{ width: "5rem" }}
              value={billingStartDay}
              onChange={(e) => setBillingStartDay(Number(e.target.value))}
            />
            <button
              className="ghost"
              disabled={savingSettings}
              onClick={() => saveBillingStartDay(billingStartDay)}
            >
              Speichern
            </button>
          </div>
          <p className="hint">
            Aktueller Zeitraum: {formatDayMonth(previewPeriod.start)}–{formatDayMonth(previewPeriod.end)} ·
            gilt für die "voraussichtlichen Stunden" im Kalender jedes Mitarbeiters. 1 = klassischer
            Kalendermonat.
          </p>
        </div>

        <div className="field" style={{ marginTop: "1rem" }}>
          <label>An diesen Tagen ist Service (Dienstplan)</label>
          <div className="day-toggle-row">
            {DAY_NAMES.map((name, idx) => (
              <button
                key={name}
                type="button"
                className={serviceDays.includes(idx) ? "" : "ghost"}
                onClick={() => toggleDay(serviceDays, setServiceDaysState, idx)}
              >
                {name.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginTop: "0.8rem" }}>
          <label>An diesen Tagen wird gebacken (Backplan, außerhalb Öffnungszeiten)</label>
          <div className="day-toggle-row">
            {DAY_NAMES.map((name, idx) => (
              <button
                key={name}
                type="button"
                className={bakeDays.includes(idx) ? "" : "ghost"}
                onClick={() => toggleDay(bakeDays, setBakeDaysState, idx)}
              >
                {name.slice(0, 2)}
              </button>
            ))}
          </div>
          {(serviceDays.length === 0 || bakeDays.length === 0) && (
            <p className="hint warn">Mindestens ein Tag muss jeweils ausgewählt sein.</p>
          )}
          {dayRulesDirty && serviceDays.length > 0 && bakeDays.length > 0 && (
            <p className="hint warn">Ungespeicherte Änderung — wirkt sich erst nach "Tage speichern" auf die Planung unten aus.</p>
          )}
          <button
            style={{ marginTop: "0.3rem" }}
            disabled={savingSettings || serviceDays.length === 0 || bakeDays.length === 0 || !dayRulesDirty}
            onClick={saveDayRules}
          >
            Tage speichern
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Back-Truppen</h3>
        {bakeTeams.map((t) => {
          const members = employees.filter((e) => e.bake_team_id === t.id);
          const candidates = employees.filter((e) => e.bake_team_id !== t.id);
          return (
            <div key={t.id} style={{ borderTop: "1px solid var(--border)", paddingTop: "0.7rem", marginTop: "0.7rem" }}>
              <div className="row-actions">
                <input
                  style={{ flex: 1 }}
                  defaultValue={t.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && renameBakeTeam(t.id, e.target.value.trim())}
                />
                <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => deleteBakeTeam(t.id)}>
                  ✕
                </button>
              </div>
              <div style={{ margin: "0.5rem 0 0" }}>
                {members.length === 0 && (
                  <p style={{ fontSize: "0.72rem", color: "var(--ink-soft)", margin: 0 }}>Noch keine Mitarbeiter zugeordnet.</p>
                )}
                {members.map((m) => (
                  <div className="row" key={m.id}>
                    <span className="day">{m.name}</span>
                    <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => setEmployeeTeam(m.id, null)}>
                      entfernen
                    </button>
                  </div>
                ))}
              </div>
              {candidates.length > 0 && (
                <p style={{ marginTop: "0.5rem" }}>
                  <select
                    value=""
                    onChange={(e) => e.target.value && setEmployeeTeam(e.target.value, t.id)}
                  >
                    <option value="">+ Mitarbeiter hinzufügen –</option>
                    {candidates.map((e) => {
                      const currentTeam = bakeTeams.find((bt) => bt.id === e.bake_team_id);
                      return (
                        <option key={e.id} value={e.id}>
                          {e.name}
                          {currentTeam ? ` (bisher ${currentTeam.name})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </p>
              )}
            </div>
          );
        })}
        <p className="row-actions" style={{ marginTop: "1rem" }}>
          <input
            style={{ flex: 1 }}
            placeholder="Name der neuen Truppe"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
          />
          <button className="ghost" onClick={addBakeTeam}>+ Truppe anlegen</button>
        </p>
      </div>

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

      <div className="cal-header" style={{ marginTop: "1.2rem" }}>
        <button className="ghost" onClick={() => setPlanMonth((m) => addMonths(m, -1))}>
          ‹
        </button>
        <h3 style={{ margin: 0 }}>{monthLabel(planMonth)}</h3>
        <div className="nav-btns">
          <button className="ghost" onClick={() => setPlanMonth(monthStartOf(new Date()))}>
            Heute
          </button>
          <button className="ghost" onClick={() => setPlanMonth((m) => addMonths(m, 1))}>
            ›
          </button>
        </div>
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--ink-soft)", margin: "0 0 0.8rem" }}>
        Geplant wird immer der ganze Kalendermonat (nicht der Abrechnungszeitraum oben).
      </p>
      {unassignedBakeEntries.length > 0 && publishWarningAck && (
        <div className="card card-attention">
          <p className="hint warn" style={{ margin: 0 }}>
            {unassignedBakeEntries.length} Backeintrag{unassignedBakeEntries.length > 1 ? "e" : ""} ohne zugeordnete
            Truppe. Truppe zuweisen oder trotzdem veröffentlichen?
          </p>
          <button style={{ marginTop: "0.5rem" }} onClick={() => publishMonth(true)}>
            Trotzdem veröffentlichen
          </button>{" "}
          <button className="ghost" onClick={() => setPublishWarningAck(false)}>
            Abbrechen
          </button>
        </div>
      )}
      <button
        onClick={() => {
          if (unassignedBakeEntries.length > 0) setPublishWarningAck(true);
          else publishMonth();
        }}
      >
        📣 Plan & Backplan für {monthLabel(planMonth)} veröffentlichen
      </button>

      {pendingSwaps.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3>Schichttausch-Bestätigungen</h3>
          {pendingSwaps.map((s) => (
            <div className="shift-line" key={s.id}>
              <span className="tag">
                {s.shifts ? new Date(s.shifts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
              </span>
              <span>
                {s.requested_by_employee?.name} → {s.offered_to_employee?.name}
              </span>
              <span className="row-actions">
                <button style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }} onClick={() => confirmSwap(s)}>
                  Bestätigen
                </button>
                <button
                  className="ghost"
                  style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                  onClick={() => declineSwap(s.id)}
                >
                  Ablehnen
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <h3>
        Dienstplan ({savedServiceDays.map((d) => DAY_NAMES[d].slice(0, 2)).join("/")}, {monthLabel(planMonth)})
      </h3>
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

      <h3>
        Backplan ({savedBakeDays.map((d) => DAY_NAMES[d].slice(0, 2)).join("/")}, außerhalb Öffnungszeiten,{" "}
        {monthLabel(planMonth)})
      </h3>
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
                {dayEntries.map((b) => {
                  const collisions = collisionsFor(dateStr, b.bake_team_id);
                  return (
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
                        {!b.bake_team_id && <p className="hint warn" style={{ margin: "0.2rem 0 0" }}>Keine Truppe</p>}
                        {collisions.length > 0 && (
                          <p className="hint warn" style={{ margin: "0.2rem 0 0" }}>
                            ⚠ {collisions.join(", ")} hat heute auch Service-Schicht
                          </p>
                        )}
                      </td>
                      <td>
                        <button className="ghost" style={{padding:"0.3rem 0.55rem"}} onClick={() => deleteBakeEntry(b.id)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="ghost" onClick={() => addBakeEntry(dateStr)}>+ Kuchen hinzufügen</button>
          </div>
        );
      })}
    </div>
  );
}
