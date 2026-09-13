-- Sondertage (Feiertage, Muttertag, ...): der Admin entscheidet, an welchen
-- einzelnen Tagen zusätzlich geöffnet ist (auch an sonst schichtfreien
-- Wochentagen) und/oder zusätzlich eine Frühschicht angeboten wird. Ersetzt
-- die bisherige rein clientseitige, nicht persistierte "+ Ausnahme:
-- Frühschicht"-Freischaltung in AdminPlanning — dadurch landet eine solche
-- Ausnahme jetzt auch automatisch in der Verfügbarkeitsabfrage der
-- Mitarbeiter (Profil), was vorher nicht der Fall war.
create table special_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  label text not null,
  service_exception boolean not null default false,
  frueh_exception boolean not null default false,
  created_at timestamptz not null default now()
);

alter table special_days enable row level security;

create policy "special_days_select" on special_days for select
  using (auth.uid() is not null);
create policy "special_days_write_admin" on special_days for all
  using (is_admin()) with check (is_admin());
