import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchAppSettings, notifyEmployees, supabase, type Employee } from "../lib/supabase";
import { usePushToggle } from "../lib/push";
import { PushToggleButton } from "../components/PushToggleButton";
import {
  monthDaysMatching,
  mergeUniqueDates,
  toDateStr,
  parseDateStr,
  daysInMonthCount,
  isoDayOfWeek,
  DAY_NAMES,
  MONTH_NAMES,
  nextMonthStart,
  monthLabel,
  toMonthStr,
  billingPeriod,
  formatDayMonth,
  timeToMinutes,
  timeParts,
  addDays,
  addMonths,
  defaultPlanningMonth,
  weekStartOf,
  addWeeks,
  weekDaysMatching,
  weekLabel
} from "../lib/dates";

type EmployeeRow = { id: string; name: string; role: "admin" | "employee"; active: boolean; bake_team_id: string | null };
type SpecialDay = { id: string; date: string; label: string; service_exception: boolean; frueh_exception: boolean };
type AvailabilityRow = {
  employee_id: string;
  kind: "recurring" | "one_time";
  day_of_week: number | null;
  specific_date: string | null;
  available: boolean;
  from_time: string | null;
  to_time: string | null;
  note: string | null;
};
// Mitarbeiter können mehrere solcher Paare anlegen (Verfuegbarkeit.tsx,
// Feedback: "wenn ich für Tag 1 eingeplant werde, kann ich an Tag 2 nicht
// oder wenn ich an Tag 2 eingeplant bin, kann ich an Tag 1 nicht") — reine
// Zusatzinformation für den dezenten Hinweis in availabilityFor(), keine
// harte Sperre.
type EitherOrPair = { employee_id: string; date_a: string; date_b: string };
type StaffingReq = {
  id: string;
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
  sort_order: number;
};
type CakeItem = {
  id: string;
  name: string;
  default_unit: string;
  ingredients: string | null;
  recipe_note: string | null;
  is_favorite: boolean;
};
type CakeRecipeIngredient = {
  id: string;
  cake_item_id: string;
  sort_order: number;
  ingredient: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};
type BakeEntryRow = {
  id: string;
  date: string;
  cake_item_id: string;
  quantity: number;
  bake_team_id: string | null;
  status: "draft" | "published";
  category: "kuchen" | "boden";
};
type BakeTeam = { id: string; name: string };
type AuditEntry = { id: string; entity: "shift" | "bake_entry"; date: string; change_summary: string; changed_at: string };
type PendingSwap = {
  id: string;
  status: "accepted";
  shift_id: string;
  offered_to: string;
  requested_by_employee: { name: string } | null;
  offered_to_employee: { name: string } | null;
  shifts: { date: string; shift_type: "frueh" | "spaet" } | null;
};
type Tab = "schicht" | "back" | "einstellungen";

// Stunde/Minute getrennt als <select> statt eines nativen <input type="time">
// (s. timeParts() in lib/dates.ts) — garantiert überall die gewünschte
// 24h-Darstellung, unabhängig von Geräte-/Browser-Locale.
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTE_OPTIONS = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

// Aufklappbarer Abschnitt für den Einstellungen-Tab (war vorher eine einzige
// lange Karte mit allem offen untereinander — Feedback: "unübersichtlich").
// Zugeklappt zeigt jeder Abschnitt Titel + eine kurze Zusammenfassung des
// aktuellen Stands, damit ein Überblick auch ohne Aufklappen möglich ist.
// Gleiches Auf-/Zuklapp-Muster wie die einzelnen Kuchen weiter unten.
function SettingsSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <button
        type="button"
        className="ghost"
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          textAlign: "left"
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ink)" }}>{title}</span>
          {subtitle && <span style={{ fontWeight: 400, fontSize: "0.74rem", color: "var(--ink-soft)" }}>{subtitle}</span>}
        </span>
        <span style={{ color: "var(--ink-soft)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ marginTop: "0.9rem" }}>{children}</div>}
    </div>
  );
}

