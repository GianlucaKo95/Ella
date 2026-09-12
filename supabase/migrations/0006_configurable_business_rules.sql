-- Macht die bisher fest im Schema verankerten Rahmendaten admin-einstellbar:
-- an welchen Wochentagen Service stattfindet, an welchen gebacken wird, und
-- wie viele Back-Truppen es gibt (Truppen selbst werden weiterhin als Zeilen
-- in bake_teams verwaltet, jetzt aber über die Admin-UI bearbeitbar).
--
-- Wochentag-Schema hier wie überall sonst im Projekt: 0=Montag .. 6=Sonntag.

alter table app_settings
  add column service_days smallint[] not null default '{3,4,5,6}', -- Do,Fr,Sa,So
  add column bake_days smallint[] not null default '{2,3,4}';       -- Mi,Do,Fr

alter table app_settings
  add constraint app_settings_service_days_valid check (
    service_days <@ array[0,1,2,3,4,5,6]::smallint[] and array_length(service_days, 1) > 0
  ),
  add constraint app_settings_bake_days_valid check (
    bake_days <@ array[0,1,2,3,4,5,6]::smallint[] and array_length(bake_days, 1) > 0
  );

-- Die alten, hart codierten Tages-Checks auf shifts/bake_plan_entries ersetzen
-- wir durch Trigger, die gegen die jetzt konfigurierbaren app_settings prüfen
-- (ein CHECK-Constraint kann nicht gegen eine andere Tabelle prüfen).
alter table shifts drop constraint if exists service_days_only;
alter table bake_plan_entries drop constraint if exists bake_days_only;

-- staffing_requirements war zuvor hart auf Do-So (3-6) begrenzt; jetzt beliebiger
-- Wochentag (0-6) zulässig, damit der Admin auch bei geänderten Service-Tagen
-- passende Bedarfszeilen anlegen kann.
alter table staffing_requirements drop constraint if exists staffing_requirements_day_of_week_check;
alter table staffing_requirements add constraint staffing_requirements_day_of_week_check
  check (day_of_week between 0 and 6);

create or replace function check_shift_service_day()
returns trigger
language plpgsql
as $$
declare
  allowed smallint[];
  dow smallint;
begin
  select service_days into allowed from app_settings where id = true;
  dow := (extract(isodow from NEW.date)::int - 1); -- 1=Mo..7=So -> 0=Mo..6=So
  if allowed is null or not (dow = any(allowed)) then
    raise exception 'Datum % ist laut aktuellen Einstellungen kein Service-Tag', NEW.date;
  end if;
  return NEW;
end;
$$;

create or replace function check_bake_plan_day()
returns trigger
language plpgsql
as $$
declare
  allowed smallint[];
  dow smallint;
begin
  select bake_days into allowed from app_settings where id = true;
  dow := (extract(isodow from NEW.date)::int - 1);
  if allowed is null or not (dow = any(allowed)) then
    raise exception 'Datum % ist laut aktuellen Einstellungen kein Back-Tag', NEW.date;
  end if;
  return NEW;
end;
$$;

drop trigger if exists shifts_check_service_day on shifts;
create trigger shifts_check_service_day
  before insert or update of date on shifts
  for each row execute function check_shift_service_day();

drop trigger if exists bake_plan_check_day on bake_plan_entries;
create trigger bake_plan_check_day
  before insert or update of date on bake_plan_entries
  for each row execute function check_bake_plan_day();
