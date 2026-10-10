-- Feedback: "Wenn ein/e Kollege/in die Schicht absagt aus Krankheit oder
-- ähnlichem sollen alle und nicht nur die Admin Rolle eine Push
-- Benachrichtigung bekommen. Die Schicht wird dann ja als leer angezeigt.
-- Dort soll dann ein Button hin mit dem ich sagen kann, dass ich die
-- Schicht übernehmen kann"
--
-- Teil 1 (Benachrichtigung an alle statt nur Admins bei 'shift_cancelled')
-- passiert serverseitig in der Edge Function send-push, keine Schema-
-- Änderung nötig.
--
-- Teil 2: neue Tabelle shift_claims — ein Mitarbeiter kann sich für eine
-- offene (employee_id is null), veröffentlichte Schicht melden ("ich kann
-- übernehmen"); der Admin bestätigt die Übernahme final (gleiches Prinzip
-- wie der bestehende Schichttausch, confirmSwap() in AdminPlanning.tsx),
-- erst dann wird shifts.employee_id tatsächlich gesetzt.
create table shift_claims (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  status text not null check (status in ('pending', 'confirmed', 'declined', 'cancelled')) default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index on shift_claims (shift_id);
create index on shift_claims (employee_id);

-- Nur für eine wirklich offene Schicht (employee_id is null) darf sich
-- jemand melden — sonst könnte eine veraltete UI eine längst wieder
-- besetzte Schicht "kapern".
create or replace function check_shift_claim_target_empty()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_owner uuid;
begin
  select employee_id into current_owner from shifts where id = NEW.shift_id;
  if current_owner is not null then
    raise exception 'Diese Schicht ist bereits besetzt';
  end if;
  return NEW;
end;
$$;

create trigger shift_claims_check_target_empty
  before insert on shift_claims
  for each row execute function check_shift_claim_target_empty();

alter table shift_claims enable row level security;

create policy "shift_claims_select" on shift_claims for select
  using (employee_id = current_employee_id() or is_admin());
create policy "shift_claims_insert" on shift_claims for insert
  with check (employee_id = current_employee_id());
-- Gleiches Muster wie shift_swap_update (Migration 0007): Melder kann den
-- eigenen offenen Vorschlag zurückziehen, Admin bestätigt/lehnt final ab.
create policy "shift_claims_update" on shift_claims for update
  using (employee_id = current_employee_id() or is_admin())
  with check (employee_id = current_employee_id() or is_admin());

alter table notifications_log drop constraint if exists notifications_log_type_check;
alter table notifications_log add constraint notifications_log_type_check
  check (type in (
    'shift_published', 'bake_plan_published', 'announcement',
    'swap_accepted', 'availability_submitted', 'reminder', 'shift_cancelled',
    'shift_claim_submitted'
  ));