export function AdminPlanning({ employee }: { employee: Employee }) {
  const [tab, setTab] = useState<Tab>("schicht");

  // Beim Tab-Wechsel wieder nach oben springen, statt mitten in der neuen
  // Tab-Ansicht stehen zu bleiben, wenn im vorigen Tab weiter unten gescrollt war.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const [planMonth, setPlanMonth] = useState(() => defaultPlanningMonth(new Date()));
  // Backplanung läuft wochenweise statt über den ganzen Monat — eigener,
  // unabhängiger Navigationszustand (siehe bkDays weiter unten).
  const [planWeek, setPlanWeek] = useState(() => weekStartOf(new Date()));
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [eitherOrPairs, setEitherOrPairs] = useState<EitherOrPair[]>([]);
  const [requirements, setRequirements] = useState<StaffingReq[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [cakeItems, setCakeItems] = useState<CakeItem[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<CakeRecipeIngredient[]>([]);
  const [expandedCakeIds, setExpandedCakeIds] = useState<Set<string>>(new Set());
  // Entwurf für "Zutat hinzufügen" je Kuchen (nur während der Eingabe gehalten).
  const [newIngredientDraft, setNewIngredientDraft] = useState<
    Record<string, { ingredient: string; quantity: string; unit: string; note: string }>
  >({});
  const [bakeTeamDays, setBakeTeamDays] = useState<{ day_of_week: number; bake_team_id: string }[]>([]);
  const [bakeEntries, setBakeEntries] = useState<BakeEntryRow[]>([]);
  const [bakeTeams, setBakeTeams] = useState<BakeTeam[]>([]);
  const [deadline, setDeadline] = useState<string>("");
  const [submissions, setSubmissions] = useState<{ employee_id: string; submitted_at: string }[]>([]);
  const [billingStartDay, setBillingStartDay] = useState(1);
  // Zuletzt gespeicherte Einstellungen — bestimmen, was tatsächlich geplant wird.
  const [savedServiceDays, setSavedServiceDays] = useState<number[]>([3, 4, 5, 6]);
  const [savedBakeDays, setSavedBakeDays] = useState<number[]>([2, 3, 4]);
  const [savedFruehDays, setSavedFruehDays] = useState<number[]>([5, 6]);
  // Unsaved Entwurf der Checkbox-Auswahl, bis "Tage speichern" geklickt wird.
  const [serviceDays, setServiceDaysState] = useState<number[]>(savedServiceDays);
  const [bakeDays, setBakeDaysState] = useState<number[]>(savedBakeDays);
  const [fruehDays, setFruehDaysState] = useState<number[]>(savedFruehDays);
  const [savingSettings, setSavingSettings] = useState(false);
  // Sondertage (Feiertage, Muttertag, ...): der Admin legt einzelne Tage mit
  // Zusatzöffnung und/oder Zusatz-Frühschicht fest — persistiert, damit sie
  // auch in der Verfügbarkeitsabfrage der Mitarbeiter (Profil) auftauchen,
  // anders als die frühere rein clientseitige "+ Ausnahme: Frühschicht".
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const todaySd = new Date();
  const [sdYear, setSdYear] = useState(todaySd.getFullYear());
  const [sdMonth, setSdMonth] = useState(todaySd.getMonth() + 1);
  const [sdDay, setSdDay] = useState(todaySd.getDate());
  const [sdLabel, setSdLabel] = useState("");
  const [sdServiceException, setSdServiceException] = useState(true);
  const [sdFruehException, setSdFruehException] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newCakeName, setNewCakeName] = useState("");
  const [newCakeUnit, setNewCakeUnit] = useState("blech");
  const [newCakeIngredients, setNewCakeIngredients] = useState("");
  const [newCakeRecipe, setNewCakeRecipe] = useState("");
  const [pendingSwaps, setPendingSwaps] = useState<PendingSwap[]>([]);
  const [publishWarningAck, setPublishWarningAck] = useState(false);
  const [shiftAuditLog, setShiftAuditLog] = useState<AuditEntry[]>([]);
  const [bakeAuditLog, setBakeAuditLog] = useState<AuditEntry[]>([]);
  const push = usePushToggle(employee.id);
  // Schichtplanung: nur ein Tag gleichzeitig aufgeklappt (Akkordeon statt
  // mehrerer unabhängiger Klapp-Zustände wie bei Kuchen/Mitarbeitern) — bei
  // einem ganzen Monat Tageskarten wäre die Liste sonst sehr schnell wieder
  // ewig lang, sobald man mehrere Tage gleichzeitig offen lässt. Startet mit
  // dem heutigen Tag aufgeklappt (falls der ein Service-Tag ist), sonst
  // zugeklappt.
  const [expandedShiftDay, setExpandedShiftDay] = useState<string | null>(() => toDateStr(new Date()));
  // Gleiches Akkordeon-Muster für die Backplanung — dieselbe lange
  // Ein-Tag-eine-Karte-Liste, dasselbe Problem.
  const [expandedBakeDay, setExpandedBakeDay] = useState<string | null>(() => toDateStr(new Date()));
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const dayRulesDirty =
    serviceDays.join() !== savedServiceDays.join() ||
    bakeDays.join() !== savedBakeDays.join() ||
    fruehDays.join() !== savedFruehDays.join();

  const nextMonth = nextMonthStart(new Date());
  const nextMonthStr = toMonthStr(nextMonth);
  const previewPeriod = useMemo(() => billingPeriod(new Date(), billingStartDay), [billingStartDay]);

  // Die Planung erfolgt bewusst immer für den ganzen Kalendermonat — unabhängig
  // vom admin-einstellbaren Abrechnungszeitraum, der nur die Stundenanzeige
  // der Mitarbeiter im Kalender betrifft, nicht was geplant werden muss. Welche
  // Wochentage überhaupt Service- bzw. Back-Tage sind, kommt aus den zuletzt
  // GESPEICHERTEN Einstellungen — ein unsaved Toggle ändert die Planung unten
  // erst nach "Tage speichern" (siehe dayRulesDirty-Hinweis im UI). Sondertage
  // mit "zusätzlich geöffnet" ODER "zusätzlich Frühschicht" ergänzen einzelne
  // Zusatztermine unabhängig vom Wochentag (z. B. ein sonst schichtfreier
  // Montag für Muttertag) — auch ein reiner frueh_exception-Sondertag braucht
  // eine Tageskarte, sonst gäbe es dort gar keinen "+ Früh"-Button zum
  // Anlegen der besonderen Schicht.
  const svcDays = useMemo(() => {
    const base = monthDaysMatching(planMonth, savedServiceDays);
    const extra = specialDays
      .filter((sd) => sd.service_exception || sd.frueh_exception)
      .map((sd) => parseDateStr(sd.date))
      .filter((d) => d.getFullYear() === planMonth.getFullYear() && d.getMonth() === planMonth.getMonth());
    return mergeUniqueDates(base, extra);
  }, [planMonth, savedServiceDays, specialDays]);
  // Anders als die Schichtplanung läuft die Backplanung nur wochenweise
  // (Feedback: "gilt immer nur eine Woche und nicht den ganzen Monat") —
  // eigener Wochenzustand statt des gemeinsamen planMonth.
  const bkDays = useMemo(() => weekDaysMatching(planWeek, savedBakeDays), [planWeek, savedBakeDays]);
  const svcDateStrs = svcDays.map(toDateStr);
  const bkDateStrs = bkDays.map(toDateStr);

  // Admins müssen keine Verfügbarkeit abgeben (§9/§11) — für den
  // Verfügbarkeits-Stichtag/Erinnerungen bewusst ausgeklammert. Für die
  // Schicht-Zuweisung (weiter unten) bleiben sie Teil von `employees`, tauchen
  // dort aber gesondert am Ende der Auswahl auf (Notfall-Besetzung).
  const nonAdminEmployees = useMemo(() => employees.filter((e) => e.role !== "admin"), [employees]);
  const adminEmployees = useMemo(() => employees.filter((e) => e.role === "admin"), [employees]);
  // Favoriten (Kuchen-Verwaltung, §8) tauchen im Kuchen-Dropdown der
  // Backplanung zusätzlich oben in einer eigenen Gruppe auf, bleiben aber
  // auch unten in der vollständigen Liste — Feedback: "sollen aber auch
  // weiterhin in der zweiten Gruppe Kuchen weiterhin angezeigt werden."
  const favoriteCakeItems = useMemo(() => cakeItems.filter((c) => c.is_favorite), [cakeItems]);

  // `shifts`/`bake_plan_entries` bekommen bewusst ein explizites `.order(...)`
  // — ohne eigene Sortierung ist die von Postgres zurückgegebene Reihenfolge
  // nicht garantiert stabil und kann sich nach einem UPDATE ändern (Feedback:
  // "wenn ich zwei Schichten hinzugefügt habe und die erste eintrage, rutscht
  // diese dann an die zweite Position"). `shifts.sort_order` startet als reine
  // Anlagereihenfolge, wird aber beim Zuklappen eines Tages einmalig nach
  // Startzeit neu vergeben (`reorderShiftsByStartTime()`), `created_at` bleibt
  // nur als Tiebreaker bei gleichem `sort_order`.
  async function loadAll() {
    const [
      emp,
      avail,
      eitherOr,
      req,
      sh,
      cakes,
      cakeIngr,
      bakes,
      teams,
      teamDays,
      deadlineRes,
      submissionsRes,
      swapsRes,
      shiftAuditRes,
      bakeAuditRes,
      specialRes
    ] = await Promise.all([
      supabase.from("employees").select("id,name,role,active,bake_team_id").eq("active", true),
      supabase.from("availability_entries").select("*"),
      supabase.from("availability_either_or_pairs").select("employee_id,date_a,date_b"),
      supabase.from("staffing_requirements").select("*"),
      supabase.from("shifts").select("*").in("date", svcDateStrs).order("sort_order").order("created_at"),
      supabase.from("cake_items").select("*").order("name"),
      supabase.from("cake_recipe_ingredients").select("*").order("sort_order"),
      supabase.from("bake_plan_entries").select("*").in("date", bkDateStrs).order("created_at"),
      supabase.from("bake_teams").select("*"),
      supabase.from("bake_team_days").select("*"),
      supabase.from("availability_deadlines").select("deadline").eq("month", nextMonthStr).maybeSingle(),
      supabase.from("availability_submissions").select("employee_id, submitted_at").eq("month", nextMonthStr),
      supabase
        .from("shift_swap_requests")
        .select(
          "id,status,shift_id,offered_to,shifts(date,shift_type),requested_by_employee:requested_by(name),offered_to_employee:offered_to(name)"
        )
        .eq("status", "accepted"),
      supabase
        .from("plan_audit_log")
        .select("id,entity,date,change_summary,changed_at")
        .eq("entity", "shift")
        .gte("date", toDateStr(planMonth))
        .lt("date", toDateStr(addMonths(planMonth, 1)))
        .order("changed_at", { ascending: false })
        .limit(50),
      // Backplanung läuft wochenweise (s. o.) — das Änderungsprotokoll dafür
      // deckt entsprechend nur die angezeigte Woche ab, nicht den ganzen Monat.
      supabase
        .from("plan_audit_log")
        .select("id,entity,date,change_summary,changed_at")
        .eq("entity", "bake_entry")
        .gte("date", toDateStr(planWeek))
        .lt("date", toDateStr(addDays(planWeek, 7)))
        .order("changed_at", { ascending: false })
        .limit(50),
      supabase.from("special_days").select("*").order("date")
    ]);
    setEmployees((emp.data as EmployeeRow[]) || []);
    setAvailability((avail.data as AvailabilityRow[]) || []);
    setEitherOrPairs((eitherOr.data as EitherOrPair[]) || []);
    setRequirements((req.data as StaffingReq[]) || []);
    setShifts((sh.data as ShiftRow[]) || []);
    setCakeItems((cakes.data as CakeItem[]) || []);
    setRecipeIngredients((cakeIngr.data as CakeRecipeIngredient[]) || []);
    setBakeEntries((bakes.data as BakeEntryRow[]) || []);
    setBakeTeams((teams.data as BakeTeam[]) || []);
    setBakeTeamDays((teamDays.data as { day_of_week: number; bake_team_id: string }[]) || []);
    setDeadline(deadlineRes.data?.deadline ?? "");
    setSubmissions(submissionsRes.data || []);
    setPendingSwaps((swapsRes.data as unknown as PendingSwap[]) || []);
    setShiftAuditLog((shiftAuditRes.data as AuditEntry[]) || []);
    setBakeAuditLog((bakeAuditRes.data as AuditEntry[]) || []);
    setSpecialDays((specialRes.data as SpecialDay[]) || []);
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
      .update({ service_days: serviceDays, bake_days: bakeDays, frueh_days: fruehDays })
      .eq("id", true);
    setSavedServiceDays(serviceDays);
    setSavedBakeDays(bakeDays);
    setSavedFruehDays(fruehDays);
    setSavingSettings(false);
  }

  async function addSpecialDay() {
    if (!sdLabel.trim()) return;
    const maxDay = daysInMonthCount(sdYear, sdMonth);
    const dateStr = `${sdYear}-${String(sdMonth).padStart(2, "0")}-${String(Math.min(sdDay, maxDay)).padStart(2, "0")}`;
    await supabase.from("special_days").upsert(
      { date: dateStr, label: sdLabel.trim(), service_exception: sdServiceException, frueh_exception: sdFruehException },
      { onConflict: "date" }
    );
    setSdLabel("");
    loadAll();
  }

  async function deleteSpecialDay(id: string) {
    await supabase.from("special_days").delete().eq("id", id);
    loadAll();
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

  function toggleCakeExpanded(id: string) {
    setExpandedCakeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addCakeItem() {
    if (!newCakeName.trim()) return;
    await supabase.from("cake_items").insert({
      name: newCakeName.trim(),
      default_unit: newCakeUnit.trim() || "stück",
      ingredients: newCakeIngredients.trim() || null,
      recipe_note: newCakeRecipe.trim() || null
    });
    setNewCakeName("");
    setNewCakeUnit("blech");
    setNewCakeIngredients("");
    setNewCakeRecipe("");
    loadAll();
  }

  async function updateCakeItem(id: string, patch: Partial<CakeItem>) {
    await supabase.from("cake_items").update(patch).eq("id", id);
    loadAll();
  }

  async function deleteCakeItem(id: string) {
    const { error } = await supabase.from("cake_items").delete().eq("id", id);
    if (error) {
      alert("Kuchen wird noch in der Backplanung verwendet und kann nicht gelöscht werden.");
      return;
    }
    loadAll();
  }

  function ingredientDraftFor(cakeItemId: string) {
    return newIngredientDraft[cakeItemId] ?? { ingredient: "", quantity: "", unit: "", note: "" };
  }

  async function addRecipeIngredient(cakeItemId: string) {
    const draft = newIngredientDraft[cakeItemId];
    if (!draft?.ingredient.trim()) return;
    const existingCount = recipeIngredients.filter((i) => i.cake_item_id === cakeItemId).length;
    await supabase.from("cake_recipe_ingredients").insert({
      cake_item_id: cakeItemId,
      sort_order: existingCount,
      ingredient: draft.ingredient.trim(),
      quantity: draft.quantity.trim() ? Number(draft.quantity) : null,
      unit: draft.unit.trim() || null,
      note: draft.note.trim() || null
    });
    setNewIngredientDraft((prev) => ({ ...prev, [cakeItemId]: { ingredient: "", quantity: "", unit: "", note: "" } }));
    loadAll();
  }

  async function deleteRecipeIngredient(id: string) {
    await supabase.from("cake_recipe_ingredients").delete().eq("id", id);
    loadAll();
  }

  async function setBakeTeamDay(dayOfWeek: number, teamId: string | null) {
    if (teamId) {
      await supabase.from("bake_team_days").upsert({ day_of_week: dayOfWeek, bake_team_id: teamId }, { onConflict: "day_of_week" });
    } else {
      await supabase.from("bake_team_days").delete().eq("day_of_week", dayOfWeek);
    }
    loadAll();
  }

  // Mindestbesetzung je Wochentag/Schichtart(/Rolle) — bisher nur einmalig als
  // Platzhalter-Werte per Migration (0002_seed.sql) angelegt, ohne dass der
  // Admin sie je im UI sehen oder ändern konnte. role_tag ist bei 'spaet'
  // immer null, und der unique-Constraint (day_of_week, shift_type, role_tag)
  // behandelt zwei NULL-Werte in Postgres nicht als gleich — ein `.upsert()`
  // mit onConflict würde eine zweite 'spaet'-Zeile für denselben Tag also
  // nicht zuverlässig treffen. Stattdessen wie bei setDayAvailability() erst
  // die vorhandene Zeile suchen, dann gezielt UPDATE oder INSERT.
  function requirementCount(dayOfWeek: number, shiftType: "frueh" | "spaet", roleTag: "kueche" | "service" | null): number {
    return (
      requirements.find((r) => r.day_of_week === dayOfWeek && r.shift_type === shiftType && r.role_tag === roleTag)
        ?.required_count ?? 0
    );
  }

  async function setStaffingRequirement(dayOfWeek: number, shiftType: "frueh" | "spaet", roleTag: "kueche" | "service" | null, count: number) {
    const existing = requirements.find(
      (r) => r.day_of_week === dayOfWeek && r.shift_type === shiftType && r.role_tag === roleTag
    );
    if (existing) {
      await supabase.from("staffing_requirements").update({ required_count: count }).eq("id", existing.id);
    } else if (count > 0) {
      await supabase.from("staffing_requirements").insert({
        day_of_week: dayOfWeek,
        shift_type: shiftType,
        role_tag: roleTag,
        required_count: count
      });
    }
    loadAll();
  }

  useEffect(() => {
    fetchAppSettings().then((s) => {
      setBillingStartDay(s.billing_period_start_day);
      setSavedServiceDays(s.service_days);
      setSavedBakeDays(s.bake_days);
      setServiceDaysState(s.service_days);
      setBakeDaysState(s.bake_days);
      setSavedFruehDays(s.frueh_days);
      setFruehDaysState(s.frueh_days);
    });
  }, []);

  async function sendReminder() {
    // Admins müssen keine Verfügbarkeit abgeben (§9/§11) — ohne diesen Filter
    // stünde ein Admin dauerhaft als "ausstehend" da und könnte sich selbst
    // eine Erinnerung schicken.
    const missingIds = employees
      .filter((e) => e.role !== "admin" && !submissions.some((s) => s.employee_id === e.id))
      .map((e) => e.id);
    if (missingIds.length === 0) return;
    setReminderSending(true);
    setReminderSent(false);
    await notifyEmployees(
      missingIds,
      "reminder",
      `Bitte gib deine Verfügbarkeit für ${monthLabel(nextMonth)} ab${deadline ? ` (Stichtag ${new Date(deadline).toLocaleDateString("de-DE")})` : ""}.`
    );
    setReminderSending(false);
    setReminderSent(true);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planMonth, planWeek, savedServiceDays, savedBakeDays]);

  // Kurzfassung für die zugeklappte Tageskarte — getrennt nach Früh/Spät
  // (Feedback: "auf den ersten Blick einsehbar, ob da noch Leute fehlen"),
  // je Schichtart "besetzt/geplant" statt nur einer Gesamtzahl, da eine
  // Lücke bei Früh sonst hinter genug besetzten Spät-Schichten verschwinden
  // könnte.
  // Nenner ist bewusst das Maximum aus tatsächlich angelegten Schichten UND
  // der hinterlegten Mindestbesetzung (Personalbedarf-Sektion, §8) — nicht nur
  // "wie viele Schichten wurden angelegt". Sonst würde eine Lücke, bei der für
  // einen Tag noch gar keine Schicht angelegt wurde, in der Zusammenfassung
  // unsichtbar bleiben ("Früh 1/1" trotz eigentlich benötigter 2 Personen).
  function shiftSummary(dayShifts: ShiftRow[], dayReqs: StaffingReq[]): string {
    const parts: string[] = [];
    for (const [label, type] of [
      ["Früh", "frueh"],
      ["Spät", "spaet"]
    ] as const) {
      const ofType = dayShifts.filter((s) => s.shift_type === type);
      const required = dayReqs.filter((r) => r.shift_type === type).reduce((sum, r) => sum + r.required_count, 0);
      if (ofType.length === 0 && required === 0) continue;
      const assigned = ofType.filter((s) => s.employee_id).length;
      parts.push(`${label} ${assigned}/${Math.max(ofType.length, required)}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Keine Schichten";
  }

  // shiftStartTime prüft bei gesetztem Zeitfenster (from_time/to_time, "nur
  // Früh"/"nur Spät" aus dem Profil) zusätzlich, ob die konkrete Schicht in
  // dieses Fenster fällt — ohne Fenster (ganztags) zählt die Verfügbarkeit
  // für jede Schicht des Tages.
  function availabilityFor(employeeId: string, date: Date, dateStr: string, shiftStartTime: string): string {
    // Entweder/Oder-Tage (Verfuegbarkeit.tsx, Feedback: "wenn ich für Tag 1
    // eingeplant werde, kann ich an Tag 2 nicht oder wenn ich an Tag 2
    // eingeplant bin, kann ich an Tag 1 nicht") überschreiben die normale
    // Verfügbarkeit für beide Tage des Paares von Anfang an, nicht erst nach
    // einer Zuweisung (Feedback: "es müssen dann aber beide erstmal als Kann
    // Tage angezeigt werden mit dem Zusatz Entweder/Oder-Tag, damit der Admin
    // sich da entscheiden kann") — erst wenn die Person bereits für den
    // *anderen* Tag des Paares eingeteilt ist, kippt dieser Tag auf "kann
    // nicht", weil dann schon entschieden ist, welcher der beiden es wird.
    const pair = eitherOrPairs.find(
      (p) => p.employee_id === employeeId && (p.date_a === dateStr || p.date_b === dateStr)
    );
    if (pair) {
      const otherDate = pair.date_a === dateStr ? pair.date_b : pair.date_a;
      const otherDayTaken = shifts.some((s) => s.employee_id === employeeId && s.date === otherDate);
      return otherDayTaken ? "kann nicht – Entweder/Oder-Tag" : "kann – Entweder/Oder-Tag";
    }
    const dow = isoDayOfWeek(date);
    const entry =
      availability.find((a) => a.employee_id === employeeId && a.kind === "one_time" && a.specific_date === dateStr) ??
      availability.find((a) => a.employee_id === employeeId && a.kind === "recurring" && a.day_of_week === dow);
    if (!entry) return "unbekannt";
    // Feedback: "Ich bräuchte auch noch bei den Verfügbarkeiten pro Tag ein
    // Notizfeld" — die Notiz wäre für die Zuweisung sonst unsichtbar, deshalb
    // an jedes Ergebnis anhängen statt nur auf der Verfügbarkeit-Seite selbst.
    const noteSuffix = entry.note ? ` – ${entry.note}` : "";
    if (!entry.available) return `kann nicht${noteSuffix}`;
    if (entry.from_time && entry.to_time) {
      const start = timeToMinutes(shiftStartTime);
      const from = timeToMinutes(entry.from_time);
      const to = timeToMinutes(entry.to_time);
      return (start >= from && start < to ? "kann" : "kann nicht") + noteSuffix;
    }
    return `kann${noteSuffix}`;
  }

  async function addShift(date: string, shift_type: "frueh" | "spaet", role_tag: "kueche" | "service" | null) {
    // Donnerstags/freitags beginnt die Spätschicht bereits um 11:30 statt
    // 13:00 (Feedback: "Donnerstags und Freitags beginnen die Spätschichten
    // bereits um 11:30 Uhr. Kannst du das als Default einstellen?") — die
    // Startzeit bleibt danach wie jede andere Schicht frei änderbar.
    const dow = isoDayOfWeek(parseDateStr(date));
    const spaetStart = dow === 3 || dow === 4 ? "11:30" : "13:00";
    // Früh/Küche startet um 07:00, Früh/Service erst um 08:30 (Feedback:
    // "Früh Küche fängt immer um 07:00 Uhr an und Früh Service um 08:30 Uhr").
    const fruehStart = role_tag === "service" ? "08:30" : "07:00";
    const existingCount = shifts.filter((s) => s.date === date).length;
    await supabase.from("shifts").insert({
      date,
      shift_type,
      role_tag,
      start_time: shift_type === "frueh" ? fruehStart : spaetStart,
      end_time: shift_type === "frueh" ? "13:00" : "18:00",
      status: "draft",
      sort_order: existingCount
    });
    loadAll();
  }

  // Reiht die Schichten eines Tages neu nach Startzeit ein (statt weiterhin
  // nach Anlagereihenfolge) — Feedback: "wenn der Tag zugeklappt wird, sollen
  // die Schichten im Hintergrund nach Startzeitpunkt geordnet werden". Läuft
  // bewusst erst beim Zuklappen (nicht laufend während der Bearbeitung), damit
  // eine Schicht nicht mitten im Bearbeiten unter der Maus wegspringt.
  async function reorderShiftsByStartTime(date: string) {
    const sorted = [...shifts.filter((s) => s.date === date)].sort((a, b) => a.start_time.localeCompare(b.start_time));
    await Promise.all(
      sorted.map((s, i) => (s.sort_order === i ? null : supabase.from("shifts").update({ sort_order: i }).eq("id", s.id)))
    );
    loadAll();
  }

  async function assignShift(id: string, employee_id: string | null) {
    const { error } = await supabase.from("shifts").update({ employee_id }).eq("id", id);
    if (error) alert(`Mitarbeiter konnte nicht zugewiesen werden: ${error.message}`);
    loadAll();
  }

  // Start-/Endzeit bleiben nach dem Anlegen weiterhin änderbar (Feedback:
  // "auch wenn vorverlegt zusätzlich bearbeitbar") — z. B. wenn eine
  // Frühschicht ausnahmsweise später beginnt. Der bereits bestehende Trigger
  // `log_shift_change` (Migration 0008) protokolliert eine Zeitänderung an
  // einer schon veröffentlichten Schicht automatisch im Änderungsprotokoll.
  async function updateShiftTime(id: string, patch: Partial<Pick<ShiftRow, "start_time" | "end_time">>) {
    const { error } = await supabase.from("shifts").update(patch).eq("id", id);
    if (error) alert(`Zeit konnte nicht geändert werden: ${error.message}`);
    loadAll();
  }

  async function deleteShift(id: string) {
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) alert(`Schicht konnte nicht gelöscht werden: ${error.message}`);
    loadAll();
  }

  async function addBakeEntry(date: string) {
    if (cakeItems.length === 0) return;
    const dow = isoDayOfWeek(parseDateStr(date));
    const defaultTeamId = bakeTeamDays.find((t) => t.day_of_week === dow)?.bake_team_id ?? null;
    const { error } = await supabase.from("bake_plan_entries").insert({
      date,
      cake_item_id: cakeItems[0].id,
      // Default 2 statt 1 — in der Praxis wird fast nie nur ein einzelnes
      // Stück/Blech gebacken (Feedback: "sollte immer direkt bei Menge 2 stehen").
      quantity: 2,
      bake_team_id: defaultTeamId,
      status: "draft"
    });
    if (error) alert(`Kuchen konnte nicht hinzugefügt werden: ${error.message}`);
    loadAll();
  }

  async function updateBakeEntry(id: string, patch: Partial<BakeEntryRow>) {
    const { error } = await supabase.from("bake_plan_entries").update(patch).eq("id", id);
    if (error) alert(`Backeintrag konnte nicht geändert werden: ${error.message}`);
    loadAll();
  }

  async function deleteBakeEntry(id: string) {
    const { error } = await supabase.from("bake_plan_entries").delete().eq("id", id);
    if (error) alert(`Backeintrag konnte nicht gelöscht werden: ${error.message}`);
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

  // Dienstplan und Backplan werden bewusst unabhängig voneinander
  // veröffentlicht — das eine hat mit dem anderen nichts zu tun.
  async function publishShiftMonth() {
    const { data: publishedShifts, error } = await supabase
      .from("shifts")
      .update({ status: "published" })
      .in("date", svcDateStrs)
      .eq("status", "draft")
      .select("employee_id");
    if (error) {
      alert(`Dienstplan konnte nicht veröffentlicht werden: ${error.message}`);
      return;
    }
    const notifyIds = Array.from(
      new Set((publishedShifts || []).map((s) => s.employee_id).filter((id): id is string => !!id))
    );
    // Absichtlich nicht mehr abgewartet (Feedback: "Das Veröffentlichen des
    // Plans dauert bis zu 20 Sekunden bis die Meldung kommt") — die Schichten
    // sind an dieser Stelle bereits veröffentlicht, der eigentliche Versand
    // (Edge Function `send-push`, verschickt Web-Push an jedes Gerät) darf die
    // Bestätigung nicht länger blockieren.
    notifyEmployees(
      notifyIds,
      "shift_published",
      `Dienstplan für ${monthLabel(planMonth)} veröffentlicht`,
      `/kalender?date=${toMonthStr(planMonth)}`
    );
    // Feedback: "Auch das ist still. Ein Pop-Up wäre schon oder einfach eine
    // Meldung das der Plan veröffentlicht wurde." — bislang gab es außer dem
    // Neuladen der Liste keine sichtbare Bestätigung.
    alert(
      publishedShifts.length > 0
        ? `Dienstplan für ${monthLabel(planMonth)} veröffentlicht (${publishedShifts.length} Schicht${publishedShifts.length === 1 ? "" : "en"}).`
        : `Keine offenen Entwürfe für ${monthLabel(planMonth)} zu veröffentlichen.`
    );
    loadAll();
  }

  async function publishBakeWeek(force = false) {
    if (!force && unassignedBakeEntries.length > 0) {
      setPublishWarningAck(true);
      return;
    }
    const { data: publishedEntries, error } = await supabase
      .from("bake_plan_entries")
      .update({ status: "published" })
      .in("date", bkDateStrs)
      .eq("status", "draft")
      .select("id");
    if (error) {
      alert(`Backplan konnte nicht veröffentlicht werden: ${error.message}`);
      return;
    }
    setPublishWarningAck(false);
    alert(
      publishedEntries.length > 0
        ? `Backplan für Woche ${weekLabel(planWeek)} veröffentlicht (${publishedEntries.length} Eintrag${publishedEntries.length === 1 ? "" : "e"}).`
        : `Keine offenen Entwürfe für Woche ${weekLabel(planWeek)} zu veröffentlichen.`
    );
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

      <div className="segmented" style={{ marginBottom: "1rem" }}>
        <button type="button" className={tab === "schicht" ? "on" : ""} onClick={() => setTab("schicht")}>
          Schichtplanung
        </button>
        <button type="button" className={tab === "back" ? "on" : ""} onClick={() => setTab("back")}>
          Backplanung
        </button>
        <button type="button" className={tab === "einstellungen" ? "on" : ""} onClick={() => setTab("einstellungen")}>
          Einstellungen
        </button>
      </div>

      {tab === "schicht" && (
        <div className="cal-header">
          <button className="ghost" onClick={() => setPlanMonth((m) => addMonths(m, -1))}>
            ‹
          </button>
          <h3 style={{ margin: 0 }}>{monthLabel(planMonth)}</h3>
          <div className="nav-btns">
            <button className="ghost" onClick={() => setPlanMonth(defaultPlanningMonth(new Date()))}>
              Heute
            </button>
            <button className="ghost" onClick={() => setPlanMonth((m) => addMonths(m, 1))}>
              ›
            </button>
          </div>
        </div>
      )}
      {tab === "schicht" && (
        <p style={{ fontSize: "0.72rem", color: "var(--ink-soft)", margin: "0 0 0.8rem" }}>
          Geplant wird immer der ganze Kalendermonat (Einstellungen dazu im Tab "Einstellungen").
        </p>
      )}
      {tab === "back" && (
        <div className="cal-header">
          <button className="ghost" onClick={() => setPlanWeek((w) => addWeeks(w, -1))}>
            ‹
          </button>
          <h3 style={{ margin: 0 }}>Woche {weekLabel(planWeek)}</h3>
          <div className="nav-btns">
            <button className="ghost" onClick={() => setPlanWeek(weekStartOf(new Date()))}>
              Diese Woche
            </button>
            <button className="ghost" onClick={() => setPlanWeek((w) => addWeeks(w, 1))}>
              ›
            </button>
          </div>
        </div>
      )}
      {tab === "back" && (
        <p style={{ fontSize: "0.72rem", color: "var(--ink-soft)", margin: "0 0 0.8rem" }}>
          Anders als die Schichtplanung gilt der Backplan immer nur für die angezeigte Woche.
        </p>
      )}

      {tab === "schicht" && (
        <>
          {pendingSwaps.length > 0 && (
            <div className="card">
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

          {shiftAuditLog.length > 0 && (
            <div className="card">
              <h3>Änderungsprotokoll ({monthLabel(planMonth)})</h3>
              <p className="hint">Nachträgliche Änderungen an bereits veröffentlichten Schichten.</p>
              {shiftAuditLog.map((a) => (
                <div className="shift-line" key={a.id}>
                  <span className="tag">{new Date(a.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
                  <span>{a.change_summary}</span>
                  <span className="who">
                    {new Date(a.changed_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}{" "}
                    {new Date(a.changed_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button onClick={publishShiftMonth}>📣 Dienstplan für {monthLabel(planMonth)} veröffentlichen</button>

          <h3 style={{ marginTop: "1rem" }}>
            Dienstplan ({savedServiceDays.map((d) => DAY_NAMES[d].slice(0, 2)).join("/")}, {monthLabel(planMonth)})
          </h3>
          {svcDays.map((d, i) => {
            const dateStr = svcDateStrs[i];
            const dow = isoDayOfWeek(d);
            const dayReqs = requirements.filter((r) => r.day_of_week === dow);
            const dayShifts = shifts.filter((s) => s.date === dateStr);
            const specialDay = specialDays.find((sd) => sd.date === dateStr);
            const expanded = expandedShiftDay === dateStr;
            const summary = shiftSummary(dayShifts, dayReqs);
            return (
              <div className="card" key={dateStr}>
                <button
                  type="button"
                  className="ghost"
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" }}
                  onClick={() => {
                    setExpandedShiftDay(expanded ? null : dateStr);
                    if (expanded) reorderShiftsByStartTime(dateStr);
                  }}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ink)" }}>
                      {DAY_NAMES[dow]}, {dateStr}
                      {specialDay && (
                        <span className="badge" style={{ marginLeft: "0.5rem" }}>
                          🎉 {specialDay.label}
                        </span>
                      )}
                    </span>
                    <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--ink-soft)" }}>{summary}</span>
                  </span>
                  <span style={{ color: "var(--ink-soft)" }}>{expanded ? "▲" : "▼"}</span>
                </button>
                {expanded && (
                  <div style={{ marginTop: "0.7rem" }}>
                    {dayReqs.length > 0 && (
                      <p style={{ fontSize: "0.85rem", color: "#666" }}>
                        Bedarf:{" "}
                        {dayReqs
                          .map((r) => `${r.shift_type}${r.role_tag ? "/" + r.role_tag : ""}: ${r.required_count}`)
                          .join(", ")}
                      </p>
                    )}
                    <table className="stack">
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
                        {dayShifts.map((s) => {
                          const [sh, sm] = timeParts(s.start_time);
                          const [eh, em] = timeParts(s.end_time);
                          return (
                          <tr key={s.id}>
                            <td data-label="Schicht">{s.shift_type === "frueh" ? "Früh" : "Spät"}</td>
                            <td data-label="Rolle">{s.role_tag ?? "—"}</td>
                            <td data-label="Zeit">
                              <div className="row-actions" style={{ flexWrap: "wrap" }}>
                                <select value={sh} onChange={(e) => updateShiftTime(s.id, { start_time: `${e.target.value}:${sm}` })}>
                                  {HOUR_OPTIONS.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                                <span>:</span>
                                <select value={sm} onChange={(e) => updateShiftTime(s.id, { start_time: `${sh}:${e.target.value}` })}>
                                  {MINUTE_OPTIONS.map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                                <span>–</span>
                                <select value={eh} onChange={(e) => updateShiftTime(s.id, { end_time: `${e.target.value}:${em}` })}>
                                  {HOUR_OPTIONS.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                                <span>:</span>
                                <select value={em} onChange={(e) => updateShiftTime(s.id, { end_time: `${eh}:${e.target.value}` })}>
                                  {MINUTE_OPTIONS.map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td data-label="Mitarbeiter">
                              <select value={s.employee_id ?? ""} onChange={(e) => assignShift(s.id, e.target.value || null)}>
                                <option value="">– wählen –</option>
                                <optgroup label="Mitarbeiter">
                                  {nonAdminEmployees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.name} ({availabilityFor(emp.id, d, dateStr, s.start_time)})
                                    </option>
                                  ))}
                                </optgroup>
                                {adminEmployees.length > 0 && (
                                  <optgroup label="Admins">
                                    {adminEmployees.map((emp) => (
                                      <option key={emp.id} value={emp.id}>
                                        {emp.name} ({availabilityFor(emp.id, d, dateStr, s.start_time)})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </td>
                            <td data-label="">
                              <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => deleteShift(s.id)}>✕</button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {(savedFruehDays.includes(dow) || specialDay?.frueh_exception) && (
                      <>
                        <button className="ghost" onClick={() => addShift(dateStr, "frueh", "kueche")}>+ Früh/Küche</button>{" "}
                        <button className="ghost" onClick={() => addShift(dateStr, "frueh", "service")}>+ Früh/Service</button>{" "}
                      </>
                    )}
                    <button className="ghost" onClick={() => addShift(dateStr, "spaet", null)}>+ Spät</button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === "back" && (
        <>
          {bakeAuditLog.length > 0 && (
            <div className="card">
              <h3>Änderungsprotokoll (Woche {weekLabel(planWeek)})</h3>
              <p className="hint">Nachträgliche Änderungen an bereits veröffentlichten Backeinträgen.</p>
              {bakeAuditLog.map((a) => (
                <div className="shift-line" key={a.id}>
                  <span className="tag">{new Date(a.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
                  <span>{a.change_summary}</span>
                  <span className="who">
                    {new Date(a.changed_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}{" "}
                    {new Date(a.changed_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {unassignedBakeEntries.length > 0 && publishWarningAck && (
            <div className="card card-attention">
              <p className="hint warn" style={{ margin: 0 }}>
                {unassignedBakeEntries.length} Backeintrag{unassignedBakeEntries.length > 1 ? "e" : ""} ohne zugeordnete
                Truppe. Truppe zuweisen oder trotzdem veröffentlichen?
              </p>
              <button style={{ marginTop: "0.5rem" }} onClick={() => publishBakeWeek(true)}>
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
              else publishBakeWeek();
            }}
          >
            📣 Backplan für Woche {weekLabel(planWeek)} veröffentlichen
          </button>

          <h3 style={{ marginTop: "1rem" }}>
            Backplan ({savedBakeDays.map((d) => DAY_NAMES[d].slice(0, 2)).join("/")}, außerhalb Öffnungszeiten,{" "}
            Woche {weekLabel(planWeek)})
          </h3>
          {bkDays.map((d, i) => {
            const dateStr = bkDateStrs[i];
            const dow = isoDayOfWeek(d);
            const dayEntries = bakeEntries.filter((b) => b.date === dateStr);
            const expanded = expandedBakeDay === dateStr;
            const missingTeamCount = dayEntries.filter((b) => !b.bake_team_id).length;
            return (
              <div className="card" key={dateStr}>
                <button
                  type="button"
                  className="ghost"
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" }}
                  onClick={() => setExpandedBakeDay((prev) => (prev === dateStr ? null : dateStr))}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ink)" }}>
                      {DAY_NAMES[dow]}, {dateStr}
                    </span>
                    <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                      {dayEntries.length === 0
                        ? "Keine Einträge"
                        : `${dayEntries.length} Kuchen${missingTeamCount > 0 ? ` · ${missingTeamCount} ohne Truppe` : ""}`}
                    </span>
                  </span>
                  <span style={{ color: "var(--ink-soft)" }}>{expanded ? "▲" : "▼"}</span>
                </button>
                {expanded && (
                  <div style={{ marginTop: "0.7rem" }}>
                    <table className="stack">
                      <thead>
                        <tr>
                          <th>Kuchen</th>
                          <th>Menge</th>
                          <th>Truppe</th>
                          <th>Kategorie</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {dayEntries.map((b) => {
                          const collisions = collisionsFor(dateStr, b.bake_team_id);
                          return (
                            <tr key={b.id}>
                              <td data-label="Kuchen">
                                <select
                                  value={b.cake_item_id}
                                  onChange={(e) => updateBakeEntry(b.id, { cake_item_id: e.target.value })}
                                >
                                  {favoriteCakeItems.length > 0 && (
                                    <optgroup label="Favoriten">
                                      {favoriteCakeItems.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label="Kuchen">
                                    {cakeItems.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                </select>
                              </td>
                              <td data-label="Menge">
                                <input
                                  type="number"
                                  value={b.quantity}
                                  min={1}
                                  style={{ width: "4rem" }}
                                  onChange={(e) => updateBakeEntry(b.id, { quantity: Number(e.target.value) })}
                                />
                              </td>
                              <td data-label="Truppe">
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
                              <td data-label="Kategorie">
                                <select
                                  value={b.category}
                                  onChange={(e) => updateBakeEntry(b.id, { category: e.target.value as "kuchen" | "boden" })}
                                >
                                  <option value="kuchen">Kuchen</option>
                                  <option value="boden">Böden</option>
                                </select>
                              </td>
                              <td data-label="">
                                <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => deleteBakeEntry(b.id)}>✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <button className="ghost" onClick={() => addBakeEntry(dateStr)}>+ Kuchen hinzufügen</button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === "einstellungen" && (
        <>
          <SettingsSection
            title="Benachrichtigungen"
            subtitle={
              push.state === "subscribed"
                ? "Push-Benachrichtigungen aktiv auf diesem Gerät"
                : push.state === "unsupported"
                ? "Von diesem Browser nicht unterstützt"
                : push.state === "denied"
                ? "Erlaubnis wurde verweigert"
                : "Push-Benachrichtigungen nicht aktiviert"
            }
          >
            <p className="hint" style={{ marginTop: 0 }}>
              Aktiviert für dieses Gerät/diesen Browser eine echte Push-Benachrichtigung (auch außerhalb der App),
              sobald ein angenommener Schichttausch auf Bestätigung wartet oder jemand seine Verfügbarkeit
              eingereicht hat.
            </p>
            <PushToggleButton state={push.state} busy={push.busy} error={push.error} onToggle={push.toggle} />
          </SettingsSection>

          <SettingsSection
            title="Abrechnungszeitraum"
            subtitle={`Beginnt am ${billingStartDay}. · aktuell ${formatDayMonth(previewPeriod.start)}–${formatDayMonth(previewPeriod.end)}`}
          >
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
                Gilt für die "voraussichtlichen Stunden" im Kalender jedes Mitarbeiters. 1 = klassischer
                Kalendermonat.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Öffnungs- & Back-Tage"
            subtitle={`Service: ${savedServiceDays.map((d) => DAY_NAMES[d].slice(0, 2)).join("/")} · Backen: ${savedBakeDays.map((d) => DAY_NAMES[d].slice(0, 2)).join("/")} · Früh: ${savedFruehDays.length > 0 ? savedFruehDays.map((d) => DAY_NAMES[d].slice(0, 2)).join("/") : "nie normalerweise"}`}
          >
            <div className="field">
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
            </div>

            <div className="field" style={{ marginTop: "0.8rem" }}>
              <label>Feste Truppe je Back-Tag (optional)</label>
              <p className="hint" style={{ marginTop: 0 }}>
                Ist hier eine Truppe hinterlegt, wird sie beim Anlegen eines neuen Backeintrags an diesem Wochentag
                automatisch vorausgewählt, statt sie jedes Mal manuell zu setzen.
              </p>
              {savedBakeDays.map((dow) => (
                <div key={dow} className="row-actions" style={{ marginTop: "0.3rem" }}>
                  <span style={{ width: "6rem" }}>{DAY_NAMES[dow]}</span>
                  <select
                    value={bakeTeamDays.find((t) => t.day_of_week === dow)?.bake_team_id ?? ""}
                    onChange={(e) => setBakeTeamDay(dow, e.target.value || null)}
                  >
                    <option value="">– immer manuell wählen –</option>
                    {bakeTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="field" style={{ marginTop: "0.8rem" }}>
              <label>An diesen Tagen ist normalerweise eine Frühschicht</label>
              <div className="day-toggle-row">
                {DAY_NAMES.map((name, idx) => (
                  <button
                    key={name}
                    type="button"
                    className={fruehDays.includes(idx) ? "" : "ghost"}
                    onClick={() => toggleDay(fruehDays, setFruehDaysState, idx)}
                  >
                    {name.slice(0, 2)}
                  </button>
                ))}
              </div>
              <p className="hint">
                Ausnahmen für einzelne Tage (Feiertage, Muttertag, ...) werden weiter unten über "Sondertage"
                verwaltet, nicht hier. Leere Auswahl ist erlaubt (nie normalerweise).
              </p>
            </div>

            {(serviceDays.length === 0 || bakeDays.length === 0) && (
              <p className="hint warn">Service- und Back-Tage brauchen mindestens einen Tag.</p>
            )}
            {dayRulesDirty && serviceDays.length > 0 && bakeDays.length > 0 && (
              <p className="hint warn">Ungespeicherte Änderung — wirkt sich erst nach "Tage speichern" auf die Planung aus.</p>
            )}
            <button
              style={{ marginTop: "0.3rem" }}
              disabled={savingSettings || serviceDays.length === 0 || bakeDays.length === 0 || !dayRulesDirty}
              onClick={saveDayRules}
            >
              Tage speichern
            </button>
          </SettingsSection>

          <SettingsSection title="Personalbedarf" subtitle="Mindestbesetzung je Wochentag">
            <p className="hint" style={{ marginTop: 0 }}>
              Legt fest, wie viele Personen je Schicht mindestens gebraucht werden — erscheint in
              der Schichtplanung als "Bedarf" und fließt in die Zusammenfassung der zugeklappten
              Tageskarten ein (z. B. zeigt "Früh 1/2" eine Lücke, auch wenn dafür noch gar keine
              zweite Schicht angelegt wurde).
            </p>
            {savedServiceDays.map((dow) => (
              <div key={dow} style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem", marginTop: "0.6rem" }}>
                <label className="label-caps" style={{ display: "block", marginBottom: "0.4rem" }}>
                  {DAY_NAMES[dow]}
                </label>
                <div className="row-actions" style={{ flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem" }}>
                    Früh/Küche
                    <input
                      type="number"
                      min={0}
                      style={{ width: "4rem" }}
                      value={requirementCount(dow, "frueh", "kueche")}
                      onChange={(e) => setStaffingRequirement(dow, "frueh", "kueche", Math.max(0, Number(e.target.value)))}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem" }}>
                    Früh/Service
                    <input
                      type="number"
                      min={0}
                      style={{ width: "4rem" }}
                      value={requirementCount(dow, "frueh", "service")}
                      onChange={(e) => setStaffingRequirement(dow, "frueh", "service", Math.max(0, Number(e.target.value)))}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem" }}>
                    Spät
                    <input
                      type="number"
                      min={0}
                      style={{ width: "4rem" }}
                      value={requirementCount(dow, "spaet", null)}
                      onChange={(e) => setStaffingRequirement(dow, "spaet", null, Math.max(0, Number(e.target.value)))}
                    />
                  </label>
                </div>
              </div>
            ))}
          </SettingsSection>

          <SettingsSection
            title="Sondertage"
            subtitle={specialDays.length === 0 ? "Keine angelegt" : `${specialDays.length} Termin${specialDays.length === 1 ? "" : "e"}`}
          >
            <p className="hint" style={{ marginTop: 0 }}>
              Für Feiertage, Muttertag & Co., an denen zusätzlich geöffnet ist und/oder zusätzlich eine
              Frühschicht angeboten wird — der Tag erscheint dann automatisch im Dienstplan oben und in der
              Verfügbarkeitsabfrage der Mitarbeiter.
            </p>
            <div className="row-actions" style={{ flexWrap: "wrap" }}>
              <select value={sdDay} onChange={(e) => setSdDay(Number(e.target.value))}>
                {Array.from({ length: daysInMonthCount(sdYear, sdMonth) }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select value={sdMonth} onChange={(e) => setSdMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select value={sdYear} onChange={(e) => setSdYear(Number(e.target.value))}>
                {[todaySd.getFullYear(), todaySd.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <input
                placeholder="Bezeichnung, z. B. Muttertag"
                style={{ flex: 1, minWidth: "10rem" }}
                value={sdLabel}
                onChange={(e) => setSdLabel(e.target.value)}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.6rem", fontSize: "0.85rem" }}>
              <input
                type="checkbox"
                checked={sdServiceException}
                onChange={(e) => setSdServiceException(e.target.checked)}
              />
              Zusätzlich geöffnet (auch an sonst schichtfreien Tagen)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.3rem", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={sdFruehException} onChange={(e) => setSdFruehException(e.target.checked)} />
              Zusätzlich Frühschicht
            </label>
            <button className="ghost" style={{ marginTop: "0.6rem" }} onClick={addSpecialDay} disabled={!sdLabel.trim()}>
              Sondertag hinzufügen
            </button>
            <ul style={{ listStyle: "none", padding: 0, marginTop: "0.8rem" }}>
              {specialDays.map((sd) => (
                <li
                  key={sd.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.4rem 0",
                    borderBottom: "1px solid var(--border)"
                  }}
                >
                  <span>
                    {formatDayMonth(parseDateStr(sd.date))}.{sd.date.slice(0, 4)} — {sd.label}
                    {sd.service_exception && " · zusätzlich geöffnet"}
                    {sd.frueh_exception && " · zusätzlich Früh"}
                  </span>
                  <button
                    className="ghost"
                    style={{ fontSize: "0.65rem", padding: "0.3rem 0.5rem" }}
                    onClick={() => deleteSpecialDay(sd.id)}
                  >
                    entfernen
                  </button>
                </li>
              ))}
            </ul>
          </SettingsSection>

          <SettingsSection
            title="Back-Truppen"
            subtitle={bakeTeams.length === 0 ? "Keine angelegt" : `${bakeTeams.length} Truppe${bakeTeams.length === 1 ? "" : "n"}`}
          >
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
          </SettingsSection>

          <SettingsSection
            title="Kuchen"
            subtitle={
              cakeItems.length === 0
                ? "Keine hinterlegt"
                : `${cakeItems.length} Kuchen hinterlegt${favoriteCakeItems.length > 0 ? ` · ${favoriteCakeItems.length} favorisiert` : ""}`
            }
          >
            <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
              Nur hier hinterlegte Kuchen stehen bei der Backplanung zur Auswahl. ☆ markiert einen Kuchen als
              Favorit — Favoriten erscheinen im Kuchen-Dropdown der Backplanung zusätzlich oben in einer eigenen
              Gruppe. Zum Bearbeiten antippen.
            </p>
            {cakeItems.map((c) => {
              const expanded = expandedCakeIds.has(c.id);
              return (
                <div key={c.id} style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", marginTop: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <button
                      type="button"
                      className="ghost"
                      style={{ padding: "0.3rem 0.5rem", fontSize: "1rem", lineHeight: 1 }}
                      onClick={() => updateCakeItem(c.id, { is_favorite: !c.is_favorite })}
                      title={c.is_favorite ? "Favorit entfernen" : "Als Favorit markieren"}
                    >
                      {c.is_favorite ? "★" : "☆"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      onClick={() => toggleCakeExpanded(c.id)}
                    >
                      <span>{c.name}</span>
                      <span style={{ color: "var(--ink-soft)" }}>{expanded ? "▲" : "▼"}</span>
                    </button>
                  </div>
                  {expanded && (
                    <div style={{ marginTop: "0.6rem" }}>
                      <div className="row-actions">
                        <input
                          style={{ flex: 1 }}
                          defaultValue={c.name}
                          onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && updateCakeItem(c.id, { name: e.target.value.trim() })}
                        />
                        <input
                          style={{ width: "5.5rem" }}
                          defaultValue={c.default_unit}
                          onBlur={(e) =>
                            e.target.value.trim() && e.target.value !== c.default_unit && updateCakeItem(c.id, { default_unit: e.target.value.trim() })
                          }
                        />
                        <button className="ghost" style={{ padding: "0.3rem 0.55rem" }} onClick={() => deleteCakeItem(c.id)}>
                          ✕
                        </button>
                      </div>
                      <p style={{ margin: "0.5rem 0 0" }}>
                        <label className="label-caps">
                          Zutatenliste
                        </label>
                        <ul style={{ listStyle: "none", padding: 0, margin: "0.3rem 0 0" }}>
                          {recipeIngredients
                            .filter((i) => i.cake_item_id === c.id)
                            .map((i) => (
                              <li
                                key={i.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "0.25rem 0",
                                  borderBottom: "1px solid var(--border)",
                                  fontSize: "0.85rem"
                                }}
                              >
                                <span>
                                  {i.quantity != null && `${i.quantity} `}
                                  {i.unit && `${i.unit} `}
                                  {i.ingredient}
                                  {i.note && <span style={{ color: "var(--ink-soft)" }}> — {i.note}</span>}
                                </span>
                                <button
                                  className="ghost"
                                  style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                                  onClick={() => deleteRecipeIngredient(i.id)}
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                        </ul>
                        <div className="row-actions" style={{ flexWrap: "wrap", marginTop: "0.4rem" }}>
                          <input
                            style={{ width: "4.5rem" }}
                            placeholder="Menge"
                            value={newIngredientDraft[c.id]?.quantity ?? ""}
                            onChange={(e) =>
                              setNewIngredientDraft((prev) => ({
                                ...prev,
                                [c.id]: { ...ingredientDraftFor(c.id), quantity: e.target.value }
                              }))
                            }
                          />
                          <input
                            style={{ width: "4.5rem" }}
                            placeholder="Einheit"
                            value={newIngredientDraft[c.id]?.unit ?? ""}
                            onChange={(e) =>
                              setNewIngredientDraft((prev) => ({
                                ...prev,
                                [c.id]: { ...ingredientDraftFor(c.id), unit: e.target.value }
                              }))
                            }
                          />
                          <input
                            style={{ flex: 1, minWidth: "8rem" }}
                            placeholder="Zutat"
                            value={newIngredientDraft[c.id]?.ingredient ?? ""}
                            onChange={(e) =>
                              setNewIngredientDraft((prev) => ({
                                ...prev,
                                [c.id]: { ...ingredientDraftFor(c.id), ingredient: e.target.value }
                              }))
                            }
                          />
                          <input
                            style={{ flex: 1, minWidth: "8rem" }}
                            placeholder="Notiz (optional)"
                            value={newIngredientDraft[c.id]?.note ?? ""}
                            onChange={(e) =>
                              setNewIngredientDraft((prev) => ({
                                ...prev,
                                [c.id]: { ...ingredientDraftFor(c.id), note: e.target.value }
                              }))
                            }
                          />
                          <button className="ghost" onClick={() => addRecipeIngredient(c.id)}>
                            + Zutat
                          </button>
                        </div>
                      </p>
                      <p style={{ margin: "0.5rem 0 0" }}>
                        <label className="label-caps">
                          Zutaten (Freitext, Fallback ohne Liste oben)
                          <br />
                          <textarea
                            style={{ width: "100%", marginTop: 4 }}
                            rows={2}
                            defaultValue={c.ingredients ?? ""}
                            onBlur={(e) => e.target.value !== (c.ingredients ?? "") && updateCakeItem(c.id, { ingredients: e.target.value || null })}
                          />
                        </label>
                      </p>
                      <p style={{ margin: "0.5rem 0 0" }}>
                        <label className="label-caps">
                          Backanleitung
                          <br />
                          <textarea
                            style={{ width: "100%", marginTop: 4 }}
                            rows={3}
                            defaultValue={c.recipe_note ?? ""}
                            onBlur={(e) => e.target.value !== (c.recipe_note ?? "") && updateCakeItem(c.id, { recipe_note: e.target.value || null })}
                          />
                        </label>
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.9rem", marginTop: "0.9rem" }}>
              <p className="row-actions">
                <input style={{ flex: 1 }} placeholder="Name des neuen Kuchens" value={newCakeName} onChange={(e) => setNewCakeName(e.target.value)} />
                <input style={{ width: "5.5rem" }} placeholder="Einheit" value={newCakeUnit} onChange={(e) => setNewCakeUnit(e.target.value)} />
              </p>
              <p>
                <label className="label-caps">
                  Zutaten
                  <br />
                  <textarea
                    style={{ width: "100%", marginTop: 4 }}
                    rows={2}
                    value={newCakeIngredients}
                    onChange={(e) => setNewCakeIngredients(e.target.value)}
                  />
                </label>
              </p>
              <p>
                <label className="label-caps">
                  Backanleitung
                  <br />
                  <textarea
                    style={{ width: "100%", marginTop: 4 }}
                    rows={3}
                    value={newCakeRecipe}
                    onChange={(e) => setNewCakeRecipe(e.target.value)}
                  />
                </label>
              </p>
              <button className="ghost" onClick={addCakeItem}>+ Kuchen anlegen</button>
            </div>
          </SettingsSection>

          <SettingsSection
            title={`Verfügbarkeits-Stichtag für ${monthLabel(nextMonth)}`}
            subtitle={`${submissions.length}/${nonAdminEmployees.length} eingereicht${deadline ? ` · Stichtag ${new Date(deadline).toLocaleDateString("de-DE")}` : ""}`}
          >
            <p className="hint" style={{ marginTop: 0 }}>
              Gilt nur für Mitarbeiter — Admins müssen keine Verfügbarkeit abgeben und tauchen hier nicht auf.
            </p>
            <p>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />{" "}
              <button className="ghost" onClick={saveDeadline}>Stichtag speichern</button>
            </p>
            {(() => {
              const missing = nonAdminEmployees.filter((e) => !submissions.some((s) => s.employee_id === e.id));
              if (missing.length === 0) return null;
              return (
                <p>
                  <button className="ghost" disabled={reminderSending} onClick={sendReminder}>
                    {reminderSending
                      ? "Sende…"
                      : `Erinnerung an ${missing.length} Ausstehende senden`}
                  </button>
                  {reminderSent && (
                    <span className="hint" style={{ marginLeft: "0.5rem" }}>
                      Gesendet ✅
                    </span>
                  )}
                </p>
              );
            })()}
            <table>
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  <th>Eingereicht?</th>
                </tr>
              </thead>
              <tbody>
                {nonAdminEmployees.map((emp) => {
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
          </SettingsSection>
        </>
      )}
    </div>
  );
}
