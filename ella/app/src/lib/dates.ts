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

// Alle Tage des Kalendermonats, der `monthStart` (1. des Monats) enthält.
export function daysInMonth(monthStart: Date): Date[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
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

// Fallback, falls app_settings noch nicht geladen sind (Mi–So, Default-Konfiguration).
export const RELEVANT_DAYS = [2, 3, 4, 5, 6];

// Wochentage, für die ein Mitarbeiter vor dem Einreichen eine wiederkehrende
// Verfügbarkeit braucht: Vereinigung aus den admin-einstellbaren Service- und
// Back-Tagen (0=Mo..6=So), statt fest Mi–So anzunehmen.
export function relevantDays(serviceDays: number[], bakeDays: number[]): number[] {
  return Array.from(new Set([...serviceDays, ...bakeDays])).sort((a, b) => a - b);
}

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
