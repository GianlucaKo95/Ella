// Wochentage: 0=Montag .. 6=Sonntag (passend zum DB-Schema)
export function isoDayOfWeek(date: Date): number {
  const jsDay = date.getDay(); // 0=So .. 6=Sa
  return (jsDay + 6) % 7; // 0=Mo .. 6=So
}

// Bewusst nicht `date.toISOString().slice(0, 10)`: das konvertiert ein
// lokales Datum über UTC, was es in jeder Zeitzone mit positivem UTC-Offset
// (z. B. Deutschland, UTC+1/+2) einen Tag zurückfallen lassen kann — lokale
// Mitternacht liegt dort noch im UTC-Vortag. Stattdessen direkt aus den
// lokalen Datumsteilen zusammensetzen.
export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Kehrt toDateStr um ("YYYY-MM-DD" -> lokales Datum) — bewusst nicht
// `new Date(s)`, das ISO-Datums-Strings ohne Uhrzeit als UTC-Mitternacht
// interpretiert und je nach Zeitzone auf den Vortag zurückfallen kann.
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Zwei Datums-Listen zusammenführen, doppelte Kalendertage nur einmal
// behalten, aufsteigend sortiert — z. B. normale Öffnungstage + Sondertage
// mit Zusatzöffnung.
export function mergeUniqueDates(base: Date[], extra: Date[]): Date[] {
  const seen = new Set(base.map(toDateStr));
  const merged = [...base];
  for (const d of extra) {
    const ds = toDateStr(d);
    if (!seen.has(ds)) {
      merged.push(d);
      seen.add(ds);
    }
  }
  return merged.sort((a, b) => a.getTime() - b.getTime());
}

// "HH:MM" oder "HH:MM:SS" (so liefert Postgres/PostgREST time-Spalten) -> Minuten seit
// Mitternacht, für Zeitfenster-Vergleiche (z. B. Verfügbarkeits-Fenster gegen Schichtbeginn).
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Anzahl Tage in einem Monat (1-indiziert, wie z. B. <select>-Optionen sie liefern).
export function daysInMonthCount(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Alle Tage des Kalendermonats, der `monthStart` (1. des Monats) enthält.
export function daysInMonth(monthStart: Date): Date[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const count = daysInMonthCount(year, month + 1);
  return Array.from({ length: count }, (_, i) => new Date(year, month, i + 1));
}

// Tage des Kalendermonats, deren Wochentag (0=Mo..6=So) in `allowedDays` liegt
// — für die Monatsplanung (bewusst immer der volle Kalendermonat, unabhängig
// vom admin-einstellbaren Abrechnungszeitraum, der nur die Stundenanzeige der
// Mitarbeiter betrifft). `allowedDays` kommt aus den admin-einstellbaren
// app_settings (service_days/bake_days) statt fest codiert zu sein.
export function monthDaysMatching(monthStart: Date, allowedDays: number[]): Date[] {
  return daysInMonth(monthStart).filter((d) => allowedDays.includes(isoDayOfWeek(d)));
}

export const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// Fallback, falls app_settings noch nicht geladen sind (Do–So, Default-Konfiguration
// von service_days).
export const RELEVANT_DAYS = [3, 4, 5, 6];

export const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

// 1. des nächsten Monats (relativ zu `today`)
export function nextMonthStart(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth() + 1, 1);
}

export function monthLabel(monthStart: Date): string {
  return `${MONTH_NAMES[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
}

export function toMonthStr(monthStart: Date): string {
  return toDateStr(monthStart).slice(0, 7) + "-01";
}

// 1. des Monats, der `anyDate` enthält
export function monthStartOf(anyDate: Date): Date {
  return new Date(anyDate.getFullYear(), anyDate.getMonth(), 1);
}

export function addMonths(monthStart: Date, delta: number): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + delta, 1);
}

// 6 Wochen (42 Tage), Mo..So, inkl. führender/nachfolgender Tage aus
// Nachbarmonaten — für eine Apple-Kalender-artige Monatsansicht
export function monthGrid(monthStart: Date): Date[] {
  const firstWeekStart = addDays(monthStart, -isoDayOfWeek(monthStart));
  return Array.from({ length: 42 }, (_, i) => addDays(firstWeekStart, i));
}

// Abrechnungszeitraum, der `refDate` enthält: beginnt am `startDay`. des
// Monats und endet am Tag davor im Folgemonat (z.B. startDay=16 ->
// 16.09.–15.10.). startDay=1 entspricht dem klassischen Kalendermonat.
export function billingPeriod(refDate: Date, startDay: number): { start: Date; end: Date } {
  const day = refDate.getDate();
  const periodStartMonth = day >= startDay ? refDate.getMonth() : refDate.getMonth() - 1;
  const start = new Date(refDate.getFullYear(), periodStartMonth, startDay);
  const end = addDays(new Date(refDate.getFullYear(), periodStartMonth + 1, startDay), -1);
  return { start, end };
}

export function formatDayMonth(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}
