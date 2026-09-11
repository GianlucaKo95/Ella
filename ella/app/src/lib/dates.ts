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
