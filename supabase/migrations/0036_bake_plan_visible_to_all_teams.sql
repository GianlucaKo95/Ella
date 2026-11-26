-- Feedback: "Können wir die Sichtbarkeit so umstellen, dass jeder Backtrupp
-- nach Tagen sortiert die wöchentlichen Kuchen der anderen sehen kann?"
--
-- bake_plan_select (Migration 0001) grenzte die Sicht eines Mitarbeiters
-- bisher auf veröffentlichte Einträge der EIGENEN Back-Truppe ein
-- (bake_team_id = eigene Truppe). Jetzt genügt es, überhaupt einer
-- Back-Truppe anzugehören (irgendeiner), um alle veröffentlichten Einträge
-- aller Truppen zu sehen — wer gar keiner Truppe zugeordnet ist (z. B. reine
-- Service-Kraft ohne Backen.tsx-Zugriff, s. dortige Route-Sperre in App.tsx),
-- sieht weiterhin nichts, genau wie bisher.
drop policy if exists "bake_plan_select" on bake_plan_entries;
create policy "bake_plan_select" on bake_plan_entries for select
  using (
    is_admin()
    or (
      status = 'published'
      and exists (
        select 1 from employees e
        where e.id = current_employee_id() and e.bake_team_id is not null
      )
    )
  );
