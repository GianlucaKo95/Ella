-- Workshop-Folgerunde: Änderungsprotokoll für bereits veröffentlichte Pläne
-- (Architekt/QS-Wunsch: Nachvollziehbarkeit bei nachträglichen Änderungen).

-- ============================================================
-- plan_audit_log: protokolliert Änderungen an bereits veröffentlichten
-- shifts/bake_plan_entries (Update eines geänderten Felds, oder Delete).
-- Änderungen an noch nicht veröffentlichten (draft) Einträgen sind normale
-- Planungsarbeit und werden bewusst NICHT protokolliert.
-- ============================================================
create table plan_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('shift', 'bake_entry')),
  entity_id uuid not null,
  date date not null,
  change_summary text not null,
  changed_at timestamptz not null default now()
);

create index on plan_audit_log (date);
create index on plan_audit_log (entity, entity_id);

create or replace function log_shift_change()
returns trigger
language plpgsql
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

create trigger shifts_log_change
  after update or delete on shifts
  for each row execute function log_shift_change();

create or replace function log_bake_entry_change()
returns trigger
language plpgsql
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

create trigger bake_plan_entries_log_change
  after update or delete on bake_plan_entries
  for each row execute function log_bake_entry_change();

alter table plan_audit_log enable row level security;

create policy "plan_audit_log_admin_select" on plan_audit_log for select
  using (is_admin());
-- Schreiben passiert ausschließlich über die Trigger-Funktionen (security
-- definer über den Tabelleneigentümer); es gibt bewusst keine Insert/Update/
-- Delete-Policy für normale Nutzer.

-- ============================================================
-- is_colleague_available: UX-Hinweis beim Schichttausch-Anbieten ("kann der
-- Kollege an dem Tag überhaupt?"), ohne dass ein Mitarbeiter die komplette
-- Verfügbarkeitstabelle eines Kollegen lesen darf (availability_entries
-- bleibt per RLS streng "eigene oder Admin"). Liefert nur ein Bool zurück,
-- keine Rohdaten.
-- ============================================================
create or replace function is_colleague_available(target_employee uuid, check_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  one_time_available boolean;
  recurring_available boolean;
  target_dow int;
begin
  select available into one_time_available
  from availability_entries
  where employee_id = target_employee and kind = 'one_time' and specific_date = check_date
  limit 1;
  if one_time_available is not null then
    return one_time_available;
  end if;

  target_dow := extract(isodow from check_date)::int - 1; -- 0=Mo..6=So, passend zu day_of_week
  select available into recurring_available
  from availability_entries
  where employee_id = target_employee and kind = 'recurring' and day_of_week = target_dow
  limit 1;
  if recurring_available is not null then
    return recurring_available;
  end if;

  return true; -- unbekannt -> nicht blockieren, nur bei explizitem "kann nicht" warnen
end;
$$;

grant execute on function is_colleague_available(uuid, date) to authenticated;
