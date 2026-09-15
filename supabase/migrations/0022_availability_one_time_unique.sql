-- Bisher gab es keine Datenbank-Garantie, dass pro Mitarbeiter und Tag nur
-- eine 'one_time'-Verfügbarkeit existiert — nur die Client-Logik in
-- setDayAvailability() (Profil.tsx) prüfte vor dem Schreiben, ob für das
-- Datum schon eine Zeile existiert (dann UPDATE, sonst INSERT). Bei zwei
-- schnell hintereinander angeklickten Optionen (z. B. erst "Früh", dann noch
-- "Spät" bevor die Seite neu geladen hat) hätten daher theoretisch zwei
-- Zeilen für denselben Tag entstehen können — nur eine davon wäre in der
-- Verfügbarkeits-Liste sichtbar gewesen (JS-Map behält pro Datum nur die
-- letzte), die andere aber weiter in der DB gestanden und z. B. bei
-- is_colleague_available()/availabilityFor() (AdminPlanning) inkonsistent
-- mitgezählt. Erzwingt das jetzt direkt in der Datenbank statt nur in der UI.
create unique index availability_entries_one_time_unique
  on availability_entries (employee_id, specific_date)
  where kind = 'one_time';
