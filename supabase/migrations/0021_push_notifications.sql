-- Echte Push-Benachrichtigungen (Web Push), nicht nur die In-App-Glocke:
-- Admin soll benachrichtigt werden, wenn ein Mitarbeiter einen angenommenen
-- Schichttausch zur finalen Bestätigung bereitstellt oder seine Verfügbarkeit
-- einreicht; umgekehrt soll der Admin allen, die ihre Verfügbarkeit noch
-- nicht abgegeben haben, eine Erinnerung schicken können. Die eigentliche
-- Zustellung (VAPID-signierte Web-Push-Nachricht) übernimmt die Edge
-- Function `send-push` — hier nur die Abo-Verwaltung und die neuen
-- Benachrichtigungs-Typen.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index on push_subscriptions (employee_id);

alter table push_subscriptions enable row level security;

-- Jede:r verwaltet ausschließlich das eigene Abo (ein Browser/Gerät je Zeile,
-- `endpoint` ist pro Push-Dienst-Registrierung eindeutig). Lesen braucht
-- niemand über die normale API — der Versand läuft server-seitig über die
-- Edge Function mit dem Service-Role-Key, der RLS ohnehin umgeht.
create policy "push_subscriptions_own" on push_subscriptions for all
  using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id());

alter table notifications_log drop constraint if exists notifications_log_type_check;
alter table notifications_log add constraint notifications_log_type_check
  check (type in (
    'shift_published', 'bake_plan_published', 'announcement',
    'swap_accepted', 'availability_submitted', 'reminder'
  ));
