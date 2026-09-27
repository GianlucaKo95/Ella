-- Feedback: "Momentan werden mir beim Tauschvorschlag alle angezeigt und
-- nicht nur die die 'Kann' für diesen Tag und Schicht angeklickt haben."
--
-- Bisher zeigte die Kolleg:in-Auswahl beim Schichttausch-Anbieten (Home.tsx
-- "Meine Woche", Kalender.tsx Tagesdetails) immer alle aktiven Mitarbeiter
-- und prüfte erst NACH der Auswahl per is_colleague_available() (Migration
-- 0015), ob die gewählte Person laut eigener Angabe "kann nicht" eingetragen
-- hat — nur als dezente Warnung, keine harte Sperre ("unbekannt" zählte
-- bewusst als verfügbar, um niemanden ohne abgegebene Verfügbarkeit
-- auszuschließen). Für die neue Anforderung reicht das nicht: es soll die
-- Auswahl selbst schon auf Personen eingrenzen, die für genau diesen Tag UND
-- diese Schicht explizit "kann" angegeben haben — "unbekannt" zählt hier
-- also NICHT mehr als verfügbar, anders als bei is_colleague_available().
--
-- Eigene neue Funktion statt is_colleague_available() umzubauen: dessen
-- bisherige "unbekannt -> verfügbar"-Semantik bleibt für einen künftigen
-- Aufrufer mit genau diesem (bewusst großzügigeren) Bedarf erhalten, statt
-- sie hier zu verschärfen und dadurch dort zu brechen.
create or replace function colleagues_available_for(check_date date, check_start_time time default null)
returns table(employee_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_dow int := extract(isodow from check_date)::int - 1; -- 0=Mo..6=So
begin
  return query
  select e.id
  from employees e
  where e.active = true
    and coalesce(
      (
        select ae.available
               and (check_start_time is null or ae.from_time is null or ae.to_time is null
                    or (check_start_time >= ae.from_time and check_start_time < ae.to_time))
        from availability_entries ae
        where ae.employee_id = e.id and ae.kind = 'one_time' and ae.specific_date = check_date
        limit 1
      ),
      (
        select ae.available
               and (check_start_time is null or ae.from_time is null or ae.to_time is null
                    or (check_start_time >= ae.from_time and check_start_time < ae.to_time))
        from availability_entries ae
        where ae.employee_id = e.id and ae.kind = 'recurring' and ae.day_of_week = target_dow
        limit 1
      ),
      false
    );
end;
$$;

grant execute on function colleagues_available_for(date, time) to authenticated;
