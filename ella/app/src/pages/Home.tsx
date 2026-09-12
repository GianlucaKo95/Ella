import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, notifyEmployees, type Employee } from "../lib/supabase";
import { toDateStr, nextMonthStart, monthLabel, toMonthStr } from "../lib/dates";

type ShiftRow = {
  id: string;
  date: string;
  shift_type: "frueh" | "spaet";
  role_tag: "kueche" | "service" | null;
  start_time: string;
  end_time: string;
};
type TodayShiftRow = ShiftRow & { employee_id: string; employees: { name: string } | null };
type BakeRow = {
  id: string;
  date: string;
  quantity: number;
  cake_items: { name: string; default_unit: string } | null;
};
type Announcement = {
  id: string;
  body: string;
  created_at: string;
  employees: { name: string } | null;
};
type SwapRow = {
  id: string;
  status: "pending" | "accepted" | "declined" | "confirmed" | "cancelled";
  created_at: string;
  responded_at: string | null;
  shifts: { date: string; shift_type: "frueh" | "spaet" } | null;
  requested_by_employee: { name: string } | null;
  offered_to_employee: { name: string } | null;
};

export function Home({ employee }: { employee: Employee }) {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [todayShifts, setTodayShifts] = useState<TodayShiftRow[]>([]);
  const [bakes, setBakes] = useState<BakeRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [incomingSwaps, setIncomingSwaps] = useState<SwapRow[]>([]);
  const [outgoingSwaps, setOutgoingSwaps] = useState<SwapRow[]>([]);
  const [needsAvailability, setNeedsAvailability] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState("");

  const today = toDateStr(new Date());
  const nextMonth = nextMonthStart(new Date());
  const nextMonthStr = toMonthStr(nextMonth);

  async function load() {
    const shiftsPromise = supabase
      .from("shifts")
      .select("id,date,shift_type,role_tag,start_time,end_time")
      .eq("employee_id", employee.id)
      .eq("status", "published")
      .gte("date", today)
      .order("date")
      .limit(5);

    const todayShiftsPromise = supabase
      .from("shifts")
      .select("id,date,shift_type,role_tag,start_time,end_time,employee_id,employees(name)")
      .eq("date", today)
      .eq("status", "published")
      .order("start_time");

    const bakesPromise = employee.bake_team_id
      ? supabase
          .from("bake_plan_entries")
          .select("id,date,quantity,cake_items(name,default_unit)")
          .eq("bake_team_id", employee.bake_team_id)
          .eq("status", "published")
          .gte("date", today)
          .order("date")
          .limit(3)
      : Promise.resolve({ data: [] as unknown } as any);

    const submissionPromise = supabase
      .from("availability_submissions")
      .select("id")
      .eq("employee_id", employee.id)
      .eq("month", nextMonthStr)
      .maybeSingle();

    const announcementsPromise = supabase
      .from("announcements")
      .select("id,body,created_at,employees(name)")
      .order("created_at", { ascending: false })
      .limit(10);

    const incomingSwapsPromise = supabase
      .from("shift_swap_requests")
      .select(
        "id,status,created_at,responded_at,shifts(date,shift_type),requested_by_employee:requested_by(name),offered_to_employee:offered_to(name)"
      )
      .eq("offered_to", employee.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const outgoingSwapsPromise = supabase
      .from("shift_swap_requests")
      .select(
        "id,status,created_at,responded_at,shifts(date,shift_type),requested_by_employee:requested_by(name),offered_to_employee:offered_to(name)"
      )
      .eq("requested_by", employee.id)
      .in("status", ["pending", "accepted", "declined"])
      .order("created_at", { ascending: false })
      .limit(10);

    const [shiftsRes, todayShiftsRes, bakesRes, submissionRes, announcementsRes, incomingSwapsRes, outgoingSwapsRes] =
      await Promise.all([
        shiftsPromise,
        todayShiftsPromise,
        bakesPromise,
        submissionPromise,
        announcementsPromise,
        incomingSwapsPromise,
        outgoingSwapsPromise
      ]);

    setShifts((shiftsRes.data as ShiftRow[]) || []);
    setTodayShifts((todayShiftsRes.data as unknown as TodayShiftRow[]) || []);
    setBakes((bakesRes.data as BakeRow[]) || []);
    setNeedsAvailability(!submissionRes.data);
    setAnnouncements((announcementsRes.data as unknown as Announcement[]) || []);
    setIncomingSwaps((incomingSwapsRes.data as unknown as SwapRow[]) || []);
    setOutgoingSwaps((outgoingSwapsRes.data as unknown as SwapRow[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  async function postAnnouncement() {
    if (!newAnnouncement.trim()) return;
    const body = newAnnouncement.trim();
    await supabase.from("announcements").insert({ body, created_by: employee.id });
    const { data: others } = await supabase.from("employees").select("id").eq("active", true).neq("id", employee.id);
    await notifyEmployees((others || []).map((e) => e.id), "announcement", body);
    setNewAnnouncement("");
    load();
  }

  async function respondToSwap(swapId: string, accept: boolean) {
    await supabase
      .from("shift_swap_requests")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("id", swapId);
    load();
  }

  function swapLabel(s: SwapRow) {
    if (!s.shifts) return "";
    const d = new Date(s.shifts.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    return `${d} · ${s.shifts.shift_type === "frueh" ? "Früh" : "Spät"}`;
  }

  const swapStatusLabel: Record<SwapRow["status"], string> = {
    pending: "offen",
    accepted: "angenommen – wartet auf Admin",
    declined: "abgelehnt",
    confirmed: "bestätigt",
    cancelled: "zurückgezogen"
  };

  return (
    <div>
      <h2>Hallo {employee.name.split(" ")[0]} 👋</h2>

      {needsAvailability && !dismissed && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(44,35,26,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem"
          }}
        >
          <div className="card card-attention" style={{ maxWidth: 360, margin: 0 }}>
            <h3>Verfügbarkeit für {monthLabel(nextMonth)} fehlt noch</h3>
            <p style={{ color: "var(--ink-soft)" }}>
              Bitte trag deine Verfügbarkeit für den kommenden Monat im Profil ein und reiche sie ein.
            </p>
            <div className="row-actions" style={{ marginTop: "0.5rem" }}>
              <button onClick={() => navigate("/profil")}>Jetzt eintragen</button>
              <button className="ghost" onClick={() => setDismissed(true)}>
                Später
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Heute im Dienst</h3>
        {todayShifts.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Heute ist niemand eingeteilt.</p>}
        {todayShifts.map((s) => (
          <div className="shift-line" key={s.id}>
            <span className="tag">{s.shift_type === "frueh" ? "Früh" : "Spät"}</span>
            <span>
              {s.employees?.name ?? "–"}
              {s.role_tag ? ` · ${s.role_tag}` : ""}
            </span>
            <span className="who">
              {s.start_time}–{s.end_time}
            </span>
          </div>
        ))}
      </div>

      {(incomingSwaps.length > 0 || outgoingSwaps.length > 0) && (
        <div className="card">
          <h3>Schichttausch</h3>
          {incomingSwaps.map((s) => (
            <div className="shift-line" key={s.id}>
              <span className="tag">{swapLabel(s)}</span>
              <span>{s.requested_by_employee?.name} bietet dir diese Schicht an</span>
              <span className="row-actions">
                <button style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }} onClick={() => respondToSwap(s.id, true)}>
                  Annehmen
                </button>
                <button
                  className="ghost"
                  style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                  onClick={() => respondToSwap(s.id, false)}
                >
                  Ablehnen
                </button>
              </span>
            </div>
          ))}
          {outgoingSwaps.map((s) => (
            <div className="shift-line" key={s.id}>
              <span className="tag">{swapLabel(s)}</span>
              <span>Angeboten an {s.offered_to_employee?.name}</span>
              <span className="who">{swapStatusLabel[s.status]}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Anstehende Schichten</h3>
        {shifts.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Keine anstehenden Schichten.</p>}
        {shifts.map((s) => (
          <div className="shift-line" key={s.id}>
            <span className="tag">
              {new Date(s.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
            </span>
            <span>
              {s.shift_type === "frueh" ? "Früh" : "Spät"}
              {s.role_tag ? ` · ${s.role_tag}` : ""}
            </span>
            <span className="who">
              {s.start_time}–{s.end_time}
            </span>
          </div>
        ))}
      </div>

      {employee.bake_team_id && (
        <div className="card">
          <h3>Nächste Backschicht</h3>
          {bakes.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Keine anstehenden Backtermine.</p>}
          {bakes.map((b) => (
            <div className="shift-line" key={b.id}>
              <span className="tag">
                {new Date(b.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
              </span>
              <span>{b.cake_items?.name}</span>
              <span className="who">
                {b.quantity} {b.cake_items?.default_unit}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Aktuelles</h3>
        {employee.role === "admin" && (
          <div className="row-actions" style={{ marginBottom: "0.75rem" }}>
            <input
              style={{ flex: 1 }}
              placeholder="Neue Ankündigung…"
              value={newAnnouncement}
              onChange={(e) => setNewAnnouncement(e.target.value)}
            />
            <button onClick={postAnnouncement}>Teilen</button>
          </div>
        )}
        {announcements.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Noch keine Neuigkeiten.</p>}
        {announcements.map((a) => (
          <div key={a.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
            <p style={{ margin: 0 }}>{a.body}</p>
            <span style={{ fontSize: "0.68rem", color: "var(--ink-soft)" }}>
              {a.employees?.name ?? "Admin"} ·{" "}
              {new Date(a.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
