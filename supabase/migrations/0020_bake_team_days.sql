-- Feste Truppen-Zuordnung je Wochentag, damit der Admin die Truppe nicht bei
-- jedem einzelnen Backeintrag manuell auswählen muss. day_of_week ist der
-- Primärschlüssel (0=Mo..6=So, wie überall im Schema) — pro Wochentag genau
-- eine Standard-Truppe, optional (kein Eintrag = weiterhin manuell wählen).
create table bake_team_days (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  bake_team_id uuid not null references bake_teams (id) on delete cascade
);

alter table bake_team_days enable row level security;

create policy "bake_team_days_select" on bake_team_days for select
  using (auth.uid() is not null);
create policy "bake_team_days_write_admin" on bake_team_days for all
  using (is_admin()) with check (is_admin());
