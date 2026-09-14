-- Strukturierte Zutatenliste je Kuchen (Name, Menge, Einheit, Notiz, Reihenfolge)
-- zusätzlich zum bisherigen Freitext-Feld cake_items.ingredients. Freitext
-- bleibt als Fallback bestehen, falls für einen Kuchen (noch) keine
-- strukturierte Liste hinterlegt ist — Anzeige (Admin-Kuchenliste, neue
-- "Backen"-Ansicht) bevorzugt die strukturierte Liste, wenn vorhanden.
create table cake_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  cake_item_id uuid not null references cake_items (id) on delete cascade,
  sort_order int not null default 0,
  ingredient text not null,
  quantity numeric,
  unit text,
  note text
);

create index on cake_recipe_ingredients (cake_item_id);

alter table cake_recipe_ingredients enable row level security;

-- Gleiches Muster wie cake_items: Lesen für alle angemeldeten Personen
-- (Backplanung + neue Backen-Ansicht brauchen das), Schreiben admin-exklusiv.
create policy "cake_recipe_ingredients_select" on cake_recipe_ingredients for select
  using (auth.uid() is not null);
create policy "cake_recipe_ingredients_write_admin" on cake_recipe_ingredients for all
  using (is_admin()) with check (is_admin());
