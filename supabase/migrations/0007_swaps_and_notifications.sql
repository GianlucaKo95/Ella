-- Workshop-Runde (Architekt/Dev/QS/UX + Nutzer-Perspektive): Schichttausch und
-- echte In-App-Benachrichtigungen (bisher existierte notifications_log nur als
-- leere Vorbereitung ohne Inhalt/Lesezustand und ohne dass Mitarbeiter sie lesen
-- durften).

-- ============================================================
-- notifications_log erweitern: Inhalt + Lesezustand, eigene lesbar/markierbar
-- ============================================================
alter table notifications_log
  add column body text not null default '',
  add column read_at timestamptz;

alter table notifications_log drop constraint if exists notifications_log_type_check;
alter table notifications_log add constraint notifications_log_type_check
  check (type in ('shift_published', 'bake_plan_published', 'announcement'));

drop policy if exists "notifications_log_admin" on notifications_log;
create policy "notifications_log_write_admin" on notifications_log for insert
  with check (is_admin());
create policy "notifications_log_own_select" on notifications_log for select
  using (target_employee_id = current_employee_id() or is_admin());
create policy "notifications_log_own_update" on notifications_log for update
  using (target_employee_id = current_employee_id() or is_admin())
  with check (target_employee_id = current_employee_id() or is_admin());
create policy "notifications_log_admin_delete" on notifications_log for delete
  using (is_admin());

-- ============================================================
-- Schichttausch: Mitarbeiter A bietet eine eigene Schicht einem Kollegen B an;
-- B nimmt an/ab; Admin bestätigt die Übernahme erst final (ändert shifts.employee_id).
-- ============================================================
create table shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id) on delete cascade,
  requested_by uuid not null references employees (id) on delete cascade,
  offered_to uuid not null references employees (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'confirmed', 'cancelled')) default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint swap_not_to_self check (requested_by <> offered_to)
);

create index on shift_swap_requests (shift_id);
create index on shift_swap_requests (requested_by);
create index on shift_swap_requests (offered_to);

-- Wer eine Schicht zum Tausch anbietet, muss aktuell auch wirklich darauf eingeteilt sein.
create or replace function check_swap_request_owner()
returns trigger
language plpgsql
as $$
declare
  current_owner uuid;
begin
  select employee_id into current_owner from shifts where id = NEW.shift_id;
  if current_owner is distinct from NEW.requested_by then
    raise exception 'Nur der aktuell eingeteilte Mitarbeiter kann diese Schicht zum Tausch anbieten';
  end if;
  return NEW;
end;
$$;

create trigger shift_swap_requests_check_owner
  before insert on shift_swap_requests
  for each row execute function check_swap_request_owner();

alter table shift_swap_requests enable row level security;

create policy "shift_swap_select" on shift_swap_requests for select
  using (requested_by = current_employee_id() or offered_to = current_employee_id() or is_admin());
create policy "shift_swap_insert" on shift_swap_requests for insert
  with check (requested_by = current_employee_id());
-- Status-Übergänge werden bewusst nicht einzeln per RLS erzwungen (ebenso wie bei
-- availability_entries "own or admin"), sondern über die UI gesteuert: Anbieter
-- kann stornieren, Empfänger an-/ablehnen, Admin final bestätigen/ablehnen.
create policy "shift_swap_update" on shift_swap_requests for update
  using (requested_by = current_employee_id() or offered_to = current_employee_id() or is_admin())
  with check (requested_by = current_employee_id() or offered_to = current_employee_id() or is_admin());
