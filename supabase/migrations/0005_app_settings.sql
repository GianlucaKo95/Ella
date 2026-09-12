-- Admin-einstellbare, globale App-Einstellungen (Singleton-Tabelle: genau eine Zeile).
-- Aktuell: an welchem Tag des Monats der Abrechnungszeitraum beginnt (Default: 1. = Kalendermonat).
create table app_settings (
  id boolean primary key default true,
  billing_period_start_day int not null default 1 check (billing_period_start_day between 1 and 28),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into app_settings (id) values (true);

alter table app_settings enable row level security;

create policy "app_settings_select" on app_settings for select
  using (auth.uid() is not null);
create policy "app_settings_update_admin" on app_settings for update
  using (is_admin()) with check (is_admin());
