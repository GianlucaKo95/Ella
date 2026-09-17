-- Feedback: "Das Änderungsprotokoll wird auch nur für Schichten gebraucht
-- die getauscht werden nicht für Schichten die vom Admin geändert wurden."
-- — schlankere Neuauflage des in Migration 0031 komplett entfernten
-- Änderungsprotokolls, diesmal bewusst NICHT als generischer Trigger auf
-- jede Änderung an shifts (das hätte wieder jede Admin-Bearbeitung
-- mitprotokolliert, die die letzte Version genau nicht mehr wollte),
-- sondern als expliziter Insert ausschließlich im Schichttausch-
-- Bestätigungspfad (`confirmSwap()` in AdminPlanning.tsx). Läuft dort in
-- derselben admin-authentifizierten Session wie das eigentliche Update von
-- shifts.employee_id — keine SECURITY DEFINER Funktion nötig, eine einfache
-- admin-only Policy reicht, weil der Insert nie von einer anderen Stelle
-- aus passiert.
create table shift_swap_log (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id) on delete cascade,
  date date not null,
  change_summary text not null,
  changed_at timestamptz not null default now()
);

create index on shift_swap_log (date);

alter table shift_swap_log enable row level security;

create policy "shift_swap_log_admin" on shift_swap_log for all
  using (is_admin()) with check (is_admin());
