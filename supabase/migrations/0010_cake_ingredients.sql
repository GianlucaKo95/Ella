-- Kuchen-Stammdaten um Zutaten ergänzen. recipe_note dient bereits als
-- Backanleitung (freier Text), fehlte bisher nur ein Feld für die Zutaten.
alter table cake_items add column ingredients text;
