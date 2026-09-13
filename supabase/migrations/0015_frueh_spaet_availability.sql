-- Verfügbarkeit differenziert nach Früh/Spät (an Tagen, die beides haben):
-- availability_entries.from_time/to_time (bisher ungenutzt) tragen jetzt bei
-- Bedarf ein Zeitfenster ("nur Früh" / "nur Spät"), ist keins gesetzt gilt
-- die Verfügbarkeit weiterhin ganztägig. is_colleague_available bekommt dafür
-- einen optionalen Parameter für die Startzeit der zu prüfenden Schicht.

-- Alte 2-Parameter-Signatur entfernen statt nur zu ersetzen: eine dritte
-- Funktion mit demselben Namen und einem Default-Parameter würde sonst neben
-- der alten stehen bleiben und einen Aufruf mit nur 2 Argumenten mehrdeutig
-- machen ("function is not unique").
drop function if exists is_colleague_available(uuid, date);

create or replace function is_colleague_available(target_employee uuid, check_date date, check_start_time time default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_available boolean;
  entry_from time;
  entry_to time;
  target_dow int;
  found_row boolean := false;
begin
  select available, from_time, to_time into entry_available, entry_from, entry_to
  from availability_entries
  where employee_id = target_employee and kind = 'one_time' and specific_date = check_date
  limit 1;
  found_row := found;

  if not found_row then
    target_dow := extract(isodow from check_date)::int - 1; -- 0=Mo..6=So, passend zu day_of_week
    select available, from_time, to_time into entry_available, entry_from, entry_to
    from availability_entries
    where employee_id = target_employee and kind = 'recurring' and day_of_week = target_dow
    limit 1;
    found_row := found;
  end if;

  if not found_row then
    return true; -- unbekannt -> nicht blockieren, nur bei explizitem "kann nicht" warnen
  end if;

  if not entry_available then
    return false;
  end if;

  if check_start_time is null or entry_from is null or entry_to is null then
    return true; -- ganztägig verfügbar (kein Zeitfenster hinterlegt)
  end if;

  return check_start_time >= entry_from and check_start_time < entry_to;
end;
$$;

grant execute on function is_colleague_available(uuid, date, time) to authenticated;
