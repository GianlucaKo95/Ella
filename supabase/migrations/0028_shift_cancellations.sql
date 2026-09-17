-- Feedback: "Momentan kann niemand eine Schicht auf Grund von Krankheit
-- oder ähnlichem einfach absagen. Diese Funktion brauchen wir noch. Mit
-- Freitextfeld für eine Begründung das verpflichtend ist. Der Admin soll
-- darüber dann eine Benachrichtigung bekommen und die Schicht dann trotz
-- veröffentlichtem Plan wieder änderbar sein."
--
-- Admin kann veröffentlichte Schichten ohnehin jederzeit ändern
-- (shifts_write_admin kennt keine Sperre nach Veröffentlichung) — neu ist,
-- dass ein Mitarbeiter selbst (ohne Admin-Rechte auf shifts) seine eigene,
-- bereits veröffentlichte Schicht als "abgesagt" protokollieren und dabei
-- automatisch wieder freigeben (employee_id = null) kann, damit der Admin
-- sie in der Planung sofort neu besetzen kann.

create table shift_cancellations (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint reason_not_blank check (length(trim(reason)) > 0)
);

create index on shift_cancellations (shift_id);
create index on shift_cancellations (employee_id);

alter table shift_cancellations enable row level security;

create policy "shift_cancellations_select" on shift_cancellations for select
  using (employee_id = current_employee_id() or is_admin());
-- Schreiben passiert ausschließlich über report_shift_absence() (s. u.) —
-- bewusst keine Insert-Policy für normale Nutzer, da die Funktion neben dem
-- Insert auch shifts.employee_id zurücksetzt, was eine offene Insert-Policy
-- allein nicht leisten könnte.

-- Mitarbeiter dürfen shifts.employee_id normalerweise nicht selbst ändern
-- (shifts_write_admin ist admin-exklusiv) — dafür diese SECURITY DEFINER
-- Funktion statt einer offenen Update-Policy auf die ganze Tabelle
-- (gleiches Muster wie update_my_name() in Migration 0004).
create or replace function report_shift_absence(target_shift_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner uuid;
begin
  if reason is null or length(trim(reason)) = 0 then
    raise exception 'Begründung darf nicht leer sein';
  end if;

  select employee_id into current_owner from shifts where id = target_shift_id;
  if current_owner is distinct from current_employee_id() then
    raise exception 'Nur der aktuell eingeteilte Mitarbeiter kann diese Schicht absagen';
  end if;

  insert into shift_cancellations (shift_id, employee_id, reason)
  values (target_shift_id, current_employee_id(), trim(reason));

  update shifts set employee_id = null where id = target_shift_id;
end;
$$;

revoke all on function report_shift_absence(uuid, text) from public;
grant execute on function report_shift_absence(uuid, text) to authenticated;

alter table notifications_log drop constraint if exists notifications_log_type_check;
alter table notifications_log add constraint notifications_log_type_check
  check (type in (
    'shift_published', 'bake_plan_published', 'announcement',
    'swap_accepted', 'availability_submitted', 'reminder', 'shift_cancelled'
  ));
