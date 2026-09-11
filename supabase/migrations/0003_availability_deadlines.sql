-- Monatliche Verfügbarkeits-Stichtage:
-- Mitarbeiter müssen ihre Verfügbarkeit für den KOMPLETTEN nächsten Monat
-- bis zu einem vom Admin gesetzten Stichtag eingetragen haben.

create table availability_deadlines (
  id uuid primary key default gen_random_uuid(),
  month date not null unique, -- immer der 1. des Monats, für den die Verfügbarkeit gilt
  deadline date not null,     -- Stichtag, bis zu dem eingetragen sein muss
  created_at timestamptz not null default now()
);

create table availability_submissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  month date not null, -- 1. des Monats, für den eingereicht wurde
  submitted_at timestamptz not null default now(),
  unique (employee_id, month)
);

alter table availability_deadlines enable row level security;
alter table availability_submissions enable row level security;

-- Stichtage: lesbar für alle eingeloggten, schreibbar nur Admin
create policy "availability_deadlines_select" on availability_deadlines for select
  using (auth.uid() is not null);
create policy "availability_deadlines_write_admin" on availability_deadlines for all
  using (is_admin()) with check (is_admin());

-- Einreichungen: Mitarbeiter meldet nur für sich selbst, Admin sieht alle
create policy "availability_submissions_own_select" on availability_submissions for select
  using (employee_id = current_employee_id() or is_admin());
create policy "availability_submissions_own_insert" on availability_submissions for insert
  with check (employee_id = current_employee_id() or is_admin());
create policy "availability_submissions_admin_delete" on availability_submissions for delete
  using (is_admin());
