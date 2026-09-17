-- Bugfix: Admin konnte eine bereits veröffentlichte Schicht/einen bereits
-- veröffentlichten Backeintrag nicht mehr bearbeiten oder löschen (Feedback:
-- "Kannst du auch klar verifizieren, das der Admin nach Veröffentlichung
-- noch bearbeiten kann? Hab es gerade probiert, funktioniert nicht").
--
-- Ursache: log_shift_change()/log_bake_entry_change() (Migration 0008/0025)
-- protokollieren solche Änderungen per Insert in plan_audit_log — die Tabelle
-- hat aber bewusst keine Insert-Policy für normale Nutzer (nur "is_admin()"
-- für Select), weil der ursprüngliche Kommentar davon ausging, ein Trigger
-- liefe automatisch mit den Rechten des Tabelleneigentümers. Das gilt aber
-- nur für SECURITY DEFINER Funktionen — beide Funktionen waren aber (Default)
-- SECURITY INVOKER, liefen also mit den Rechten der aufrufenden Rolle
-- ("authenticated"), für die keine Insert-Policy existiert. Jede UPDATE/
-- DELETE-Anweisung auf eine bereits veröffentlichte shifts-/bake_plan_entries-
-- Zeile schlug dadurch komplett fehl ("new row violates row-level security
-- policy for table plan_audit_log"), inklusive der eigentlichen Änderung,
-- nicht nur des Protokoll-Eintrags. Nie aufgefallen, weil dieser Zweig nur
-- bei Bearbeitung *bereits veröffentlichter* Einträge feuert — im normalen
-- Planungsablauf (Entwurf bearbeiten, dann veröffentlichen) nie ausgelöst.
--
-- Fix: beide Funktionen als SECURITY DEFINER (wie report_shift_absence(),
-- update_my_name(), is_colleague_available() — alle mit demselben Muster).

create or replace function log_shift_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and OLD.status = 'published' then
    if NEW.employee_id is distinct from OLD.employee_id then
      insert into plan_audit_log (entity, entity_id, date, change_summary)
      values ('shift', OLD.id, OLD.date, format('Mitarbeiter geändert: %s -> %s', OLD.employee_id, NEW.employee_id));
    end if;
    if NEW.date is distinct from OLD.date or NEW.shift_type is distinct from OLD.shift_type
       or NEW.start_time is distinct from OLD.start_time or NEW.end_time is distinct from OLD.end_time then
      insert into plan_audit_log (entity, entity_id, date, change_summary)
      values ('shift', OLD.id, OLD.date, format(
        'Schicht verschoben/umbenannt: %s %s %s–%s -> %s %s %s–%s',
        OLD.date, OLD.shift_type, OLD.start_time, OLD.end_time,
        NEW.date, NEW.shift_type, NEW.start_time, NEW.end_time
      ));
    end if;
  elsif TG_OP = 'DELETE' and OLD.status = 'published' then
    insert into plan_audit_log (entity, entity_id, date, change_summary)
    values ('shift', OLD.id, OLD.date, format('Veröffentlichte Schicht gelöscht (%s, Mitarbeiter %s)', OLD.shift_type, OLD.employee_id));
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create or replace function log_bake_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and OLD.status = 'published' then
    if NEW.bake_team_id is distinct from OLD.bake_team_id then
      insert into plan_audit_log (entity, entity_id, date, change_summary)
      values ('bake_entry', OLD.id, OLD.date, format('Truppe geändert: %s -> %s', OLD.bake_team_id, NEW.bake_team_id));
    end if;
    if NEW.quantity is distinct from OLD.quantity then
      insert into plan_audit_log (entity, entity_id, date, change_summary)
      values ('bake_entry', OLD.id, OLD.date, format('Menge geändert: %s -> %s', OLD.quantity, NEW.quantity));
    end if;
    if NEW.category is distinct from OLD.category then
      insert into plan_audit_log (entity, entity_id, date, change_summary)
      values ('bake_entry', OLD.id, OLD.date, format('Kategorie geändert: %s -> %s', OLD.category, NEW.category));
    end if;
    if NEW.cake_item_id is distinct from OLD.cake_item_id or NEW.date is distinct from OLD.date then
      insert into plan_audit_log (entity, entity_id, date, change_summary)
      values ('bake_entry', OLD.id, OLD.date, 'Kuchen oder Datum geändert');
    end if;
  elsif TG_OP = 'DELETE' and OLD.status = 'published' then
    insert into plan_audit_log (entity, entity_id, date, change_summary)
    values ('bake_entry', OLD.id, OLD.date, format('Veröffentlichter Backeintrag gelöscht (Truppe %s)', OLD.bake_team_id));
  end if;
  return coalesce(NEW, OLD);
end;
$$;
