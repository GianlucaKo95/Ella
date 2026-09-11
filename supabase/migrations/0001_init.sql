-- Ella: Schicht- und Backplanung für Café Ella
-- Initiales Schema

create extension if not exists "pgcrypto";

-- ============================================================
-- Back-Truppen (3 feste Teams)
-- ============================================================
create table bake_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into bake_teams (name) values ('Truppe 1'), ('Truppe 2'), ('Truppe 3');

-- ============================================================
-- Mitarbeiter
-- ============================================================
create table employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  role text not null check (role in ('admin', 'employee')) default 'employee',
  active boolean not null default true,
  bake_team_id uuid references bake_teams (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on employees (auth_user_id);

-- ============================================================
-- Verfügbarkeiten
--   kind = 'recurring'  -> day_of_week gesetzt, gilt dauerhaft
--   kind = 'one_time'   -> specific_date gesetzt, gilt als Ausnahme/Override
--                          für diesen einen Tag (überschreibt 'recurring')
-- ============================================================
create table availability_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  kind text not null check (kind in ('recurring', 'one_time')),
  day_of_week smallint check (day_of_week between 0 and 6), -- 0=Montag .. 6=Sonntag
  specific_date date,
  from_time time,
  to_time time,
  available boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  constraint recurring_needs_day check (
    (kind = 'recurring' and day_of_week is not null and specific_date is null) or
    (kind = 'one_time' and specific_date is not null and day_of_week is null)
  )
);

create index on availability_entries (employee_id);
create index on availability_entries (specific_date);

-- ============================================================
-- Service-Schichten (nur Do-So)
-- ============================================================
create table shifts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift_type text not null check (shift_type in ('frueh', 'spaet')),
  role_tag text check (role_tag in ('kueche', 'service')), -- nur bei 'frueh' relevant
  start_time time not null,
  end_time time not null,
  employee_id uuid references employees (id) on delete set null,
  status text not null check (status in ('draft', 'published')) default 'draft',
  created_by uuid references employees (id),
  created_at timestamptz not null default now(),
  constraint service_days_only check (extract(isodow from date) between 4 and 7), -- Do=4..So=7
  constraint role_tag_only_frueh check (
    (shift_type = 'frueh') or (shift_type = 'spaet' and role_tag is null)
  )
);

create index on shifts (date);
create index on shifts (employee_id);

-- ============================================================
-- Personalbedarf je Wochentag / Schichttyp / Rolle
--   required_count = wie viele Personen gebraucht werden
-- ============================================================
create table staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 3 and 6), -- 3=Do..6=So (0=Mo)
  shift_type text not null check (shift_type in ('frueh', 'spaet')),
  role_tag text check (role_tag in ('kueche', 'service')),
  required_count smallint not null check (required_count >= 0),
  unique (day_of_week, shift_type, role_tag)
);

-- ============================================================
-- Kuchen / Backwaren
-- ============================================================
create table cake_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_unit text not null default 'stück',
  recipe_note text
);

-- ============================================================
-- Backplan (nur Mi/Do/Fr, außerhalb Öffnungszeiten, pro Truppe)
-- ============================================================
create table bake_plan_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  cake_item_id uuid not null references cake_items (id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  bake_team_id uuid references bake_teams (id) on delete set null,
  status text not null check (status in ('draft', 'published')) default 'draft',
  note text,
  created_at timestamptz not null default now(),
  constraint bake_days_only check (extract(isodow from date) in (3, 4, 5)) -- Mi=3, Do=4, Fr=5
);

create index on bake_plan_entries (date);
create index on bake_plan_entries (bake_team_id);

-- ============================================================
-- Benachrichtigungs-Log
-- ============================================================
create table notifications_log (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('shift_published', 'bake_plan_published')),
  target_employee_id uuid references employees (id) on delete set null,
  sent_at timestamptz not null default now(),
  channel text not null check (channel in ('ha_notify', 'web_push'))
);

-- ============================================================
-- Hilfsfunktion: eigene employees-Zeile des eingeloggten Users
-- ============================================================
create or replace function current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from employees where auth_user_id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table employees enable row level security;
alter table availability_entries enable row level security;
alter table shifts enable row level security;
alter table staffing_requirements enable row level security;
alter table cake_items enable row level security;
alter table bake_plan_entries enable row level security;
alter table bake_teams enable row level security;
alter table notifications_log enable row level security;

-- employees: jeder eingeloggte sieht alle aktiven Mitarbeiter (für Namen in Plänen),
-- aber nur Admin darf ändern
create policy "employees_select" on employees for select
  using (auth.uid() is not null);
create policy "employees_write_admin" on employees for all
  using (is_admin()) with check (is_admin());

-- bake_teams: lesbar für alle eingeloggten, schreibbar nur Admin
create policy "bake_teams_select" on bake_teams for select
  using (auth.uid() is not null);
create policy "bake_teams_write_admin" on bake_teams for all
  using (is_admin()) with check (is_admin());

-- availability_entries: Mitarbeiter sieht/bearbeitet nur eigene, Admin alles
create policy "availability_own_select" on availability_entries for select
  using (employee_id = current_employee_id() or is_admin());
create policy "availability_own_write" on availability_entries for all
  using (employee_id = current_employee_id() or is_admin())
  with check (employee_id = current_employee_id() or is_admin());

-- shifts: Mitarbeiter sieht nur veröffentlichte Schichten, Admin alles (inkl. draft)
create policy "shifts_select" on shifts for select
  using (status = 'published' or is_admin());
create policy "shifts_write_admin" on shifts for all
  using (is_admin()) with check (is_admin());

-- staffing_requirements: lesbar für alle, schreibbar nur Admin
create policy "staffing_requirements_select" on staffing_requirements for select
  using (auth.uid() is not null);
create policy "staffing_requirements_write_admin" on staffing_requirements for all
  using (is_admin()) with check (is_admin());

-- cake_items: lesbar für alle, schreibbar nur Admin
create policy "cake_items_select" on cake_items for select
  using (auth.uid() is not null);
create policy "cake_items_write_admin" on cake_items for all
  using (is_admin()) with check (is_admin());

-- bake_plan_entries: Mitarbeiter sieht veröffentlichte Einträge seiner eigenen Truppe,
-- Admin alles
create policy "bake_plan_select" on bake_plan_entries for select
  using (
    is_admin()
    or (
      status = 'published'
      and bake_team_id = (select bake_team_id from employees where id = current_employee_id())
    )
  );
create policy "bake_plan_write_admin" on bake_plan_entries for all
  using (is_admin()) with check (is_admin());

-- notifications_log: nur Admin liest/schreibt direkt (Edge Functions nutzen Service Role)
create policy "notifications_log_admin" on notifications_log for all
  using (is_admin()) with check (is_admin());
