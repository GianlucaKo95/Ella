import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, notifyEmployees, notifyAdmins, uploadAnnouncementImage, type Employee } from "../lib/supabase";
import { toDateStr, addDays, addMonths, monthLabel, monthStartOf, parseDateStr, toMonthStr } from "../lib/dates";
import { Avatar } from "../components/Avatar";

type ShiftRow = {
  id: string;
  date: string;
  shift_type: "frueh" | "spaet";
  role_tag: "kueche" | "service" | null;
  start_time: string;
  end_time: string;
};
type TodayShiftRow = ShiftRow & {
  employee_id: string | null;
  employees: { name: string; avatar_url: string | null } | null;
};
type BakeRow = {
  id: string;
  date: string;
  quantity: number;
  note: string | null;
  cake_items: { name: string; default_unit: string } | null;
};
type Announcement = {
  id: string;
  body: string;
  image_url: string | null;
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
// Feedback: "Können wir das, sollten Einträge dort vorhanden sein, und
// genau so mit Tauschanfrage als Kachel im Home Screen implementieren for
// Admins?" — dieselben zwei Admin-Planung-Karten ("Schichttausch-
// Bestätigungen", "Offene Schichten – Freiwillige") zusätzlich direkt auf
// Home, damit der Admin nicht extra in die Planung wechseln muss, um offene
// Vorgänge zu bemerken. Gleiche Typen/Logik wie in AdminPlanning.tsx.
type AdminPendingSwap = {
  id: string;
  shift_id: string;
  offered_to: string;
  requested_by_employee: { name: string } | null;
  offered_to_employee: { name: string } | null;
  shifts: { date: string; shift_type: "frueh" | "spaet" } | null;
};
type AdminPendingClaim = {
  id: string;
  shift_id: string;
  employee_id: string;
  claimant: { name: string } | null;
  shifts: { date: string; shift_type: "frueh" | "spaet" } | null;
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
  const [availabilityTargetMonth, setAvailabilityTargetMonth] = useState<Date | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [newAnnouncementImage, setNewAnnouncementImage] = useState<File | null>(null);
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const announcementImageInputRef = useRef<HTMLInputElement>(null);
  const [colleagues, setColleagues] = useState<{ id: string; name: string }[]>([]);
  const [swapRequestedShiftIds, setSwapRequestedShiftIds] = useState<Set<string>>(new Set());
  const [weekSwapPickerFor, setWeekSwapPickerFor] = useState<string | null>(null);
  const [weekSwapTarget, setWeekSwapTarget] = useState("");
  // Feedback: "Momentan werden mir beim Tauschvorschlag alle angezeigt und
  // nicht nur die die 'Kann' für diesen Tag und Schicht angeklickt haben" —
  // ersetzt die vorherige "alle anzeigen + nach Auswahl dezent warnen"-Logik
  // (is_colleague_available) durch eine echte Eingrenzung der Auswahl selbst
  // (colleagues_available_for, Migration 0033, s. Kalender.tsx).
  const [availableWeekSwapColleagues, setAvailableWeekSwapColleagues] = useState<{ id: string; name: string }[]>([]);
  const [weekSwapColleaguesLoading, setWeekSwapColleaguesLoading] = useState(false);
  const [sickReportFor, setSickReportFor] = useState<string | null>(null);
  const [sickReason, setSickReason] = useState("");
  const [sickSubmitting, setSickSubmitting] = useState(false);
  // Feedback: "Der ich kann übernehmen Button soll auch zusätzlich hier
  // direkt im Dashboard zu sehen sein wenn es um die Schicht heute geht" —
  // dieselbe shift_claims-Logik wie in Kalender.tsx, hier nur für die
  // "Heute im Dienst"-Liste statt den vollen Kalender.
  const [myPendingClaims, setMyPendingClaims] = useState<Set<string>>(new Set());
  const [claimSubmitting, setClaimSubmitting] = useState<string | null>(null);
  const [adminPendingSwaps, setAdminPendingSwaps] = useState<AdminPendingSwap[]>([]);
  const [adminPendingClaims, setAdminPendingClaims] = useState<AdminPendingClaim[]>([]);

  const today = toDateStr(new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(new Date(), i)));

  async function load() {
    const shiftsPromise = supabase
      .from("shifts")
      .select("id,date,shift_type,role_tag,start_time,end_time")
      .eq("employee_id", employee.id)
      .eq("status", "published")
      .gte("date", weekDays[0])
      .lte("date", weekDays[6])
      .order("date");

    const colleaguesPromise = supabase.from("employees").select("id,name").eq("active", true).neq("id", employee.id).order("name");

    const pendingSwapShiftIdsPromise = supabase
      .from("shift_swap_requests")
      .select("shift_id")
      .eq("requested_by", employee.id)
      .eq("status", "pending");

    const myPendingClaimsPromise = supabase
      .from("shift_claims")
      .select("shift_id")
      .eq("employee_id", employee.id)
      .eq("status", "pending");

    // Admin-only: nur für Admins abgefragt, da RLS anderen Rollen ohnehin nur
    // eigene Zeilen zeigen würde ("eigene oder Admin") — für eine
    // Mitarbeiter-Session wäre das Ergebnis hier also irreführend (z. B. nur
    // die eigene gerade bestätigte Tauschanfrage statt aller).
    const adminPendingSwapsPromise =
      employee.role === "admin"
        ? supabase
            .from("shift_swap_requests")
            .select(
              "id,shift_id,offered_to,shifts(date,shift_type),requested_by_employee:requested_by(name),offered_to_employee:offered_to(name)"
            )
            .eq("status", "accepted")
        : Promise.resolve({ data: [] as unknown } as { data: unknown[] });
    const adminPendingClaimsPromise =
      employee.role === "admin"
        ? supabase
            .from("shift_claims")
            .select("id,shift_id,employee_id,shifts(date,shift_type),claimant:employee_id(name)")
            .eq("status", "pending")
        : Promise.resolve({ data: [] as unknown } as { data: unknown[] });

    const todayShiftsPromise = supabase
      .from("shifts")
      // `employees!employee_id(...)`: `shifts` hat mit `employee_id` und
      // `created_by` zwei Fremdschlüssel auf `employees`, der Spalten-Hint
      // löst die sonst mehrdeutige Einbettung auf (siehe Kalender.tsx).
      .select("id,date,shift_type,role_tag,start_time,end_time,employee_id,employees!employee_id(name,avatar_url)")
      .eq("date", today)
      .eq("status", "published")
      .order("start_time");

    const bakesPromise = employee.bake_team_id
      ? supabase
          .from("bake_plan_entries")
          .select("id,date,quantity,note,cake_items(name,default_unit)")
          .eq("bake_team_id", employee.bake_team_id)
          .eq("status", "published")
          .gte("date", today)
          .order("date")
          .limit(3)
      : Promise.resolve({ data: [] as unknown } as any);

    // Feedback: "ab Freigabe Schichtplan sollte es den MA möglich sein ihre
    // Verfügbarkeiten für den nächsten Monat einzugeben ... Es soll
    // unabhängig davon sein ob es eine offene Schicht im nächsten Monat gibt
    // oder nicht. Sobald der Schichtplan für bspw. Oktober veröffentlicht
    // ist, sollen die MA ihre Zeiten für November eintragen können." — der
    // einreichbare Monat ist deshalb nicht mehr "heute + 1 Monat", sondern
    // immer der Monat direkt nach dem zuletzt tatsächlich veröffentlichten
    // (s. Verfuegbarkeit.tsx, dieselbe Berechnung). Plant der Admin schon
    // einen Monat im Voraus, rückt die Erinnerungskarte hier entsprechend
    // gleich mit nach, statt weiterhin einen bereits veröffentlichten Monat
    // zu verlangen.
    const latestPublishedPromise = supabase.from("shifts").select("date").eq("status", "published").order("date", { ascending: false }).limit(1);

    const announcementsPromise = supabase
      .from("announcements")
      .select("id,body,image_url,created_at,employees(name)")
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

    const [
      shiftsRes,
      todayShiftsRes,
      bakesRes,
      latestPublishedRes,
      announcementsRes,
      incomingSwapsRes,
      outgoingSwapsRes,
      colleaguesRes,
      pendingSwapShiftIdsRes,
      myPendingClaimsRes,
      adminPendingSwapsRes,
      adminPendingClaimsRes
    ] = await Promise.all([
      shiftsPromise,
      todayShiftsPromise,
      bakesPromise,
      latestPublishedPromise,
      announcementsPromise,
      incomingSwapsPromise,
      outgoingSwapsPromise,
      colleaguesPromise,
      pendingSwapShiftIdsPromise,
      myPendingClaimsPromise,
      adminPendingSwapsPromise,
      adminPendingClaimsPromise
    ]);

    setShifts((shiftsRes.data as ShiftRow[]) || []);
    setTodayShifts((todayShiftsRes.data as unknown as TodayShiftRow[]) || []);
    setBakes((bakesRes.data as BakeRow[]) || []);

    const latestPublishedDate = (latestPublishedRes.data as { date: string }[] | null)?.[0]?.date ?? null;
    const targetMonth = latestPublishedDate ? addMonths(monthStartOf(parseDateStr(latestPublishedDate)), 1) : null;
    setAvailabilityTargetMonth(targetMonth);
    // Admins müssen keine Verfügbarkeit abgeben (§9/§11) — für sie soll die
    // Erinnerung nie aufpoppen. Ebenso kein Aufpoppen, solange noch nie
    // irgendein Monat veröffentlicht wurde (s. o.).
    if (targetMonth && employee.role !== "admin") {
      const { data: submission } = await supabase
        .from("availability_submissions")
        .select("id")
        .eq("employee_id", employee.id)
        .eq("month", toMonthStr(targetMonth))
        .maybeSingle();
      setNeedsAvailability(!submission);
    } else {
      setNeedsAvailability(false);
    }
    setAnnouncements((announcementsRes.data as unknown as Announcement[]) || []);
    setIncomingSwaps((incomingSwapsRes.data as unknown as SwapRow[]) || []);
    setOutgoingSwaps((outgoingSwapsRes.data as unknown as SwapRow[]) || []);
    setColleagues(colleaguesRes.data || []);
    setSwapRequestedShiftIds(new Set((pendingSwapShiftIdsRes.data || []).map((r) => r.shift_id)));
    setMyPendingClaims(new Set((myPendingClaimsRes.data || []).map((r) => r.shift_id)));
    setAdminPendingSwaps((adminPendingSwapsRes.data as unknown as AdminPendingSwap[]) || []);
    setAdminPendingClaims((adminPendingClaimsRes.data as unknown as AdminPendingClaim[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  async function postAnnouncement() {
    if (!newAnnouncement.trim()) return;
    setPostingAnnouncement(true);
    const body = newAnnouncement.trim();
    let image_url: string | null = null;
    if (newAnnouncementImage) {
      const uploaded = await uploadAnnouncementImage(newAnnouncementImage);
      image_url = uploaded.url;
    }
    await supabase.from("announcements").insert({ body, image_url, created_by: employee.id });
    const { data: others } = await supabase.from("employees").select("id").eq("active", true).neq("id", employee.id);
    await notifyEmployees((others || []).map((e) => e.id), "announcement", body);
    setNewAnnouncement("");
    setNewAnnouncementImage(null);
    setPostingAnnouncement(false);
    load();
  }

  async function respondToSwap(swapId: string, accept: boolean) {
    const swap = incomingSwaps.find((s) => s.id === swapId);
    await supabase
      .from("shift_swap_requests")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("id", swapId);
    // Erst ab "angenommen" braucht der Admin tatsächlich etwas zu tun (finale
    // Bestätigung, siehe "Schichttausch-Bestätigungen" in der Admin-Planung) —
    // eine Ablehnung braucht keine Push, die sieht nur die anbietende Person selbst.
    if (accept && swap) {
      await notifyAdmins(
        "swap_accepted",
        `${employee.name} übernimmt die Schicht von ${swap.requested_by_employee?.name ?? "?"} (${swapLabel(swap)}) — wartet auf Bestätigung`
      );
    }
    load();
  }

  function shiftLabel(date: string, shiftType: "frueh" | "spaet") {
    const d = new Date(date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    return `${d} · ${shiftType === "frueh" ? "Früh" : "Spät"}`;
  }

  function swapLabel(s: SwapRow) {
    if (!s.shifts) return "";
    return shiftLabel(s.shifts.date, s.shifts.shift_type);
  }

  const swapStatusLabel: Record<SwapRow["status"], string> = {
    pending: "offen",
    accepted: "angenommen – wartet auf Admin",
    declined: "abgelehnt",
    confirmed: "bestätigt",
    cancelled: "zurückgezogen"
  };

  // Feedback: "muss nur noch abgeglichen werden, welcher Kollege/in zu der
  // Zeit schon eingetragen ist und deshalb ja auch nicht kann" (Migration
  // 0034) — colleagues_available_for() schließt jetzt zusätzlich Personen
  // aus, die an dem Tag bereits eine zeitlich überlappende Schicht haben.
  async function openWeekSwapPicker(shiftId: string, dateStr: string, startTime: string, endTime: string) {
    setWeekSwapPickerFor(shiftId);
    setWeekSwapTarget("");
    setWeekSwapColleaguesLoading(true);
    const { data } = await supabase.rpc("colleagues_available_for", {
      check_date: dateStr,
      check_start_time: startTime,
      check_end_time: endTime
    });
    const availableIds = new Set((data || []).map((r: { employee_id: string }) => r.employee_id));
    setAvailableWeekSwapColleagues(colleagues.filter((c) => availableIds.has(c.id)));
    setWeekSwapColleaguesLoading(false);
  }

  async function offerWeekSwap(shiftId: string) {
    if (!weekSwapTarget) return;
    const { error } = await supabase
      .from("shift_swap_requests")
      .insert({ shift_id: shiftId, requested_by: employee.id, offered_to: weekSwapTarget });
    if (!error) {
      setSwapRequestedShiftIds((prev) => new Set(prev).add(shiftId));
      setWeekSwapPickerFor(null);
      setWeekSwapTarget("");
    }
  }

  async function reportSickness(shiftId: string, date: string, shiftType: "frueh" | "spaet") {
    const reason = sickReason.trim();
    if (!reason) return;
    setSickSubmitting(true);
    const { error } = await supabase.rpc("report_shift_absence", { target_shift_id: shiftId, reason });
    if (!error) {
      // Feedback: "sollen alle und nicht nur die Admin Rolle eine Push
      // Benachrichtigung bekommen. Die Schicht wird dann ja als leer
      // angezeigt. Dort soll dann ein Button hin..." — Link springt direkt
      // zum Tag im Kalender, wo der "Ich kann übernehmen"-Button sitzt.
      await notifyAdmins(
        "shift_cancelled",
        `${employee.name} hat eine Schicht abgesagt (${shiftLabel(date, shiftType)}): ${reason}`,
        `/kalender?date=${date}`
      );
      setSickReportFor(null);
      setSickReason("");
      load();
    }
    setSickSubmitting(false);
  }

  // Feedback: "Der ich kann übernehmen Button soll auch zusätzlich hier
  // direkt im Dashboard zu sehen sein wenn es um die Schicht heute geht" —
  // gleicher Ablauf wie claimShift() in Kalender.tsx (Migration 0035,
  // shift_claims): Meldung legt nur einen Vorschlag an, der Admin bestätigt
  // die Übernahme final.
  async function claimShift(shift: TodayShiftRow) {
    setClaimSubmitting(shift.id);
    const { error } = await supabase.from("shift_claims").insert({ shift_id: shift.id, employee_id: employee.id });
    if (!error) {
      setMyPendingClaims((prev) => new Set(prev).add(shift.id));
      await notifyAdmins(
        "shift_claim_submitted",
        `${employee.name} kann die offene Schicht übernehmen (${shiftLabel(shift.date, shift.shift_type)})`
      );
    } else {
      alert(`Konnte nicht gemeldet werden: ${error.message}`);
    }
    setClaimSubmitting(null);
  }

  // Admin-only: gleiche Logik wie confirmSwap()/declineSwap() in
  // AdminPlanning.tsx, hier für die Kachel auf Home. Nur diese Stelle und
  // die in AdminPlanning.tsx schreiben ins Schichttausch-Protokoll.
  async function confirmSwap(swap: AdminPendingSwap) {
    await supabase.from("shifts").update({ employee_id: swap.offered_to }).eq("id", swap.shift_id);
    await supabase.from("shift_swap_requests").update({ status: "confirmed" }).eq("id", swap.id);
    if (swap.shifts) {
      await supabase.from("shift_swap_log").insert({
        shift_id: swap.shift_id,
        date: swap.shifts.date,
        change_summary: `${swap.requested_by_employee?.name ?? "?"} → ${swap.offered_to_employee?.name ?? "?"} (${
          swap.shifts.shift_type === "frueh" ? "Früh" : "Spät"
        })`
      });
    }
    load();
  }

  async function declineSwap(swapId: string) {
    await supabase.from("shift_swap_requests").update({ status: "declined" }).eq("id", swapId);
    load();
  }

  // Admin-only: gleiche Logik wie confirmClaim()/declineClaim() in
  // AdminPlanning.tsx.
  async function confirmClaim(claim: AdminPendingClaim) {
    await supabase.from("shifts").update({ employee_id: claim.employee_id }).eq("id", claim.shift_id);
    await supabase
      .from("shift_claims")
      .update({ status: "confirmed", responded_at: new Date().toISOString() })
      .eq("id", claim.id);
    await supabase
      .from("shift_claims")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("shift_id", claim.shift_id)
      .eq("status", "pending");
    load();
  }

  async function declineClaim(claimId: string) {
    await supabase
      .from("shift_claims")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", claimId);
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
            <h3>Verfügbarkeit für {availabilityTargetMonth ? monthLabel(availabilityTargetMonth) : "den nächsten Monat"} fehlt noch</h3>
            <p style={{ color: "var(--ink-soft)" }}>
              Bitte trag deine Verfügbarkeit für den kommenden Monat ein und reiche sie ein.
            </p>
            <div className="row-actions" style={{ marginTop: "0.5rem" }}>
              <button onClick={() => navigate("/verfuegbarkeit")}>Jetzt eintragen</button>
              <button className="ghost" onClick={() => setDismissed(true)}>
                Später
              </button>
            </div>
          </div>
        </div>
      )}

      {adminPendingSwaps.length > 0 && (
        <div className="card">
          <h3>Schichttausch-Bestätigungen</h3>
          {adminPendingSwaps.map((s) => (
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

      {adminPendingClaims.length > 0 && (
        <div className="card">
          <h3>Offene Schichten – Freiwillige</h3>
          {adminPendingClaims.map((c) => (
            <div className="shift-line" key={c.id}>
              <span className="tag">
                {c.shifts ? new Date(c.shifts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
              </span>
              <span>
                {c.claimant?.name ?? "?"} kann übernehmen
                {c.shifts ? ` (${c.shifts.shift_type === "frueh" ? "Früh" : "Spät"})` : ""}
              </span>
              <span className="row-actions">
                <button style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }} onClick={() => confirmClaim(c)}>
                  Bestätigen
                </button>
                <button
                  className="ghost"
                  style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                  onClick={() => declineClaim(c.id)}
                >
                  Ablehnen
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Heute im Dienst</h3>
        {todayShifts.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Heute ist niemand eingeteilt.</p>}
        {todayShifts.map((s) => (
          <div key={s.id}>
            <div className="shift-line">
              <span className="tag">{s.shift_type === "frueh" ? "Früh" : "Spät"}</span>
              <Avatar name={s.employees?.name ?? "?"} avatarUrl={s.employees?.avatar_url} size={28} />
              <span>
                {s.employee_id === null ? "Offen" : s.employees?.name ?? "–"}
                {s.role_tag ? ` · ${s.role_tag}` : ""}
              </span>
              <span className="who">
                {s.start_time}–{s.end_time}
              </span>
            </div>
            {s.employee_id === null && (
              <p style={{ margin: "0 0 0.6rem" }}>
                {myPendingClaims.has(s.id) ? (
                  <span className="hint">Du hast dich gemeldet – wartet auf Bestätigung.</span>
                ) : (
                  <button
                    className="ghost"
                    style={{ fontSize: "0.68rem", padding: "0.35rem 0.6rem" }}
                    disabled={claimSubmitting === s.id}
                    onClick={() => claimShift(s)}
                  >
                    {claimSubmitting === s.id ? "Melde…" : "Ich kann übernehmen"}
                  </button>
                )}
              </p>
            )}
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
        <h3>Meine Woche</h3>
        {weekDays.map((d) => {
          const dayShifts = shifts.filter((s) => s.date === d);
          return (
            <div key={d}>
              {dayShifts.length === 0 ? (
                <div className="shift-line">
                  <span className="tag">
                    {new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </span>
                  <span style={{ color: "var(--ink-soft)" }}>frei</span>
                  <span className="who" />
                </div>
              ) : (
                dayShifts.map((s) => (
                  <div key={s.id}>
                    <div className="shift-line">
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
                    {swapRequestedShiftIds.has(s.id) ? (
                      <p className="hint" style={{ margin: "0 0 0.5rem" }}>
                        Tauschanfrage gestellt – wartet auf Antwort.
                      </p>
                    ) : weekSwapPickerFor === s.id ? (
                      <div style={{ margin: "0 0 0.5rem" }}>
                        {weekSwapColleaguesLoading ? (
                          <p className="hint">Prüfe Verfügbarkeit…</p>
                        ) : availableWeekSwapColleagues.length === 0 ? (
                          <p className="hint">Niemand hat für diesen Tag/diese Schicht "kann" angegeben.</p>
                        ) : (
                          <div className="row-actions">
                            <select style={{ flex: 1 }} value={weekSwapTarget} onChange={(e) => setWeekSwapTarget(e.target.value)}>
                              <option value="">Kolleg:in wählen…</option>
                              {availableWeekSwapColleagues.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                              disabled={!weekSwapTarget}
                              onClick={() => offerWeekSwap(s.id)}
                            >
                              Anbieten
                            </button>
                          </div>
                        )}
                        <p style={{ margin: "0.3rem 0 0" }}>
                          <button
                            className="ghost"
                            style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                            onClick={() => setWeekSwapPickerFor(null)}
                          >
                            Abbrechen
                          </button>
                        </p>
                      </div>
                    ) : sickReportFor === s.id ? (
                      <div style={{ margin: "0 0 0.5rem" }}>
                        <textarea
                          rows={2}
                          style={{ width: "100%", resize: "vertical" }}
                          placeholder="Begründung (Pflichtfeld, z. B. krank)…"
                          value={sickReason}
                          onChange={(e) => setSickReason(e.target.value)}
                        />
                        <div className="row-actions" style={{ marginTop: "0.3rem" }}>
                          <button
                            style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                            disabled={!sickReason.trim() || sickSubmitting}
                            onClick={() => reportSickness(s.id, s.date, s.shift_type)}
                          >
                            Absagen bestätigen
                          </button>
                          <button
                            className="ghost"
                            style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                            onClick={() => {
                              setSickReportFor(null);
                              setSickReason("");
                            }}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="row-actions" style={{ margin: "0 0 0.5rem" }}>
                        <button
                          className="ghost"
                          style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                          onClick={() => openWeekSwapPicker(s.id, s.date, s.start_time, s.end_time)}
                        >
                          Tauschen
                        </button>
                        <button
                          className="ghost"
                          style={{ fontSize: "0.66rem", padding: "0.3rem 0.55rem" }}
                          onClick={() => setSickReportFor(s.id)}
                        >
                          Absagen (krank o. ä.)
                        </button>
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })}
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
              <span>
                {b.cake_items?.name}
                {b.note ? ` (${b.note})` : ""}
              </span>
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
          <div style={{ marginBottom: "0.75rem" }}>
            <div className="row-actions">
              <input
                style={{ flex: 1 }}
                placeholder="Neue Ankündigung…"
                value={newAnnouncement}
                onChange={(e) => setNewAnnouncement(e.target.value)}
              />
              <button onClick={postAnnouncement} disabled={postingAnnouncement || !newAnnouncement.trim()}>
                {postingAnnouncement ? "Sende…" : "Teilen"}
              </button>
            </div>
            <input
              ref={announcementImageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => setNewAnnouncementImage(e.target.files?.[0] ?? null)}
            />
            <p style={{ margin: "0.4rem 0 0" }}>
              <button className="ghost" style={{ fontSize: "0.72rem" }} onClick={() => announcementImageInputRef.current?.click()}>
                {newAnnouncementImage ? `📷 ${newAnnouncementImage.name}` : "📷 Bild anhängen (optional)"}
              </button>
              {newAnnouncementImage && (
                <button className="ghost" style={{ fontSize: "0.72rem" }} onClick={() => setNewAnnouncementImage(null)}>
                  entfernen
                </button>
              )}
            </p>
          </div>
        )}
        {announcements.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Noch keine Neuigkeiten.</p>}
        {announcements.map((a) => (
          <div key={a.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
            <p style={{ margin: 0 }}>{a.body}</p>
            {a.image_url && (
              <img src={a.image_url} alt="" style={{ marginTop: "0.4rem", borderRadius: "8px", maxHeight: "220px", objectFit: "cover" }} />
            )}
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
