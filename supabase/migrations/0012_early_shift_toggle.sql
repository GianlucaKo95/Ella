-- Admin-Einstellung: gibt es überhaupt eine Frühschicht, oder nur Spätschicht?
-- Steuert nur, ob die Schichtplanung "+ Früh"-Buttons anbietet — bestehende
-- Frühschicht-Einträge bleiben unangetastet, falls die Einstellung später
-- wieder zurückgeschaltet wird.
alter table app_settings add column has_frueh_shift boolean not null default true;
