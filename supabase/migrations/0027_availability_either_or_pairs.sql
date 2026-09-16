-- Entweder/Oder-Tage: Mitarbeiter können zwei Tage miteinander verknüpfen, die
-- sich gegenseitig ausschließen ("wenn ich für Tag 1 eingeplant werde, kann
-- ich an Tag 2 nicht oder wenn ich an Tag 2 eingeplant bin, kann ich an Tag 1
-- nicht"). Mehrere Paare pro Mitarbeiter möglich, jedes Paar genau 2 Tage.
-- Reine Zusatzinformation für den dezenten Verfügbarkeits-Hinweis in der
-- Schichtplanung (availabilityFor(), AdminPlanning.tsx) — keine harte Sperre,
-- der Admin kann die Person trotzdem für beide Tage einteilen.
create table availability_either_or_pairs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date_a date not null,
  date_b date not null,
  created_at timestamptz not null default now(),
  constraint different_dates check (date_a <> date_b)
);

alter table availability_either_or_pairs enable row level security;

-- Jede:r verwaltet ausschließlich die eigenen Paare (analog push_subscriptions).
create policy either_or_own on availability_either_or_pairs
  for all
  using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id());

-- Admins müssen alle Paare lesen können, um den Hinweis in der
-- Schichtplanung für jede Person anzuzeigen — anlegen/löschen bleibt aber
-- ausschließlich der betroffenen Person selbst vorbehalten (obige Policy).
create policy either_or_admin_read on availability_either_or_pairs
  for select
  using (is_admin());
