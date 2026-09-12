import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Employee } from "../lib/supabase";
import { toDateStr, nextMonthStart, monthLabel, toMonthStr } from "../lib/dates";

type ShiftRow = {
  id: string;
  date: string;
  shift_type: "frueh" | "spaet";
  role_tag: "kueche" | "service" | null;
  start_time: string;
  end_time: string;
};
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

export function Home({ employee }: { employee: Employee }) {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [bakes, setBakes] = useState<BakeRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
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

    const [shiftsRes, bakesRes, submissionRes, announcementsRes] = await Promise.all([
      shiftsPromise,
      bakesPromise,
      submissionPromise,
      announcementsPromise
    ]);

    setShifts((shiftsRes.data as ShiftRow[]) || []);
    setBakes((bakesRes.data as BakeRow[]) || []);
    setNeedsAvailability(!submissionRes.data);
    setAnnouncements((announcementsRes.data as unknown as Announcement[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  async function postAnnouncement() {
    if (!newAnnouncement.trim()) return;
    await supabase.from("announcements").insert({ body: newAnnouncement.trim(), created_by: employee.id });
    setNewAnnouncement("");
    load();
  }

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
