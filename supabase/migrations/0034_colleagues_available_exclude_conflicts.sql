-- Feedback: "Jetzt muss nur noch abgeglichen werden, welcher Kollege/in zu
-- der Zeit schon eingetragen ist und deshalb ja auch nicht kann." — löst den
-- in Migration 0033 dokumentierten offenen Punkt ("Schichttausch-Auswahl
-- prüft keine Terminkollision"): colleagues_available_for() filterte bisher
-- nur nach abgegebener Verfügbarkeit, nicht danach, ob die Person an dem Tag
-- bereits selbst zeitlich überlappend eingeteilt ist (z. B. schon eine
-- andere veröffentlichte Schicht zur selben Zeit hat) und die angebotene
-- Schicht deshalb real gar nicht übernehmen könnte.
--
-- Neuer optionaler dritter Parameter `check_end_time` (Ende der angebotenen
-- Schicht) — mit ihm zusätzlich ausgeschlossen: jede Person mit einer
-- bereits veröffentlichten Schicht an `check_date`, deren Zeitraum sich mit
-- [check_start_time, check_end_time) überschneidet (Standard-Intervall-
-- Überlappungstest `start < check_end_time and end > check_start_time`).
-- Bewusst nur zeitliche Überlappung, keine pauschale Tagessperre — zwei
-- nicht überlappende Schichten am selben Tag (z. B. schon Spät, zusätzlich
-- Früh übernehmen) bleiben weiterhin möglich, das ist keine physische
-- Unmöglichkeit wie eine echte Zeitüberschneidung.
create or replace function colleagues_available_for(
  check_date date,
  check_start_time time default null,
  check_end_time time default null
)
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
    )
    and not exists (
      select 1
      from shifts s
      where s.employee_id = e.id
        and s.date = check_date
        and s.status = 'published'
        and (
          check_start_time is null or check_end_time is null
          or (s.start_time < check_end_time and s.end_time > check_start_time)
        )
    );
end;
$$;

grant execute on function colleagues_available_for(date, time, time) to authenticated;
