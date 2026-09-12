// Wochentage: 0=Montag .. 6=Sonntag (passend zum DB-Schema)
export function isoDayOfWeek(date: Date): number {
  const jsDay = date.getDay(); // 0=So .. 6=Sa
  return (jsDay + 6) % 7; // 0=Mo .. 6=So
}

export function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Liefert Mo..So der Woche, die `anyDate` enthält
export function weekDates(anyDate: Date): Date[] {
  const dow = isoDayOfWeek(anyDate);
  const monday = addDays(anyDate, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function serviceDays(anyDate: Date): Date[] {
  // Do(3)..So(6) im 0=Mo Schema
  return weekDates(anyDate).slice(3, 7);
}

export function bakeDays(anyDate: Date): Date[] {
  // Mi(2), Do(3), Fr(4)
  return weekDates(anyDate).slice(2, 5);
}

export const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// Relevante Wochentage fürs Café: Mi (Backen) bis So (letzter Öffnungstag) — 0=Mo Schema
export const RELEVANT_DAYS = [2, 3, 4, 5, 6];

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
