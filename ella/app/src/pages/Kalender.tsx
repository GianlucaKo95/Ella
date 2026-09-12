import { useEffect, useMemo, useState } from "react";
import { fetchAppSettings, supabase, type Employee } from "../lib/supabase";
import { icsFeedUrl } from "../lib/ics";
import {
  DAY_NAMES,
  addMonths,
  billingPeriod,
  formatDayMonth,
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
  const [monthStart, setMonthStart] = useState(() => monthStartOf(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [billingStartDay, setBillingStartDay] = useState(1);
  const [ownPeriodShifts, setOwnPeriodShifts] = useState<Shift[]>([]);

  const grid = useMemo(() => monthGrid(monthStart), [monthStart]);
  const todayStr = toDateStr(new Date());

  useEffect(() => {
    fetchAppSettings().then((s) => setBillingStartDay(s.billing_period_start_day));
  }, []);

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
            const ownCount = dayShifts.filter((s) => s.employee_id === employee.id).length;
            const otherCount = dayShifts.length - ownCount;
            const outside = d.getMonth() !== monthStart.getMonth();
            const isToday = dateStr === todayStr;
            return (
              <button
                key={dateStr}
                className={`cal-day ${outside ? "outside" : ""} ${isToday ? "today" : ""} ${ownCount > 0 ? "own" : ""}`}
                onClick={() => setSelectedDate(dateStr)}
                style={{ border: "none" }}
              >
                <span className="cal-day-num">{d.getDate()}</span>
                <span className="cal-day-dots">
                  {ownCount > 0 && <span className="cal-dot own" />}
                  {Array.from({ length: Math.min(otherCount, 3) }).map((_, i) => (
                    <span className="cal-dot" key={i} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="cal-legend">
          <span>
            <span className="cal-dot own" /> Meine Schicht
          </span>
          <span>
            <span className="cal-dot" /> Kolleg:in
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
          {selectedShifts.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Keine Schichten an diesem Tag.</p>}
          {selectedShifts.map((s) => (
            <div className="shift-line" key={s.id}>
              <span className="tag">{s.shift_type === "frueh" ? "Früh" : "Spät"}</span>
              <span>
                {s.employee_id === employee.id ? "Ich" : s.employees?.name ?? "—"}
                {s.role_tag ? ` · ${s.role_tag}` : ""}
              </span>
              <span className="who">
                {s.start_time}–{s.end_time}
              </span>
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
