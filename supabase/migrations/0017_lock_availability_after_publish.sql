-- Verfügbarkeit für einen Tag ist ab Veröffentlichung des Dienstplans für
-- diesen Tag gesperrt (weder Insert/Update/Delete) — sonst könnte jemand
-- nach der Zuweisung noch "kann nicht" eintragen, ohne dass sich das im
-- bereits veröffentlichten Dienstplan widerspiegelt. Recurring-Einträge
-- (kind='recurring', kein specific_date, seit der Tagesauswahl-Umstellung
-- nicht mehr im UI erzeugt) bleiben unangetastet, da sie keinem einzelnen
-- Tag zuzuordnen sind. shifts.date ist für jeden authentifizierten Nutzer
-- bereits lesbar, sobald status='published' (siehe shifts_select-Policy),
-- daher genügt eine einfache EXISTS-Subquery ohne eigene Helper-Funktion.

drop policy "availability_own_write" on availability_entries;

create policy "availability_own_write" on availability_entries for all
  using (
    is_admin() or (
      employee_id = current_employee_id()
      and (
        specific_date is null
        or not exists (
          select 1 from shifts where shifts.date = availability_entries.specific_date and shifts.status = 'published'
        )
      )
    )
  )
  with check (
    is_admin() or (
      employee_id = current_employee_id()
      and (
        specific_date is null
        or not exists (
          select 1 from shifts where shifts.date = availability_entries.specific_date and shifts.status = 'published'
        )
      )
    )
  );
