import { useEffect, useMemo, useState } from "react";
import { fetchAppSettings, supabase, type Employee } from "../lib/supabase";
import { icsFeedUrl } from "../lib/ics";
import {
  DAY_NAMES,
  addMonths,
  billingPeriod,
  formatDayMonth,
  isoDayOfWeek,
  monthGrid,
  monthLabel,
  monthStartOf,
  toDateStr
} from "../lib/dates";

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

function hoursBetween(from: string, to: string): number {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  return (th * 60 + tm - (fh * 60 + fm)) / 60;
}

export function Kalender({ employee }: { employee: Employee }) {
  const todayStr = toDateStr(new Date());
  const [monthStart, setMonthStart] = useState(() => monthStartOf(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);
  const [billingStartDay, setBillingStartDay] = useState(1);
  const [serviceDays, setServiceDays] = useState<number[]>([3, 4, 5, 6]);
  const [ownBakeDates, setOwnBakeDates] = useState<Set<string>>(new Set());
  const [ownPeriodShifts, setOwnPeriodShifts] = useState<Shift[]>([]);
  const [colleagues, setColleagues] = useState<{ id: string; name: string }[]>([]);
  const [swapPickerFor, setSwapPickerFor] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState("");
  const [swapTargetUnavailable, setSwapTargetUnavailable] = useState(false);
  const [swapRequestedShifts, setSwapRequestedShifts] = useState<Set<string>>(new Set());

  const grid = useMemo(() => monthGrid(monthStart), [monthStart]);

  useEffect(() => {
    fetchAppSettings().then((s) => {
      setBillingStartDay(s.billing_period_start_day);
      setServiceDays(s.service_days);
    });
    supabase
      .from("employees")
      .select("id,name")
      .eq("active", true)
      .neq("id", employee.id)
      .order("name")
      .then(({ data }) => setColleagues(data || []));
    supabase
      .from("shift_swap_requests")
      .select("shift_id")
      .eq("requested_by", employee.id)
      .eq("status", "pending")
      .then(({ data }) => setSwapRequestedShifts(new Set((data || []).map((r) => r.shift_id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nur ein UX-Hinweis, keine harte Sperre: prüft per serverseitiger Funktion
  // (keine Rohdaten-Einsicht in fremde Verfügbarkeiten), ob der ausgewählte
  // Kollege an dem Tag laut eigener Angabe "kann nicht" eingetragen hat.
  async function checkSwapTarget(colleagueId: string, dateStr: string, startTime: string) {
    if (!colleagueId) {
      setSwapTargetUnavailable(false);
      return;
    }
    const { data } = await supabase.rpc("is_colleague_available", {
      target_employee: colleagueId,
      check_date: dateStr,
      check_start_time: startTime
    });
    setSwapTargetUnavailable(data === false);
  }

  async function offerSwap(shiftId: string) {
    if (!swapTarget) return;
    const { error } = await supabase
      .from("shift_swap_requests")
      .insert({ shift_id: shiftId, requested_by: employee.id, offered_to: swapTarget });
    if (!error) {
      setSwapRequestedShifts((prev) => new Set(prev).add(shiftId));
      setSwapPickerFor(null);
      setSwapTarget("");
      setSwapTargetUnavailable(false);
    }
  }

  const period = useMemo(() => billingPeriod(new Date(), billingStartDay), [billingStartDay]);

  useEffect(() => {
    const rangeStart = toDateStr(grid[0]);
    const rangeEnd = toDateStr(grid[grid.length - 1]);
    supabase
      .from("shifts")
      .select("id,date,shift_type,role_tag,start_time,end_time,employee_id,employees(name)")
      .eq("status", "published")
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("start_time")
      .then(({ data }) => setShifts((data as unknown as Shift[]) || []));

    if (employee.bake_team_id) {
      supabase
        .from("bake_plan_entries")
        .select("date")
        .eq("bake_team_id", employee.bake_team_id)
        .eq("status", "published")
        .gte("date", rangeStart)
        .lte("date", rangeEnd)
        .then(({ data }) => setOwnBakeDates(new Set((data || []).map((b) => b.date))));
    } else {
      setOwnBakeDates(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart]);

  // Eigene Stunden/Schichten im aktuellen Abrechnungszeitraum (admin-
  // einstellbarer Zeitraum, unabhängig vom gerade angezeigten Monat im Grid).
  useEffect(() => {
    supabase
      .from("shifts")
      .select("id,date,shift_type,role_tag,start_time,end_time,employee_id,employees(name)")
      .eq("status", "published")
      .eq("employee_id", employee.id)
      .gte("date", toDateStr(period.start))
      .lte("date", toDateStr(period.end))
      .then(({ data }) => setOwnPeriodShifts((data as unknown as Shift[]) || []));
  }, [period, employee.id]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return map;
  }, [shifts]);

  const projectedHours = useMemo(
    () => ownPeriodShifts.reduce((total, s) => total + hoursBetween(s.start_time, s.end_time), 0),
    [ownPeriodShifts]
  );
  const ownShiftCount = ownPeriodShifts.length;

  const selectedShifts = selectedDate ? shiftsByDate.get(selectedDate) ?? [] : [];
  const selectedDateClosed = selectedDate ? !serviceDays.includes(isoDayOfWeek(new Date(selectedDate))) : false;

  return (
    <div>
      <h2>Kalender</h2>

      <div className="stat-row">
        <div className="stat">
          <span className="n">{projectedHours % 1 === 0 ? projectedHours : projectedHours.toFixed(1)}</span>
          <span className="l">Std. voraussichtlich</span>
        </div>
        <div className="stat">
          <span className="n">{ownShiftCount}</span>
          <span className="l">Eigene Schichten</span>
        </div>
      </div>
      <p style={{ margin: "-0.6rem 0 1rem", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
        Abrechnungszeitraum: {formatDayMonth(period.start)}–{formatDayMonth(period.end)}
      </p>

      <div className="card">
        <div className="cal-header">
          <button className="ghost" onClick={() => setMonthStart((m) => addMonths(m, -1))}>
            ‹
          </button>
          <h3>{monthLabel(monthStart)}</h3>
          <div className="nav-btns">
            <button className="ghost" onClick={() => setMonthStart(monthStartOf(new Date()))}>
              Heute
            </button>
            <button className="ghost" onClick={() => setMonthStart((m) => addMonths(m, 1))}>
              ›
            </button>
          </div>
        </div>

        <div className="cal-weekdays">
          {DAY_NAMES.map((d) => (
            <span key={d}>{d.slice(0, 2)}</span>
          ))}
        </div>

        <div className="cal-grid">
          {grid.map((d) => {
            const dateStr = toDateStr(d);
            const dayShifts = shiftsByDate.get(dateStr) ?? [];
            const ownShift = dayShifts.find((s) => s.employee_id === employee.id);
            const otherCount = dayShifts.length - (ownShift ? 1 : 0);
            const outside = d.getMonth() !== monthStart.getMonth();
            const isToday = dateStr === todayStr;
            const closed = !serviceDays.includes(isoDayOfWeek(d));
            const hasBake = ownBakeDates.has(dateStr);
            return (
              <button
                key={dateStr}
                className={`cal-day ${outside ? "outside" : ""} ${isToday ? "today" : ""} ${ownShift ? "own" : ""} ${closed ? "closed" : ""}`}
                onClick={() => setSelectedDate(dateStr)}
                style={{ border: "none" }}
              >
                <span className="cal-day-num">{d.getDate()}</span>
                {!closed && (
                  <span className="cal-day-dots">
                    {ownShift && <span className={`cal-dot own ${ownShift.shift_type}`} />}
                    {hasBake && <span className="cal-dot bake" />}
                    {otherCount > 3 ? (
                      <span className="cal-day-more">+{otherCount}</span>
                    ) : (
                      Array.from({ length: otherCount }).map((_, i) => <span className="cal-dot" key={i} />)
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="cal-legend">
          <span>
            <span className="cal-dot own frueh" /> Früh (eigen)
          </span>
          <span>
            <span className="cal-dot own spaet" /> Spät (eigen)
          </span>
          <span>
            <span className="cal-dot" /> Kolleg:in
          </span>
          <span>
            <span className="cal-dot bake" /> Backtermin
          </span>
        </div>
      </div>

      {selectedDate && (
        <div className="card">
          <h3>
            {new Date(selectedDate).toLocaleDateString("de-DE", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit"
            })}
          </h3>
          {selectedShifts.length === 0 && (
            <p style={{ color: "var(--ink-soft)" }}>
              {selectedDateClosed ? "Café geschlossen an diesem Tag." : "Keine Schichten an diesem Tag."}
            </p>
          )}
          {selectedShifts.map((s) => (
            <div key={s.id}>
              <div className="shift-line">
                <span className="tag">{s.shift_type === "frueh" ? "Früh" : "Spät"}</span>
                <span>
                  {s.employee_id === employee.id ? "Ich" : s.employees?.name ?? "—"}
                  {s.role_tag ? ` · ${s.role_tag}` : ""}
                </span>
                <span className="who">
                  {s.start_time}–{s.end_time}
                </span>
              </div>
              {s.employee_id === employee.id && (
                <>
                  {swapRequestedShifts.has(s.id) ? (
                    <p className="hint" style={{ margin: "0 0 0.6rem" }}>
                      Tauschanfrage gestellt – wartet auf Antwort.
                    </p>
                  ) : swapPickerFor === s.id ? (
                    <div style={{ margin: "0 0 0.6rem" }}>
                      <div className="row-actions">
                        <select
                          style={{ flex: 1 }}
                          value={swapTarget}
                          onChange={(e) => {
                            setSwapTarget(e.target.value);
                            checkSwapTarget(e.target.value, s.date, s.start_time);
                          }}
                        >
                          <option value="">Kolleg:in wählen…</option>
                          {colleagues.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          style={{ fontSize: "0.68rem", padding: "0.35rem 0.6rem" }}
                          disabled={!swapTarget}
                          onClick={() => offerSwap(s.id)}
                        >
                          Anbieten
                        </button>
                        <button
                          className="ghost"
                          style={{ fontSize: "0.68rem", padding: "0.35rem 0.6rem" }}
                          onClick={() => {
                            setSwapPickerFor(null);
                            setSwapTargetUnavailable(false);
                          }}
                        >
                          Abbrechen
                        </button>
                      </div>
                      {swapTargetUnavailable && (
                        <p className="hint warn" style={{ margin: "0.3rem 0 0" }}>
                          ⚠ Laut eigener Angabe an diesem Tag nicht verfügbar — trotzdem anbieten möglich.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p style={{ margin: "0 0 0.6rem" }}>
                      <button className="ghost" style={{ fontSize: "0.68rem", padding: "0.35rem 0.6rem" }} onClick={() => setSwapPickerFor(s.id)}>
                        Tauschen
                      </button>
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ textAlign: "center" }}>
        <a href={icsFeedUrl(employee.id)} style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
          📅 Meinen Kalender abonnieren (ICS)
        </a>
      </p>
    </div>
  );
}
