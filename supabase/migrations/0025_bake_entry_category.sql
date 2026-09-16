-- Kategorie je Backeintrag: "kuchen" (fertige Kuchen/Torten) oder "boden"
-- (Tortenböden als Zwischenkomponente, z. B. "Wiener Boden", siehe §10) —
-- ersetzt das gerade erst eingeführte, aber ungenutzte Notizfeld (Feedback:
-- "mach aus dem Notizfeld eine Dropdown ... Kuchen und Böden"), damit die
-- Backen-Ansicht der Back-Truppen (Backen.tsx) beides getrennt anzeigen kann.
alter table bake_plan_entries
  add column category text not null default 'kuchen' check (category in ('kuchen', 'boden'));

create or replace function log_bake_entry_change()
returns trigger
language plpgsql
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
