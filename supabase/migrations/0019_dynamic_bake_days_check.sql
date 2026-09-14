-- Bugfix: die in Migration 0006 vorgesehenen Trigger `shifts_check_service_day`
-- und `bake_plan_check_day` (validieren gegen die admin-konfigurierbaren
-- `app_settings.service_days`/`bake_days`) fehlten in der laufenden
-- Datenbank — die zugehörigen Funktionen (`check_shift_service_day`,
-- `check_bake_plan_day`) existierten zwar bereits, waren aber nie als
-- Trigger an die Tabellen angehängt. Dadurch gab es serverseitig gar keine
-- Tages-Validierung mehr, seit die ursprünglichen CHECK-Constraints in 0006
-- entfernt wurden — hier nachgeholt (per `drop trigger if exists` idempotent,
-- schadet also nicht, falls sie in einer anderen Umgebung doch schon
-- existieren).
-- check_shift_service_day muss zusätzlich Sondertage mit service_exception
-- erlauben (§10/Migration 0016) — sonst würde das Anlegen einer Schicht an
-- einem admin-deklarierten Zusatztermin außerhalb der normalen
-- service_days-Wochentage von diesem Trigger abgelehnt.
create or replace function check_shift_service_day()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  allowed smallint[];
  dow smallint;
begin
  if exists (select 1 from special_days where date = NEW.date and service_exception) then
    return NEW;
  end if;
  select service_days into allowed from app_settings where id = true;
  dow := (extract(isodow from NEW.date)::int - 1);
  if allowed is null or not (dow = any(allowed)) then
    raise exception 'Datum % ist laut aktuellen Einstellungen kein Service-Tag', NEW.date;
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
