-- Kuchen als Favorit markierbar (Kuchen-Verwaltung, Admin-Einstellungen) —
-- erscheinen dadurch im Kuchen-Dropdown der Backplanung zusätzlich oben in
-- einer eigenen "Favoriten"-Gruppe, bleiben aber auch unten in der
-- vollständigen "Kuchen"-Gruppe.
alter table cake_items add column is_favorite boolean not null default false;
