-- Beispiel-Startdaten — bitte an die echten Verhältnisse anpassen

insert into cake_items (name, default_unit) values
  ('Käsekuchen', 'blech'),
  ('Apfelkuchen', 'blech'),
  ('Schokokuchen', 'blech');

-- Platzhalter-Personalbedarf (0=Mo..6=So; 3=Do, 4=Fr, 5=Sa, 6=So)
insert into staffing_requirements (day_of_week, shift_type, role_tag, required_count) values
  (3, 'frueh', 'kueche', 1),
  (3, 'frueh', 'service', 1),
  (3, 'spaet', null, 2),
  (4, 'frueh', 'kueche', 1),
  (4, 'frueh', 'service', 1),
  (4, 'spaet', null, 2),
  (5, 'frueh', 'kueche', 2),
  (5, 'frueh', 'service', 2),
  (5, 'spaet', null, 3),
  (6, 'frueh', 'kueche', 2),
  (6, 'frueh', 'service', 2),
  (6, 'spaet', null, 2);
