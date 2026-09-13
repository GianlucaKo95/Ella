-- Admin-Einstellung: an welchen Wochentagen normalerweise eine Frühschicht
-- stattfindet (meistens nur Sa/So). Steuert nur, an welchen Tagen die
-- Schichtplanung "+ Früh" ohne Weiteres anbietet — an anderen Tagen bleibt
-- eine Frühschicht als bewusste Ausnahme weiterhin manuell anlegbar
-- ("Ausnahme: Frühschicht"-Link), nur eben nicht der Standardfall.
-- Leeres Array ist gültig (nie normalerweise, nur Ausnahmen).
alter table app_settings add column frueh_days smallint[] not null default '{5,6}';
alter table app_settings add constraint app_settings_frueh_days_valid check (
  frueh_days <@ array[0,1,2,3,4,5,6]::smallint[]
);
